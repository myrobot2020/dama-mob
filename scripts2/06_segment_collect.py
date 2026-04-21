#!/usr/bin/env python3
"""
Flatten only non-empty-commentary files from a segmentation tree into a single folder.

If duplicate filenames would collide, source-group suffixes are appended.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    input_dir = (REPO / args.input).resolve()
    output_dir = (REPO / args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for child in output_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    copied = 0
    collisions = 0
    for source_dir in sorted([p for p in input_dir.iterdir() if p.is_dir()], key=lambda p: p.name):
        for path in sorted(source_dir.glob("*.json"), key=lambda p: p.name):
            try:
                obj = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            commentary = str(obj.get("commentary") or "").strip()
            if not commentary:
                continue
            target = output_dir / path.name
            if target.exists():
                collisions += 1
                target = output_dir / f"{path.stem}__{source_dir.name}{path.suffix}"
            target.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            copied += 1

    summary = {
        "input_dir": str(input_dir.relative_to(REPO)).replace("/", "\\"),
        "output_dir": str(output_dir.relative_to(REPO)).replace("/", "\\"),
        "copied_files": copied,
        "name_collisions": collisions,
    }
    (output_dir / "_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"copied={copied} collisions={collisions}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
