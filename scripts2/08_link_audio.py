#!/usr/bin/env python3
"""
Map segmented SN suttas to playlist-row audio files.

Uses the segmented file's parent folder (for example ``1.pl.15``) to resolve
the originating playlist row, then attaches the matching local audio file from
``sn/SN audio`` when present.

Outputs:
  - per-sutta mapping JSONs under the chosen output directory
  - _summary.json
  - _summary.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PL_RE = re.compile(r"^1\.pl\.(\d+)$", re.I)


def parse_playlist_index(source_group: str) -> int | None:
    name = (source_group or "").strip()
    if name == "1.1":
        return 1
    if name == "1.2":
        return 2
    m = PL_RE.match(name)
    if not m:
        return None
    return int(m.group(1))


def load_playlist(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit(f"Unexpected playlist format: {path}")
    return [x for x in data if isinstance(x, dict)]


def build_audio_lookup(audio_dir: Path) -> dict[int, Path]:
    out: dict[int, Path] = {}
    for path in sorted(audio_dir.glob("sn_*.webm"), key=lambda p: p.name):
        m = re.match(r"^sn_(\d{3})_", path.name, re.I)
        if not m:
            continue
        out[int(m.group(1))] = path
    return out


def load_source_group_lookup(csv_path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not csv_path.is_file():
        return out
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            sid = str(row.get("sutta_id") or "").strip()
            sp = str(row.get("source_path") or "").replace("/", "\\")
            if not sid or "\\sn segmentation\\" not in sp.lower():
                continue
            parts = sp.split("\\")
            if len(parts) >= 3:
                out[sid] = parts[2]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--segmented", required=True, help="Folder holding the 38 segmented SN files")
    ap.add_argument("--playlist", required=True, help="playlist_full.json path")
    ap.add_argument("--audio-dir", required=True, help="Directory of SN audio files")
    ap.add_argument("--output", required=True, help="Output mapping directory")
    ap.add_argument(
        "--bounds-csv",
        default="data/raw/bounds/sutta_bounds_an_folders.csv",
        help="Shared bounds CSV",
    )
    args = ap.parse_args()

    segmented_dir = (REPO / args.segmented).resolve()
    playlist_path = (REPO / args.playlist).resolve()
    audio_dir = (REPO / args.audio_dir).resolve()
    output_dir = (REPO / args.output).resolve()
    bounds_csv = (REPO / args.bounds_csv).resolve()

    if not segmented_dir.is_dir():
        raise SystemExit(f"Missing segmented dir: {segmented_dir}")
    if not playlist_path.is_file():
        raise SystemExit(f"Missing playlist file: {playlist_path}")
    if not audio_dir.is_dir():
        raise SystemExit(f"Missing audio dir: {audio_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    for child in output_dir.iterdir():
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)

    playlist = load_playlist(playlist_path)
    audio_lookup = build_audio_lookup(audio_dir)
    source_group_lookup = load_source_group_lookup(bounds_csv)

    rows: list[dict[str, str]] = []
    mapped = 0

    for path in sorted(segmented_dir.glob("*.json"), key=lambda p: p.name):
        obj = json.loads(path.read_text(encoding="utf-8"))
        sutta_id = str(obj.get("sutta_id") or "").strip()
        bare_id = sutta_id.replace("SN ", "", 1).strip()
        source_dir_name = source_group_lookup.get(bare_id, "")

        playlist_idx = parse_playlist_index(source_dir_name)
        playlist_row = playlist[playlist_idx - 1] if playlist_idx and 1 <= playlist_idx <= len(playlist) else None
        audio_path = audio_lookup.get(playlist_idx or -1)
        found = audio_path is not None and playlist_row is not None
        if found:
            mapped += 1

        rec = {
            "sutta_id": sutta_id,
            "source_group": source_dir_name,
            "source_file": str(path.relative_to(REPO)).replace("/", "\\"),
            "playlist_index": str(playlist_idx or ""),
            "video_id": str((playlist_row or {}).get("video_id") or ""),
            "playlist_title": str((playlist_row or {}).get("title") or ""),
            "youtube_url": str((playlist_row or {}).get("url") or ""),
            "audio_file": audio_path.name if audio_path else "",
            "audio_path": str(audio_path.relative_to(REPO)).replace("/", "\\") if audio_path else "",
            "mapped": "true" if found else "false",
        }
        rows.append(rec)
        out_path = output_dir / f"{path.stem}.json"
        out_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "segmented_dir": str(segmented_dir.relative_to(REPO)).replace("/", "\\"),
        "playlist": str(playlist_path.relative_to(REPO)).replace("/", "\\"),
        "audio_dir": str(audio_dir.relative_to(REPO)).replace("/", "\\"),
        "total_segmented_files": len(rows),
        "mapped_files": mapped,
        "unmapped_files": len(rows) - mapped,
    }

    (output_dir / "_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (output_dir / "_summary.csv").open("w", encoding="utf-8", newline="") as f:
        header = [
            "sutta_id",
            "source_group",
            "source_file",
            "playlist_index",
            "video_id",
            "playlist_title",
            "youtube_url",
            "audio_file",
            "audio_path",
            "mapped",
        ]
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"total={len(rows)} mapped={mapped} unmapped={len(rows) - mapped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
