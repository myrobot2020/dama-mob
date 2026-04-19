#!/usr/bin/env python3
"""
Transcribe AN MP3s for a given book when `aud/transcripts/<stem>_segments.json` is missing.

Delegates to `aud/transcribe_fasterwhisper.py` (faster-whisper). Book detection matches
`backfill_audio_an_commentary.discover_segment_paths_for_book`: first integer after 'Book'
in the filename must equal `--book`.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def discover_mp3s_for_book(aud_dir: Path, book: int) -> list[Path]:
    rx = re.compile(r"Book\s+(\d+)")
    out: list[Path] = []
    for p in sorted(aud_dir.glob("*.mp3")):
        if not p.is_file():
            continue
        m = rx.search(p.name)
        if not m:
            continue
        if int(m.group(1)) == book:
            out.append(p)
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Run faster-whisper on AN book MP3s missing segment JSON.")
    ap.add_argument("--book", type=int, required=True, help="Anguttara book number (e.g. 3)")
    ap.add_argument(
        "--aud_dir",
        default=str(root / "aud"),
        help="Directory containing MP3 files (default: repo aud/)",
    )
    ap.add_argument("--max_files", type=int, default=0, help="Stop after N new transcriptions (0 = no limit)")
    ap.add_argument("--dry_run", action="store_true", help="List MP3s that would be transcribed")
    ap.add_argument("--model", default="tiny")
    ap.add_argument(
        "--device",
        default="cpu",
        help="faster-whisper device (cuda often fails on Windows if CUDA/cuBLAS DLLs mismatch; use cpu)",
    )
    ap.add_argument("--compute_type", default="int8")
    args = ap.parse_args()

    aud_dir = Path(args.aud_dir)
    book = int(args.book)
    transcribe_py = root / "aud" / "transcribe_fasterwhisper.py"
    if not transcribe_py.is_file():
        raise SystemExit(f"Missing {transcribe_py}")

    mp3s = discover_mp3s_for_book(aud_dir, book)
    if not mp3s:
        raise SystemExit(f"No *Book {book}*.mp3 under {aud_dir}")

    transcripts_dir = aud_dir / "transcripts"
    transcripts_dir.mkdir(parents=True, exist_ok=True)

    todo: list[Path] = []
    for mp3 in mp3s:
        out_json = transcripts_dir / (mp3.stem + "_segments.json")
        if out_json.is_file():
            continue
        todo.append(mp3)

    print(f"book={book} mp3s={len(mp3s)} missing_segments={len(todo)}")
    if args.dry_run:
        for p in todo:
            print(f"would transcribe: {p.name}")
        return

    done = 0
    for mp3 in todo:
        cmd = [
            sys.executable,
            str(transcribe_py),
            "--mp3",
            str(mp3),
            "--model",
            str(args.model),
            "--device",
            str(args.device),
            "--compute_type",
            str(args.compute_type),
        ]
        print("Running:", " ".join(cmd), flush=True)
        r = subprocess.run(cmd, cwd=str(root))
        if r.returncode != 0:
            raise SystemExit(f"Transcribe failed for {mp3.name} (exit {r.returncode})")
        done += 1
        if args.max_files and done >= args.max_files:
            print(f"Stopped after --max_files={args.max_files}", flush=True)
            break

    print(f"finished new transcriptions: {done}", flush=True)


if __name__ == "__main__":
    main()
