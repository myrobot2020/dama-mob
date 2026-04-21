#!/usr/bin/env python3
"""
Conservative sutta/commentary segmentation for already split sutta JSONs.

Writes a parallel tree and a report. Files with multiple plausible split
markers are marked suspicious and left unsplit.

Example:
  python scripts2/05_segment_commentary.py --input "data/examples/sn_heuristic_split" --output "data/examples/sn/SN segmentation"
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

SUTTA_END_RE = re.compile(r"(?i)\b(?:that'?s\s+)?the\s+end\s+of\s+the\s+sut(?:ta|a|e|i)\b")
COMMENTARY_START_RE = re.compile(
    r"(?i)\b("
    r"i\s+just\s+stopped\s+here"
    r"|i'?ll\s+just\s+stop\s+here"
    r"|so\s+here\s+(?:the\s+)?buddha"
    r"|so\s+in\s+this\s+sut(?:ta|a|e|i)"
    r"|this\s+sut(?:ta|a|e|i)\s+is"
    r"|this\s+is\s+one\s+of\s+those\s+sut(?:tas|as|es|is)"
    r"|i\s+will\s+just\s+stop\s+here"
    r")\b"
)
MIN_PREFIX = 200


def load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def find_valid_commentary_matches(text: str) -> list[re.Match[str]]:
    return [m for m in COMMENTARY_START_RE.finditer(text) if m.start() >= MIN_PREFIX]


def split_text(text: str) -> tuple[str, str, str]:
    blk = (text or "").strip()
    if not blk:
        return "", "", "empty"

    end_matches = list(SUTTA_END_RE.finditer(blk))
    commentary_matches = find_valid_commentary_matches(blk)

    if len(end_matches) > 1 or len(commentary_matches) > 1:
        return blk, "", "suspicious_multi_marker"

    if len(end_matches) == 1:
        cut = end_matches[0].end()
        return blk[:cut].strip(), blk[cut:].strip(), "end_marker"

    if len(commentary_matches) == 1:
        cut = commentary_matches[0].start()
        return blk[:cut].strip(), blk[cut:].strip(), "cue_marker"

    return blk, "", "no_marker"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Input split tree")
    ap.add_argument("--output", required=True, help="Output segmentation tree")
    args = ap.parse_args()

    input_dir = (REPO / args.input).resolve()
    output_dir = (REPO / args.output).resolve()
    if not input_dir.is_dir():
        raise SystemExit(f"Missing input dir: {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "input_dir": str(input_dir.relative_to(REPO)),
        "output_dir": str(output_dir.relative_to(REPO)),
        "source_dirs": 0,
        "files_written": 0,
        "segmented": 0,
        "suspicious": 0,
        "no_marker": 0,
        "items": [],
    }

    for child in output_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    for source_dir in sorted([p for p in input_dir.iterdir() if p.is_dir()], key=lambda p: p.name):
        out_source = output_dir / source_dir.name
        out_source.mkdir(parents=True, exist_ok=True)
        report["source_dirs"] = int(report["source_dirs"]) + 1

        for path in sorted(source_dir.glob("*.json"), key=lambda p: p.name):
            obj = load_json(path)
            if not isinstance(obj, dict):
                continue

            sutta_id = str(obj.get("sutta_id") or "").strip()
            text = str(obj.get("sutta") or "")
            sutta_text, commentary_text, rule = split_text(text)

            out_obj = dict(obj)
            out_obj["sutta_id"] = sutta_id
            out_obj["sutta"] = sutta_text
            out_obj["commentary"] = commentary_text
            out_path = out_source / path.name
            out_path.write_text(json.dumps(out_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            report["files_written"] = int(report["files_written"]) + 1
            if rule in ("end_marker", "cue_marker") and commentary_text.strip():
                report["segmented"] = int(report["segmented"]) + 1
            elif rule == "suspicious_multi_marker":
                report["suspicious"] = int(report["suspicious"]) + 1
            elif rule == "no_marker":
                report["no_marker"] = int(report["no_marker"]) + 1

            cast_items = report["items"]
            assert isinstance(cast_items, list)
            cast_items.append(
                {
                    "source_dir": str(source_dir.relative_to(REPO)).replace("/", "\\"),
                    "file": path.name,
                    "sutta_id": sutta_id,
                    "rule": rule,
                    "commentary_chars": len(commentary_text.strip()),
                }
            )

    (output_dir / "_segmentation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"source_dirs={report['source_dirs']} files_written={report['files_written']} "
        f"segmented={report['segmented']} suspicious={report['suspicious']} no_marker={report['no_marker']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
