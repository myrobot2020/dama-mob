#!/usr/bin/env python3
"""
Attach audio + YouTube metadata (and optional per-segment time bounds) to split sutta JSON files.

Typical use-case:
  - You have a "source" validated JSON (e.g. data/validated-json/sn/sn1/suttas/1.1.json)
    that contains the correct audio fields for a whole talk.
  - You split that talk into multiple per-sutta JSONs (e.g. data/examples/sn_heuristic_split/1.1/sn_1.3.json …).
  - This script copies the audio metadata onto each split JSON and, when possible,
    derives aud_start_s / aud_end_s using the video's .vtt transcript.

Notes:
  - VTT matching is heuristic: it looks for occurrences of the sutta citation like "1.3"
    in subtitle text (not in timestamp lines).
  - If a segment's start can't be detected, it falls back to 0.0 (first segment) or leaves
    aud_start_s/aud_end_s unchanged (other segments).
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
SN_RE = re.compile(r"^\s*SN\s+(\d+)\.(\d+)\s*$", re.I)


def _load_json(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8", errors="replace")
    # Some corpus JSONs may contain raw control chars inside strings (common with
    # copy/pasted transcripts). JSON forbids these unless escaped, so we
    # sanitize *inside string literals only*.
    out_chars: list[str] = []
    in_string = False
    escaped = False
    for ch in raw:
        if not in_string:
            out_chars.append(ch)
            if ch == '"':
                in_string = True
                escaped = False
            continue
        # in_string
        if escaped:
            out_chars.append(ch)
            escaped = False
            continue
        if ch == "\\":
            out_chars.append(ch)
            escaped = True
            continue
        if ch == '"':
            out_chars.append(ch)
            in_string = False
            continue
        if ord(ch) < 0x20:
            if ch == "\n":
                out_chars.append("\\n")
            elif ch == "\r":
                out_chars.append("\\r")
            elif ch == "\t":
                out_chars.append("\\t")
            else:
                out_chars.append(" ")
            continue
        out_chars.append(ch)
    obj = json.loads("".join(out_chars))
    if not isinstance(obj, dict):
        raise SystemExit(f"Expected JSON object in {path}")
    return obj


def _atomic_write_json(path: Path, obj: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _parse_sutta_pair(sutta_id: str) -> tuple[int, int] | None:
    m = SN_RE.match(str(sutta_id or ""))
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


@dataclass(frozen=True)
class Cue:
    start_s: float
    end_s: float
    text: str


_TIME_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$")


def _time_to_s(raw: str) -> float:
    m = _TIME_RE.match(raw.strip())
    if not m:
        raise ValueError(raw)
    hh, mm, ss, ms = (int(m.group(i)) for i in range(1, 5))
    return hh * 3600 + mm * 60 + ss + (ms / 1000.0)


def _strip_vtt_tags(s: str) -> str:
    # Remove inline timestamp tags like <00:19:39.600> and cue-class tags like <c>.
    out = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d{3}>", " ", s)
    out = re.sub(r"</?c[^>]*>", " ", out)
    out = re.sub(r"<[^>]+>", " ", out)
    out = re.sub(r"\s+", " ", out)
    return out.strip()


def _parse_vtt(path: Path) -> list[Cue]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    cues: list[Cue] = []

    i = 0
    # Skip optional header until first blank line (WEBVTT).
    while i < len(lines) and lines[i].strip() != "":
        i += 1
    while i < len(lines) and lines[i].strip() == "":
        i += 1

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Optional numeric cue id line.
        if re.fullmatch(r"\d+", line):
            i += 1
            if i >= len(lines):
                break
            line = lines[i].strip()

        if "-->" not in line:
            i += 1
            continue

        # Time range line: "00:00:00.000 --> 00:00:03.500 ..."
        time_part = line.split("-->", 1)
        left = time_part[0].strip()
        right = time_part[1].strip().split()[0].strip()
        try:
            start_s = _time_to_s(left)
            end_s = _time_to_s(right)
        except ValueError:
            i += 1
            continue

        i += 1
        text_lines: list[str] = []
        while i < len(lines) and lines[i].strip() != "":
            text_lines.append(lines[i].rstrip("\n"))
            i += 1
        text = _strip_vtt_tags(" ".join(text_lines))
        if text:
            cues.append(Cue(start_s=start_s, end_s=end_s, text=text))

        # Skip blank(s) between cues.
        while i < len(lines) and lines[i].strip() == "":
            i += 1

    return cues


def _marker_regex(x: int, y: int) -> re.Pattern[str]:
    # Avoid matching as part of a larger number (e.g. 11.6 shouldn't match 111.60).
    return re.compile(rf"(?<!\d){re.escape(str(x))}\.{re.escape(str(y))}(?!\d)")


def _find_marker_start(cues: list[Cue], x: int, y: int) -> float | None:
    marker = _marker_regex(x, y)
    preferred = re.compile(r"\b(suta|sutta|sutra)\b", re.I)

    fallback: float | None = None
    for cue in cues:
        if not marker.search(cue.text):
            continue
        if fallback is None:
            fallback = cue.start_s
        if preferred.search(cue.text):
            return cue.start_s
    return fallback


def _sorted_split_files(split_dir: Path) -> list[Path]:
    files = [p for p in split_dir.glob("*.json") if p.is_file() and not p.name.startswith("_")]

    def key(p: Path) -> tuple[int, int, str]:
        try:
            obj = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return (999999, 999999, p.name)
        if isinstance(obj, dict):
            pair = _parse_sutta_pair(str(obj.get("sutta_id") or ""))
            if pair:
                return (pair[0], pair[1], p.name)
        m = re.search(r"(\d+)\.(\d+)", p.stem)
        if m:
            return (int(m.group(1)), int(m.group(2)), p.name)
        return (999999, 999999, p.name)

    files.sort(key=key)
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="Source validated JSON (contains audio metadata)")
    ap.add_argument("--split-dir", required=True, help="Directory containing split per-sutta JSON files")
    ap.add_argument(
        "--vtt",
        default="",
        help="Optional VTT file path; default resolves from source youtube_video_id under data/raw/sn/transcripts/",
    )
    ap.add_argument(
        "--output-dir",
        default="",
        help="Output directory (default: in-place modify split-dir files)",
    )
    ap.add_argument(
        "--no-bounds",
        action="store_true",
        help="Skip computing aud_start_s/aud_end_s from VTT; only copy audio fields.",
    )
    args = ap.parse_args()

    source_path = (REPO / args.source).resolve() if not Path(args.source).is_absolute() else Path(args.source)
    split_dir = (REPO / args.split_dir).resolve() if not Path(args.split_dir).is_absolute() else Path(args.split_dir)
    output_dir = (
        (REPO / args.output_dir).resolve()
        if args.output_dir.strip()
        else split_dir
    )

    if not source_path.is_file():
        raise SystemExit(f"Missing source JSON: {source_path}")
    if not split_dir.is_dir():
        raise SystemExit(f"Missing split dir: {split_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    source = _load_json(source_path)
    source_pair = _parse_sutta_pair(str(source.get("sutta_id") or ""))
    aud_file = str(source.get("aud_file") or "").strip()
    aud_end = float(source.get("aud_end_s") or 0.0)
    aud_start_default = float(source.get("aud_start_s") or 0.0)
    youtube_video_id = str(source.get("youtube_video_id") or "").strip()
    youtube_url = str(source.get("youtube_url") or "").strip()
    chain = source.get("chain")

    cues: list[Cue] = []
    vtt_path: Path | None = None
    if not args.no_bounds:
        if args.vtt.strip():
            vtt_path = (REPO / args.vtt).resolve() if not Path(args.vtt).is_absolute() else Path(args.vtt)
        elif youtube_video_id:
            vtt_path = REPO / "data" / "raw" / "sn" / "transcripts" / f"{youtube_video_id}.en.vtt"
        if vtt_path and vtt_path.is_file():
            cues = _parse_vtt(vtt_path)
        else:
            vtt_path = None

    split_files = _sorted_split_files(split_dir)
    if not split_files:
        raise SystemExit(f"No split JSON files found in {split_dir}")

    # First pass: compute starts (when possible).
    starts: dict[Path, float] = {}
    missing: list[Path] = []
    if cues:
        for f in split_files:
            obj = _load_json(f)
            pair = _parse_sutta_pair(str(obj.get("sutta_id") or ""))
            if not pair:
                missing.append(f)
                continue
            # The source JSON's own sutta_id is treated as "segment 1": start at the
            # source start (the talk usually begins before the spoken marker appears).
            if source_pair and pair == source_pair:
                starts[f] = float(aud_start_default)
                continue
            s = _find_marker_start(cues, pair[0], pair[1])
            if s is None:
                missing.append(f)
                continue
            starts[f] = float(s)

    # Second pass: write updated JSONs.
    written = 0
    bounds_written = 0

    # Prepare stable ordering for end computation: use known cue start times, else file order.
    ordered = split_files[:]
    if starts:
        ordered.sort(key=lambda p: (starts.get(p, 1e18), p.name))

    for idx, f in enumerate(ordered):
        obj = _load_json(f)

        # Copy metadata
        if aud_file:
            obj["aud_file"] = aud_file
        if youtube_video_id:
            obj["youtube_video_id"] = youtube_video_id
        if youtube_url:
            obj["youtube_url"] = youtube_url
        if chain is not None:
            obj["chain"] = chain
        obj.setdefault("valid", False)

        # Bounds (optional)
        if not args.no_bounds and cues:
            start = starts.get(f)
            if start is None and idx == 0:
                # First segment in a talk: default to the source start when we can't detect it.
                start = aud_start_default
            if start is not None:
                # Find the next known start strictly after this segment.
                end: float | None = None
                for j in range(idx + 1, len(ordered)):
                    nxt = starts.get(ordered[j])
                    if nxt is not None and nxt > start:
                        end = nxt
                        break
                if end is None:
                    end = aud_end if aud_end > 0 else max((c.end_s for c in cues), default=start)
                obj["aud_start_s"] = round(float(start), 3)
                obj["aud_end_s"] = round(float(end), 3)
                bounds_written += 1

        out_path = output_dir / f.name
        _atomic_write_json(out_path, obj)
        written += 1

    print(
        f"updated={written} bounds_written={bounds_written} "
        f"split_dir={split_dir.relative_to(REPO) if split_dir.is_relative_to(REPO) else split_dir} "
        f"output_dir={output_dir.relative_to(REPO) if output_dir.is_relative_to(REPO) else output_dir} "
        f"vtt={'none' if vtt_path is None else (vtt_path.relative_to(REPO) if vtt_path.is_relative_to(REPO) else vtt_path)} "
        f"missing_marker_starts={len(missing)}"
    )
    if missing:
        print("missing_starts:")
        for m in missing[:20]:
            rel = m.relative_to(REPO) if m.is_relative_to(REPO) else m
            print(f"  - {rel}")
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
