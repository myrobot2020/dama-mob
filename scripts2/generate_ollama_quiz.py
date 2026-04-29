from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path("data/validated-json")
DEFAULT_MODEL = "qwen2.5:14b"
DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def normalize_sutta_id(sutta_id: str) -> str:
    return sutta_id.strip().replace("AN ", "").replace("an ", "")


def find_sutta_json(sutta_id: str) -> Path:
    normalized = normalize_sutta_id(sutta_id)
    candidates = list(ROOT.glob(f"an/**/{normalized}.json"))
    if len(candidates) == 1:
        return candidates[0]
    if candidates:
        return sorted(candidates)[0]
    raise FileNotFoundError(f"Could not find validated JSON for {sutta_id}")


def build_prompt(raw: dict[str, Any]) -> str:
    sutta_id = _text(raw.get("sutta_id"))
    name_en = _text(raw.get("sutta_name_en"))
    sutta = _text(raw.get("sutta"))
    commentary = _text(raw.get("commentary") or raw.get("commentry"))
    chain = raw.get("chain") or {}
    chain_text = json.dumps(chain, ensure_ascii=False)
    return f"""
You generate one Dhamma learning MCQ for a mobile app.

Use the sutta and teacher commentary below. Prefer the commentary when choosing the teacher-aligned answer.

Return ONLY valid JSON with this exact shape:
{{
  "suttaId": "AN {sutta_id}",
  "quote": "short quote or faithful paraphrase, max 28 words",
  "options": [
    {{"id": "kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "kebab-id", "title": "2-5 words", "body": "one short sentence"}}
  ],
  "goldOptionId": "id of the teacher-aligned option",
  "teacherSummary": "2-4 sentences, plain English, summarizing what the teacher says"
}}

Rules:
- Exactly 4 options.
- One option must be clearly teacher-aligned.
- Other options must be plausible but wrong or too narrow.
- The wrong options must disagree with, overstate, or narrow the teacher's point.
- Option ids must describe the option, for example "respect-aryans" or "avoid-abuse".
- Never use placeholder ids like "kebab-id" or "option-1".
- Do not include audio fields.
- Keep the teacherSummary under 90 words.
- Do not invent claims beyond the sutta/commentary.
- Keep language simple and direct.

Sutta id: AN {sutta_id}
English name: {name_en}
Chain: {chain_text}

SUTTA:
{sutta}

TEACHER COMMENTARY:
{commentary}
""".strip()


def call_ollama(prompt: str, model: str, url: str, timeout_s: int) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.2,
            "num_ctx": 8192,
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
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            outer = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Ollama request failed: {exc}") from exc
    return _text(outer.get("response"))


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "option"


def validate_quiz(value: dict[str, Any]) -> dict[str, Any]:
    required = ["suttaId", "quote", "options", "goldOptionId", "teacherSummary"]
    for key in required:
        if key not in value:
            raise ValueError(f"Missing required key: {key}")
    options = value.get("options")
    if not isinstance(options, list) or len(options) != 4:
        raise ValueError("Expected exactly 4 options")
    seen: set[str] = set()
    clean_options: list[dict[str, str]] = []
    for idx, option in enumerate(options, start=1):
        if not isinstance(option, dict):
            raise ValueError(f"Option {idx} is not an object")
        title = _text(option.get("title"))
        body = _text(option.get("body"))
        oid = _slug(_text(option.get("id")) or title)
        if oid in {"kebab-id", "option", "option-1", "id"}:
            oid = _slug(title)
        if not title or not body:
            raise ValueError(f"Option {idx} needs title and body")
        while oid in seen:
            oid = f"{oid}-{idx}"
        seen.add(oid)
        clean_options.append({"id": oid, "title": title, "body": body})

    gold = _slug(_text(value.get("goldOptionId")))
    if gold not in seen:
        titles = {option["title"].lower(): option["id"] for option in clean_options}
        gold = titles.get(_text(value.get("goldOptionId")).lower(), gold)
    if gold not in seen:
        raise ValueError(f"goldOptionId does not match an option id: {value.get('goldOptionId')}")

    return {
        "suttaId": _text(value["suttaId"]),
        "quote": _text(value["quote"]),
        "options": clean_options,
        "goldOptionId": gold,
        "teacherSummary": _text(value["teacherSummary"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate one MCQ draft from local Ollama.")
    parser.add_argument("sutta_id", help="Sutta id, e.g. AN 11.6")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--timeout-s", type=int, default=180)
    parser.add_argument("--out-dir", default="data/generated/ollama-quizzes")
    parser.add_argument(
        "--merge-source",
        action="store_true",
        help="Also write the validated quiz into the source sutta JSON under the 'quiz' key.",
    )
    args = parser.parse_args()

    src = find_sutta_json(args.sutta_id)
    raw = json.loads(src.read_text(encoding="utf-8"))
    prompt = build_prompt(raw)
    response = call_ollama(prompt, args.model, args.url, args.timeout_s)
    quiz = validate_quiz(json.loads(response))

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{normalize_sutta_id(args.sutta_id)}.json"
    out_path.write_text(json.dumps(quiz, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    if args.merge_source:
        raw["quiz"] = quiz
        src.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Merged quiz into {src}")
    print(json.dumps(quiz, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
