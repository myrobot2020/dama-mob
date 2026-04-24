#!/usr/bin/env python3
"""
Extract doctrinal chains from scoped sutta JSON files using a local Ollama model.

Design:
    Scan sutta JSON files
    -> filter eligible records
    -> skip existing chain unless --force
    -> POST to Ollama /api/chat
    -> validate chain output
    -> atomically write updated JSON

Default behavior:
    - Book 11 convenience mode resolves to an11/suttas/*.json excluding _index.json
    - Requires non-empty: sutta, commentary, aud_file
    - Requires aud_start_s and aud_end_s by default for alignment consistency
    - Anguttara Nikaya: chain must have exactly N items where N is the book number
      parsed from sutta_id (e.g. 10.2 -> Book 10). Otherwise has_chain must be false
      and nothing is written (--no-require-book-length disables this).
    - Skips files that already contain a non-null chain unless --force is used
    - Uses OLLAMA_HOST env var if present, else http://127.0.0.1:11434
    - Uses --model if given, else OLLAMA_MODEL env var, else llama3.2:3b
    - Optional rolling few-shot (--rolling-examples N): after each successful WRITE,
      up to N prior chains from the same Anguttara book are appended to the system
      prompt for subsequent files in the same run.

Examples:
    # Dry-run on Book 11
    python scripts2/10_keys.py --book 11 --dry-run

    # Force regeneration on Book 11
    python scripts2/10_keys.py --book 11 --force

    # Run with explicit glob
    python scripts2/10_keys.py --pattern "an11/suttas/*.json"

    # Multiple books (9 then 8 …), no in-run rolling few-shot, tallies per book + final
    python scripts2/10_keys.py --books "9,8,7,6,5,4,3" --rolling-examples 0 --model llama3:latest

    # Second pass: regenerate all, seed few-shot from existing on-disk chains per book, then rolling updates
    python scripts2/10_keys.py --books "9,8,7,6,5,4,3" --force --seed-examples 3 --rolling-examples 3 --model llama3:latest

    # Custom model / host
    OLLAMA_MODEL=llama3.2:3b python scripts2/10_keys.py --book 11
    OLLAMA_HOST=http://127.0.0.1:11434 python scripts2/10_keys.py --book 11

Hardware note:
    ~4 GB VRAM: prefer small instruct models, ideally quantized 3B-class.
    ~22 GB RAM: CPU fallback is acceptable for small batches if GPU runs OOM.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable


DEFAULT_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")


SYSTEM_PROMPT = """You extract explicit doctrinal chains from Buddhist sutta records (Anguttara Nikaya).

Rules:
1. Primary source is the sutta text.
2. Use commentary only to disambiguate ASR errors or clarify wording.
3. Anguttara is organized by number: Book N gives discourses framed as N-fold sets. A useful chain for this corpus is exactly ONE list of N items when the sutta presents that N-fold teaching. chain.count and len(items) must equal N.
4. If the sutta mixes a different number of factors (e.g. 3 plus 7) or has no single list of exactly N items, return has_chain false — do not output a shorter or longer list.
5. Do not invent missing items from outside knowledge.
6. Preserve original wording as much as possible, with only light cleanup for spelling/punctuation.
7. If there is no single clear chain of exactly N items (see user message for N), return has_chain false.
8. Return exactly one JSON object and nothing else.

Required JSON shape:
{
  "has_chain": true,
  "chain": {
    "items": ["..."],
    "count": N,
    "is_ordered": true,
    "category": "short label"
  }
}

If no suitable chain:
{
  "has_chain": false
}
""".strip()


USER_TEMPLATE = """Extract a single explicit chain from this sutta record.

{anguttara_book_line}sutta_id: {sutta_id}

SUTTA:
{sutta}

COMMENTARY:
{commentary}

Return JSON only.
""".strip()


USER_TEMPLATE_PRIMARY_ONLY = """Extract a single explicit chain from this sutta record.

{anguttara_book_line}sutta_id: {sutta_id}

SUTTA:
{sutta}

Return JSON only.
""".strip()


REPAIR_SYSTEM_PROMPT = """You repair malformed JSON.

Return exactly one valid JSON object matching the requested schema.
Do not add markdown fences.
Do not add commentary.
""".strip()


class RollingFewShot:
    """
    Keeps validated chain outputs from the current batch, per Anguttara book number,
    for few-shot conditioning on later API calls in the same process.
    """

    def __init__(self, max_per_book: int) -> None:
        self._max = max_per_book
        self._by_book: dict[int, list[dict[str, Any]]] = {}

    def record_write(self, book_num: int | None, sutta_id: str, chain: dict[str, Any]) -> None:
        if self._max <= 0 or book_num is None:
            return
        lst = self._by_book.setdefault(book_num, [])
        lst.append({"sutta_id": sutta_id, "chain": json.loads(json.dumps(chain))})
        while len(lst) > self._max:
            lst.pop(0)

    def system_prompt_suffix(self, book_num: int | None) -> str:
        if self._max <= 0 or book_num is None:
            return ""
        lst = self._by_book.get(book_num, [])
        if not lst:
            return ""
        lines = [
            f"Validated examples (repo seed and/or earlier in this run; Anguttara Book {book_num}; "
            "same item count as book number). Mimic tone and JSON shape:",
        ]
        for i, ex in enumerate(lst, 1):
            blob = {"has_chain": True, "chain": ex["chain"]}
            lines.append(f"{i}. sutta_id={ex['sutta_id']} => {json.dumps(blob, ensure_ascii=False)}")
        return "\n".join(lines)


def compose_system_prompt(extra_suffix: str) -> str:
    extra_suffix = extra_suffix.strip()
    if not extra_suffix:
        return SYSTEM_PROMPT
    return SYSTEM_PROMPT + "\n\n" + extra_suffix + "\n"


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract chain objects from sutta JSON files using Ollama.")
    parser.add_argument("--root", default=".", help="Repo root. Default: current directory.")
    parser.add_argument(
        "--pattern",
        default=None,
        help='Glob pattern relative to --root, e.g. "an11/suttas/*.json".',
    )
    parser.add_argument(
        "--book",
        type=int,
        default=None,
        help="Convenience selector. For example --book 11 resolves to an11/suttas/*.json.",
    )
    parser.add_argument(
        "--books",
        default=None,
        metavar="LIST",
        help='Process multiple books in order, e.g. "9,8,7,6,5,4,3" → an9/suttas, then an8/suttas, …',
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f'Ollama model name. Default: env OLLAMA_MODEL or "{DEFAULT_MODEL}".',
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_OLLAMA_HOST,
        help=f'Ollama host. Default: env OLLAMA_HOST or "{DEFAULT_OLLAMA_HOST}".',
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate chain even if an existing non-null chain is present.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print eligible files and payload sizes without calling Ollama or writing.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="HTTP timeout in seconds. Default: 120.",
    )
    parser.add_argument(
        "--no-require-audio-times",
        action="store_true",
        help="Do not require aud_start_s and aud_end_s.",
    )
    parser.add_argument(
        "--primary-only",
        action="store_true",
        help="Omit commentary from the model prompt (sutta text only).",
    )
    parser.add_argument(
        "--no-require-book-length",
        action="store_true",
        help="Do not require chain.count/items to equal AN book number from sutta_id.",
    )
    parser.add_argument(
        "--rolling-examples",
        type=int,
        default=3,
        metavar="N",
        help="After each WRITE, include up to N prior chains from this batch (same book) in the system prompt. 0 disables.",
    )
    parser.add_argument(
        "--seed-examples",
        type=int,
        default=0,
        metavar="N",
        help="Before each book, load up to N on-disk chains (matching book length) into few-shot. "
        "Requires a non-zero few-shot buffer (see --rolling-examples). Default 0.",
    )
    return parser.parse_args()


def parse_book_list_csv(s: str) -> list[int]:
    out: list[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        out.append(int(part))
    return out


def build_jobs(args: argparse.Namespace) -> list[tuple[int | None, str]]:
    modes = sum(1 for x in (args.pattern, args.book, args.books) if x is not None and x != "")
    if modes > 1:
        raise SystemExit("Use only one of: --pattern, --book, or --books.")
    if args.pattern:
        return [(None, args.pattern)]
    if args.books:
        nums = parse_book_list_csv(args.books)
        if not nums:
            raise SystemExit("--books requires at least one number.")
        return [(n, f"an{n}/suttas/*.json") for n in nums]
    if args.book is not None:
        return [(args.book, f"an{args.book}/suttas/*.json")]
    raise SystemExit("Provide --book, --pattern, or --books.")


def iter_target_files(root: Path, pattern: str) -> Iterable[Path]:
    for path in sorted(root.glob(pattern)):
        if path.name == "_index.json":
            continue
        if path.is_file():
            yield path


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected top-level JSON object")
    return data


def has_nonempty_string(obj: dict[str, Any], key: str) -> bool:
    value = obj.get(key)
    return isinstance(value, str) and value.strip() != ""


def has_number(obj: dict[str, Any], key: str) -> bool:
    value = obj.get(key)
    return isinstance(value, (int, float))


def eligible_record(obj: dict[str, Any], require_audio_times: bool) -> tuple[bool, str]:
    required_text = ("sutta", "commentary", "aud_file")
    for key in required_text:
        if not has_nonempty_string(obj, key):
            return False, f"missing/non-empty {key}"

    if require_audio_times:
        for key in ("aud_start_s", "aud_end_s"):
            if not has_number(obj, key):
                return False, f"missing numeric {key}"

    return True, "ok"


def parse_anguttara_book_num(sutta_id: str) -> int | None:
    """First dotted segment of sutta_id is the AN book number (e.g. 10.101 -> 10, 8.2.12 -> 8)."""
    if not sutta_id or not isinstance(sutta_id, str):
        return None
    parts = sutta_id.strip().split(".")
    if not parts:
        return None
    try:
        return int(parts[0])
    except ValueError:
        return None


def anguttara_chain_matches_book(obj: dict[str, Any], book_num: int | None) -> bool:
    """True if chain is non-empty and len(items) == AN book number (and count consistent when present)."""
    if book_num is None or book_num < 1:
        return False
    ch = obj.get("chain")
    if not isinstance(ch, dict):
        return False
    items = ch.get("items")
    if not isinstance(items, list) or not items:
        return False
    if not all(isinstance(x, str) and x.strip() for x in items):
        return False
    if len(items) != book_num:
        return False
    count = ch.get("count")
    if isinstance(count, int) and count != book_num:
        return False
    if isinstance(count, int) and count != len(items):
        return False
    return True


def is_record_valid(obj: dict[str, Any]) -> bool:
    """
    General validation for any Nikaya (AN, SN, MN, DN, etc.).
    Requires: sutta text, commentary, audio file + times, and English title.
    For Anguttara Nikaya, also enforces that the chain length matches the book number.
    """
    ok, _ = eligible_record(obj, require_audio_times=True)
    if not ok:
        return False
    if not has_nonempty_string(obj, "sutta_name_en"):
        return False

    sid = str(obj.get("sutta_id") or "").strip()
    if sid.lower().startswith("an"):
        # For AN, we strictly require the chain to match the book number
        book_num = parse_anguttara_book_num(sid)
        return anguttara_chain_matches_book(obj, book_num)

    # For other nikayas (SN, etc.), we currently accept any non-empty chain if present,
    # or even no chain if it's otherwise valid (depending on app needs).
    # But usually 'valid: true' in the index means it's "ready for prime time".
    # For now, let's say if it has the required fields from eligible_record and a name, it's valid.
    return True


def an_record_valid(obj: dict[str, Any]) -> bool:
    """Deprecated: use is_record_valid instead."""
    return is_record_valid(obj)


def anguttara_book_prompt_line(book_num: int | None) -> str:
    if book_num is None:
        return ""
    return (
        f"Anguttara Nikaya Book {book_num}: output a chain only if the sutta gives "
        f"one clear list of exactly {book_num} items; count and items length must be {book_num}. "
        f"If not, return has_chain false.\n\n"
    )


def should_skip_existing_chain(obj: dict[str, Any], force: bool) -> bool:
    if force:
        return False
    return "chain" in obj and obj.get("chain") is not None


def build_user_prompt(obj: dict[str, Any], *, primary_only: bool, book_num: int | None) -> str:
    line = anguttara_book_prompt_line(book_num)
    if primary_only:
        return USER_TEMPLATE_PRIMARY_ONLY.format(
            anguttara_book_line=line,
            sutta_id=obj.get("sutta_id", ""),
            sutta=obj.get("sutta", "").strip(),
        )
    return USER_TEMPLATE.format(
        anguttara_book_line=line,
        sutta_id=obj.get("sutta_id", ""),
        sutta=obj.get("sutta", "").strip(),
        commentary=obj.get("commentary", "").strip(),
    )


def post_ollama_chat(host: str, model: str, system_prompt: str, user_prompt: str, timeout: int) -> str:
    url = host.rstrip("/") + "/api/chat"
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "options": {
            "temperature": 0,
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Ollama at {url}: {exc}") from exc

    try:
        decoded = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ollama returned non-JSON response: {body[:500]}") from exc

    message = decoded.get("message")
    if not isinstance(message, dict):
        raise RuntimeError(f"Ollama response missing message object: {decoded}")
    content = message.get("content")
    if not isinstance(content, str):
        raise RuntimeError(f"Ollama response missing message.content string: {decoded}")
    return content


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_model_json(text: str) -> dict[str, Any]:
    cleaned = strip_code_fences(text)
    return json.loads(cleaned)


def repair_json_with_ollama(host: str, model: str, bad_text: str, timeout: int) -> dict[str, Any]:
    repaired = post_ollama_chat(
        host=host,
        model=model,
        system_prompt=REPAIR_SYSTEM_PROMPT,
        user_prompt=bad_text,
        timeout=timeout,
    )
    return parse_model_json(repaired)


def validate_chain_payload(
    payload: dict[str, Any],
    *,
    book_num: int | None = None,
    require_book_length: bool = False,
) -> tuple[bool, str]:
    has_chain = payload.get("has_chain")
    if not isinstance(has_chain, bool):
        return False, "missing boolean has_chain"

    if not has_chain:
        return True, "no chain"

    chain = payload.get("chain")
    if not isinstance(chain, dict):
        return False, "has_chain true but missing chain object"

    items = chain.get("items")
    count = chain.get("count")
    is_ordered = chain.get("is_ordered")
    category = chain.get("category")

    if not isinstance(items, list) or not items:
        return False, "chain.items must be non-empty list"
    if not all(isinstance(x, str) and x.strip() for x in items):
        return False, "chain.items must contain non-empty strings"
    if not isinstance(count, int) or count <= 0:
        return False, "chain.count must be positive int"
    if len(items) != count:
        return False, f"len(items)={len(items)} does not match count={count}"
    if not isinstance(is_ordered, bool):
        return False, "chain.is_ordered must be boolean"
    if not isinstance(category, str) or not category.strip():
        return False, "chain.category must be non-empty string"

    if require_book_length and book_num is not None and count != book_num:
        return (
            False,
            f"chain must have {book_num} items for AN book {book_num}, got count={count}",
        )

    return True, "ok"


def seed_rolling_from_repo(
    root: Path,
    book_num: int,
    rolling: RollingFewShot,
    max_seed: int,
    require_book_length: bool,
) -> int:
    """Load up to max_seed validated on-disk chains for one book into the rolling buffer."""
    if max_seed <= 0:
        return 0
    pattern = f"an{book_num}/suttas/*.json"
    seeded = 0
    for path in sorted(root.glob(pattern)):
        if path.name == "_index.json":
            continue
        if seeded >= max_seed:
            break
        try:
            obj = load_json(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        chain = obj.get("chain")
        if not isinstance(chain, dict):
            continue
        sid = str(obj.get("sutta_id", ""))
        payload: dict[str, Any] = {"has_chain": True, "chain": chain}
        ok, _ = validate_chain_payload(
            payload,
            book_num=book_num,
            require_book_length=require_book_length,
        )
        if not ok:
            continue
        rolling.record_write(book_num, sid, chain)
        seeded += 1
    return seeded


def new_summary() -> dict[str, int]:
    return {"DRY": 0, "SKIP": 0, "WRITE": 0, "OK": 0, "ERROR": 0}


def accumulate_result(result: str, summary: dict[str, int]) -> None:
    head = result.split(maxsplit=1)[0]
    if head in summary:
        summary[head] += 1
    else:
        summary["ERROR"] += 1


def format_summary_line(prefix: str, summary: dict[str, int]) -> str:
    return prefix + " " + " ".join(f"{k}={v}" for k, v in summary.items())


def atomic_write_json(path: Path, obj: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=str(path.parent),
        delete=False,
        newline="\n",
    ) as tmp:
        json.dump(obj, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def process_file(
    path: Path,
    *,
    host: str,
    model: str,
    timeout: int,
    force: bool,
    dry_run: bool,
    require_audio_times: bool,
    primary_only: bool,
    require_book_length: bool,
    rolling: RollingFewShot | None,
    record_rolling: bool,
) -> str:
    try:
        obj = load_json(path)
    except Exception as exc:
        return f"ERROR {path}: load failed: {exc}"

    ok, reason = eligible_record(obj, require_audio_times=require_audio_times)
    if not ok:
        return f"SKIP  {path}: {reason}"

    book_num = parse_anguttara_book_num(str(obj.get("sutta_id", "")))
    if require_book_length and book_num is None:
        return f"SKIP  {path}: sutta_id missing numeric book prefix (cannot enforce AN book length)"

    if should_skip_existing_chain(obj, force=force):
        return f"SKIP  {path}: existing chain"

    user_prompt = build_user_prompt(obj, primary_only=primary_only, book_num=book_num)
    approx_bytes = len(user_prompt.encode("utf-8"))

    if dry_run:
        return f"DRY   {path}: would process, prompt_bytes={approx_bytes}, model={model}"

    rolling_suffix = rolling.system_prompt_suffix(book_num) if rolling else ""
    system_prompt = compose_system_prompt(rolling_suffix)

    try:
        raw = post_ollama_chat(
            host=host,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            timeout=timeout,
        )
        try:
            payload = parse_model_json(raw)
        except json.JSONDecodeError:
            payload = repair_json_with_ollama(
                host=host,
                model=model,
                bad_text=raw,
                timeout=timeout,
            )
    except Exception as exc:
        return f"ERROR {path}: Ollama failed: {exc}"

    rb = require_book_length
    valid, why = validate_chain_payload(payload, book_num=book_num, require_book_length=rb)
    if not valid:
        try:
            book_rule = ""
            if rb and book_num is not None:
                book_rule = (
                    f"- If has_chain true, chain must have exactly {book_num} items "
                    f"(Anguttara book {book_num}); count must be {book_num}.\n"
                    "- If that is impossible, set has_chain false.\n"
                )
            repair_prompt = (
                "Repair this into valid JSON only. Ensure:\n"
                "- has_chain is boolean\n"
                "- if has_chain true, chain.items length equals chain.count\n"
                "- chain.count positive int\n"
                "- chain.is_ordered boolean\n"
                "- chain.category non-empty string\n"
                f"{book_rule}\n"
                f"{json.dumps(payload, ensure_ascii=False)}"
            )
            payload = repair_json_with_ollama(
                host=host,
                model=model,
                bad_text=repair_prompt,
                timeout=timeout,
            )
            valid, why = validate_chain_payload(payload, book_num=book_num, require_book_length=rb)
        except Exception as exc:
            return f"ERROR {path}: validation failed ({why}); repair failed: {exc}"

    if not valid:
        if rb and book_num is not None and "AN book" in why:
            return f"OK    {path}: rejected ({why})"
        return f"ERROR {path}: validation failed: {why}"

    if payload.get("has_chain") is not True:
        return f"OK    {path}: no clear chain returned"

    obj["chain"] = payload["chain"]
    obj["valid"] = an_record_valid(obj)

    try:
        atomic_write_json(path, obj)
    except Exception as exc:
        return f"ERROR {path}: write failed: {exc}"

    chain = payload["chain"]
    if rolling and record_rolling:
        rolling.record_write(book_num, str(obj.get("sutta_id", "")), chain)

    return f"WRITE {path}: chain.count={chain['count']}, category={chain['category']}"


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    jobs = build_jobs(args)

    require_audio_times = not args.no_require_audio_times
    require_book_length = not args.no_require_book_length

    buf_size = max(args.rolling_examples, args.seed_examples)
    rolling: RollingFewShot | None = RollingFewShot(buf_size) if buf_size > 0 else None
    record_rolling = args.rolling_examples > 0

    total = new_summary()

    for book_num, pattern in jobs:
        files = list(iter_target_files(root, pattern))
        label = f"book_{book_num}" if book_num is not None else pattern
        if not files:
            eprint(f"No files found for {label}; skipping.")
            continue

        if book_num is not None and rolling and args.seed_examples > 0:
            n = seed_rolling_from_repo(
                root,
                book_num,
                rolling,
                args.seed_examples,
                require_book_length,
            )
            eprint(f"SEED book {book_num}: loaded {n} chain(s) from repo (max {args.seed_examples}).")

        book_summary = new_summary()
        eprint(f"=== {label} ({len(files)} files) ===")

        for path in files:
            result = process_file(
                path,
                host=args.host,
                model=args.model,
                timeout=args.timeout,
                force=args.force,
                dry_run=args.dry_run,
                require_audio_times=require_audio_times,
                primary_only=args.primary_only,
                require_book_length=require_book_length,
                rolling=rolling,
                record_rolling=record_rolling,
            )
            print(result, flush=True)
            accumulate_result(result, book_summary)
            accumulate_result(result, total)

        print(format_summary_line(f"BOOK_SUMMARY {label}", book_summary), flush=True)

    print(format_summary_line("SUMMARY_ALL", total), flush=True)

    return 0 if total["ERROR"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
