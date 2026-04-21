#!/usr/bin/env python3
"""
Heuristic splitter for SN teacher JSON files.

Reads source files under:
  data/validated-json/sn/sn1/suttas/

Writes split outputs into a separate folder by source file, so the current
corpus JSONs stay untouched:
  data/examples/sn_heuristic_split/<source-stem>/sn_<x>.<y>.json

Each output is intentionally minimal for the first pass:
  {
    "sutta_id": "SN x.y",
    "sutta": "..."
  }

Also writes a sanity report at:
  data/examples/sn_heuristic_split/_report.json
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from config import EXAMPLES_ROOT

REPO = Path(__file__).resolve().parents[1]
SOURCE_DIR = REPO / "data" / "validated-json" / "sn" / "sn1" / "suttas"
OUTPUT_DIR = EXAMPLES_ROOT / "sn_heuristic_split"

PAIR_RE = re.compile(r"\b(\d{1,3})\.(\d{1,3})\b")
MIN_SEGMENT_CHARS = 80


@dataclass
class Boundary:
    x: int
    y: int
    raw: str
    start: int


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def combined_text(obj: dict) -> str:
    sutta = str(obj.get("sutta") or "").strip()
    commentary = str(obj.get("commentary") or "").strip()
    return (sutta + " " + commentary).strip()


def first_sutta_text(obj: dict) -> str:
    return str(obj.get("sutta") or "").strip()


def commentary_text(obj: dict) -> str:
    return str(obj.get("commentary") or "").strip()


def source_sutta_pair(obj: dict) -> tuple[int, int] | None:
    raw = str(obj.get("sutta_id") or "").strip()
    m = re.match(r"SN\s+(\d+)\.(\d+)$", raw, flags=re.I)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def trim_first_sutta_block(text: str) -> str:
    t = text.strip()
    if not t:
        return ""
    low = t.lower()
    start_phrase = "thus have i heard"
    end_phrase = "end of the suta"
    i = low.find(start_phrase)
    j = low.find(end_phrase, i if i >= 0 else 0)
    if i >= 0 and j >= 0 and j > i:
        return t[i : j + len(end_phrase)].strip()
    if i >= 0:
        return t[i:].strip()
    return t


def expected_x(obj: dict, path: Path) -> int | None:
    chain = obj.get("chain")
    if isinstance(chain, dict):
        items = chain.get("items")
        if isinstance(items, list):
            for item in items:
                raw = str(item).strip()
                if re.fullmatch(r"\d{1,3}", raw):
                    return int(raw)
    name = path.stem
    m = re.match(r"(\d+)\.", name)
    if m:
        return int(m.group(1))
    return None


def detect_boundaries(text: str, target_x: int | None, min_y_exclusive: int | None = None) -> tuple[list[Boundary], list[str]]:
    accepted: list[Boundary] = []
    warnings: list[str] = []
    last_y: int | None = None

    for match in PAIR_RE.finditer(text):
        x = int(match.group(1))
        y = int(match.group(2))
        raw = match.group(0)

        if target_x is not None and x != target_x:
            warnings.append(f"ignored foreign x match {raw}")
            continue

        if min_y_exclusive is not None and y <= min_y_exclusive:
            warnings.append(f"ignored non-forward match {raw}")
            continue

        if last_y is None:
            accepted.append(Boundary(x=x, y=y, raw=raw, start=match.start()))
            last_y = y
            continue

        if y == last_y:
            warnings.append(f"ignored repeated match {raw}")
            continue

        if y > last_y:
            accepted.append(Boundary(x=x, y=y, raw=raw, start=match.start()))
            last_y = y
            continue

        warnings.append(f"ignored backward match {raw}")

    return accepted, warnings


def slice_segments(text: str, boundaries: list[Boundary]) -> list[tuple[Boundary, str]]:
    segments: list[tuple[Boundary, str]] = []
    for idx, boundary in enumerate(boundaries):
        end = boundaries[idx + 1].start if idx + 1 < len(boundaries) else len(text)
        segment = text[boundary.start:end].strip()
        segments.append((boundary, segment))
    return segments


def build_segments(obj: dict, source_path: Path) -> tuple[list[tuple[Boundary, str]], list[str], int | None]:
    warnings: list[str] = []
    seed_pair = source_sutta_pair(obj)
    target_x = expected_x(obj, source_path)

    segments: list[tuple[Boundary, str]] = []
    first_text = first_sutta_text(obj)
    if seed_pair and first_text:
        first_text = trim_first_sutta_block(first_text)
        segments.append(
            (
                Boundary(x=seed_pair[0], y=seed_pair[1], raw=f"{seed_pair[0]}.{seed_pair[1]}", start=0),
                first_text,
            )
        )
    elif first_text:
        warnings.append("missing parsable source sutta_id; first segment will use detected boundaries only")

    tail_text = commentary_text(obj)
    min_y_exclusive = seed_pair[1] if seed_pair else None
    boundaries, boundary_warnings = detect_boundaries(tail_text, target_x, min_y_exclusive=min_y_exclusive)
    warnings.extend(boundary_warnings)
    segments.extend(slice_segments(tail_text, boundaries))
    return segments, warnings, target_x


def reset_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            for nested in child.glob("*.json"):
                nested.unlink()
        elif child.name.endswith(".json"):
            child.unlink()


def write_source_outputs(source_path: Path, segments: list[tuple[Boundary, str]]) -> dict:
    source_dir = OUTPUT_DIR / source_path.stem
    source_dir.mkdir(parents=True, exist_ok=True)

    files_written: list[str] = []
    tiny_segments: list[str] = []

    for boundary, segment in segments:
        filename = f"sn_{boundary.x}.{boundary.y}.json"
        out_path = source_dir / filename
        obj = {
            "sutta_id": f"SN {boundary.x}.{boundary.y}",
            "sutta": segment,
        }
        out_path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        files_written.append(str(out_path.relative_to(REPO)))
        if len(segment) < MIN_SEGMENT_CHARS:
            tiny_segments.append(filename)

    return {
        "source": str(source_path.relative_to(REPO)),
        "output_dir": str(source_dir.relative_to(REPO)),
        "outputs": files_written,
        "tiny_segments": tiny_segments,
    }


def run(limit: int | None) -> dict:
    reset_output_dir(OUTPUT_DIR)

    sources = sorted(SOURCE_DIR.glob("*.json"), key=lambda p: p.name)
    if limit is not None:
        sources = sources[:limit]

    report: dict = {
        "source_dir": str(SOURCE_DIR.relative_to(REPO)),
        "output_dir": str(OUTPUT_DIR.relative_to(REPO)),
        "files_processed": 0,
        "segments_written": 0,
        "sources": [],
    }

    for source_path in sources:
        obj = load_json(source_path)
        segments, warnings, target = build_segments(obj, source_path)
        written = write_source_outputs(source_path, segments)

        report["files_processed"] += 1
        report["segments_written"] += len(segments)
        report["sources"].append(
            {
                **written,
                "expected_x": target,
                "boundary_count": len(segments),
                "boundaries": [asdict(b) for b, _ in segments],
                "warnings": warnings,
            }
        )

    report_path = OUTPUT_DIR / "_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="Only process the first N source files")
    args = ap.parse_args()

    report = run(limit=args.limit)
    print(
        f"Processed {report['files_processed']} source files; "
        f"wrote {report['segments_written']} split segments to {OUTPUT_DIR}"
    )
    print(f"Report: {OUTPUT_DIR / '_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
