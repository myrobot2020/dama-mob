import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import sys

# Ensure repo-root modules (e.g. an1_build_index.py) are importable when this script
# is executed from under aud/.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _norm_suttaid_to_an(suttaid: str) -> str:
    s = _norm_space(suttaid)
    if not s:
        return ""
    s = re.sub(r"^AN\s*", "AN ", s, flags=re.I).strip()
    if re.match(r"^\d", s):
        s = "AN " + s
    return s


def _an_to_can(an_id: str) -> str:
    an_id = _norm_suttaid_to_an(an_id)
    if an_id.upper().startswith("AN "):
        return "cAN " + an_id[3:].strip()
    return "cAN " + an_id


def _load_whisperx_segments(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    segs = data.get("segments") or []
    out: List[Dict[str, Any]] = []
    for s in segs:
        try:
            start = float(s.get("start"))
            end = float(s.get("end"))
        except Exception:
            continue
        text = _norm_space(str(s.get("text") or ""))
        if not text:
            continue
        out.append({"start": start, "end": end, "text": text})
    return out


def _pick_anchors(text: str, *, n_words: int = 14) -> List[str]:
    words = re.findall(r"[A-Za-z0-9']+", text.lower())
    if len(words) < n_words:
        t = _norm_space(text.lower())
        return [t] if t else []

    def window(i: int) -> str:
        return " ".join(words[i : i + n_words])

    a0 = window(0)
    mid_i = max(0, (len(words) // 2) - (n_words // 2))
    a1 = window(mid_i)
    a2 = window(max(0, len(words) - n_words))
    seen = set()
    out = []
    for a in (a0, a1, a2):
        if a and a not in seen:
            seen.add(a)
            out.append(a)
    return out


def _fuzzy_token_set_ratio(a: str, b: str) -> int:
    """
    Lightweight token-set similarity to avoid extra deps.
    0..100.
    """
    ta = set(re.findall(r"[a-z0-9']+", a.lower()))
    tb = set(re.findall(r"[a-z0-9']+", b.lower()))
    if not ta or not tb:
        return 0
    inter = ta & tb
    # precision-like score; bias toward overlap
    score = int(100 * (2 * len(inter) / (len(ta) + len(tb))))
    return max(0, min(100, score))


def _best_segment_match(segments: List[Dict[str, Any]], anchor: str) -> Tuple[int, int]:
    best_i = -1
    best = -1
    al = anchor.lower()
    for i, s in enumerate(segments):
        sc = _fuzzy_token_set_ratio(al, s["text"])
        if sc > best:
            best = sc
            best_i = i
    return best_i, best


def match_commentary_to_bounds(
    segments: List[Dict[str, Any]],
    commentary_text: str,
    *,
    min_score: int = 60,
    widen: int = 1,
) -> Optional[Tuple[float, float, Dict[str, Any]]]:
    txt = _norm_space(commentary_text)
    if not txt:
        return None

    anchors = _pick_anchors(txt)
    if not anchors:
        return None

    hits = []
    for a in anchors:
        i, sc = _best_segment_match(segments, a)
        hits.append((i, sc, a))

    strong = [(i, sc, a) for (i, sc, a) in hits if i >= 0 and sc >= min_score]
    if len(strong) < 2:
        return None

    idxs = sorted(i for i, _, _ in strong)
    lo = max(0, idxs[0] - widen)
    hi = min(len(segments) - 1, idxs[-1] + widen)

    start_s = float(segments[lo]["start"])
    end_s = float(segments[hi]["end"])
    meta = {
        "anchors_used": [{"anchor": a, "seg_index": i, "score": sc} for (i, sc, a) in strong],
        "segment_range": [lo, hi],
    }
    return start_s, end_s, meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--an1_json", default="an1.json")
    ap.add_argument("--whisperx_json", required=True)
    ap.add_argument("--mp3_file", required=True, help="Path under /aud/ (e.g. '001_foo.mp3' or 'yt/001_foo.mp3')")
    ap.add_argument("--out_map", default=r"aud\audio_map.json")
    ap.add_argument("--min_score", type=int, default=60)
    ap.add_argument("--widen", type=int, default=1)
    args = ap.parse_args()

    an1_path = Path(args.an1_json)
    wx_path = Path(args.whisperx_json)
    out_path = Path(args.out_map)

    segments = _load_whisperx_segments(wx_path)
    if not segments:
        raise SystemExit(f"No segments found in {wx_path}")

    raw_items = an1_path.read_text(encoding="utf-8", errors="ignore")
    try:
        items = json.loads(raw_items)
    except json.JSONDecodeError:
        # an*.json in this repo is sometimes "JSON-ish" (raw newlines inside strings).
        # Reuse the project's lenient parser so we can still build boundaries.
        try:
            from an1_build_index import _extract_records_fallback, _parse_json_lenient  # type: ignore

            try:
                items = _parse_json_lenient(raw_items)
            except Exception:
                items = _extract_records_fallback(raw_items)
        except Exception as e:
            raise SystemExit(f"Failed to parse {an1_path}: {e}") from e
    if not isinstance(items, list):
        raise SystemExit(f"{an1_path} must be a JSON list")

    audio_map: Dict[str, Any] = {}
    if out_path.is_file():
        try:
            audio_map = json.loads(out_path.read_text(encoding="utf-8"))
        except Exception:
            audio_map = {}

    matched = 0
    tried = 0

    for it in items:
        if not isinstance(it, dict):
            continue
        sid = _norm_suttaid_to_an(str(it.get("suttaid") or ""))
        comm = str(it.get("commentry") or "")
        if not sid or not comm.strip():
            continue

        tried += 1
        key = _an_to_can(sid)

        res = match_commentary_to_bounds(
            segments,
            comm,
            min_score=int(args.min_score),
            widen=int(args.widen),
        )
        if not res:
            continue

        start_s, end_s, meta = res
        audio_map[key] = {
            "file": args.mp3_file,
            "start_s": round(start_s, 2),
            "end_s": round(end_s, 2),
            "source": "whisperx+simple_fuzzy",
            "debug": meta,
        }
        matched += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(audio_map, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Segments: {len(segments)}")
    print(f"Tried commentaries: {tried}")
    print(f"Matched: {matched}")
    print(f"Wrote: {out_path} (total keys now: {len(audio_map)})")


if __name__ == "__main__":
    main()

