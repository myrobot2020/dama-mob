#!/usr/bin/env python3
"""
Merge any split-output tree into the shared bounds CSV.

When rerun for the same split tree, previous rows from that tree are removed
before fresh rows are added.

Example:
  python scripts2/07_segment_bounds.py "data/examples/sn/SN segmentation" data/raw/bounds/sutta_bounds_an_folders.csv --replace-prefix "data\\examples\\sn\\" --replace-prefix "data\\examples\\sn_heuristic_split\\"
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def preview_stats(text: str) -> tuple[int, str, str]:
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    if not words:
        return 0, "", ""
    return len(words), " ".join(words[:3]), " ".join(words[-3:])


def build_rows(split_dir: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for source_dir in sorted([p for p in split_dir.iterdir() if p.is_dir()], key=lambda p: p.name):
        for path in sorted(source_dir.glob("*.json"), key=lambda p: p.name):
            obj = load_json(path)
            if not isinstance(obj, dict):
                continue

            sutta_id = str(obj.get("sutta_id") or "").strip()
            sutta_text = str(obj.get("sutta") or "")
            commentary_text = str(obj.get("commentary") or "")

            s_count, s_first, s_last = preview_stats(sutta_text)
            c_count, c_first, c_last = preview_stats(commentary_text)

            bare_sutta_id = re.sub(r"^[A-Z]{2}\s+", "", sutta_id)
            rows.append(
                {
                    "sutta_id": bare_sutta_id,
                    "source_path": str(path.relative_to(REPO)).replace("/", "\\"),
                    "sutta_word_count": str(s_count),
                    "sutta_first3": s_first,
                    "sutta_last3": s_last,
                    "commentary_word_count": str(c_count),
                    "commentary_first3": c_first,
                    "commentary_last3": c_last,
                }
            )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("split_dir", help="Folder containing per-source split subfolders")
    ap.add_argument("csv_path", help="Existing shared bounds CSV")
    ap.add_argument(
        "--replace-prefix",
        action="append",
        default=[],
        help="CSV source_path prefix to remove before merging (repeatable)",
    )
    args = ap.parse_args()

    split_dir = (REPO / args.split_dir).resolve()
    if not split_dir.is_dir():
        raise SystemExit(f"Missing split dir: {split_dir}")
    split_prefix = str(split_dir.relative_to(REPO)).replace("/", "\\").lower().rstrip("\\") + "\\"
    replace_prefixes = [split_prefix]
    replace_prefixes.extend(p.replace("/", "\\").lower().rstrip("\\") + "\\" for p in args.replace_prefix)

    csv_path = Path(args.csv_path)
    if not csv_path.is_absolute():
        csv_path = (REPO / csv_path).resolve()

    header = [
        "sutta_id",
        "source_path",
        "sutta_word_count",
        "sutta_first3",
        "sutta_last3",
        "commentary_word_count",
        "commentary_first3",
        "commentary_last3",
    ]

    existing: list[dict[str, str]] = []
    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                sp = (row.get("source_path") or "").replace("/", "\\").lower()
                if any(sp.startswith(prefix) for prefix in replace_prefixes):
                    continue
                existing.append({k: row.get(k) or "" for k in header})

    existing.extend(build_rows(split_dir))

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        for row in existing:
            writer.writerow({k: row.get(k) or "" for k in header})

    print(f"Wrote {len(existing)} total rows to {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
