"""
Transcribe each AN Book 2 MP3 with faster-whisper, using the matching block from
AN_Book_02.txt as initial_prompt (style/vocabulary bias). Output is still
word-segment timestamps in aud/transcripts/<mp3_stem>_segments.json — the book
text does not replace Whisper; it only helps ASR match the teacher's wording.

Prereqs: pip install faster-whisper imageio-ffmpeg
Place MP3s under aud/ (names should match SOURCE lines in the book, or use 006_/007_/008_ prefix).

Usage (from repo root):
  python aud/transcribe_from_an_book_02.py --book AN_Book_02.txt --model small
  python aud/transcribe_from_an_book_02.py --dry_run
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple


SECTION_RE = re.compile(
    r"===== SOURCE:\s*(?P<fn>.+?\.txt)\s*=====\s*(?P<body>.*?)(?=\n===== SOURCE:|\Z)",
    re.DOTALL | re.IGNORECASE,
)


def parse_book(path: Path) -> List[Tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    out: List[Tuple[str, str]] = []
    for m in SECTION_RE.finditer(text):
        fn = m.group("fn").strip()
        body = m.group("body").strip()
        out.append((fn, body))
    return out


def txt_to_mp3_stem(txt_name: str) -> str:
    t = txt_name.strip()
    if t.lower().endswith(".txt"):
        return t[:-4] + ".mp3"
    return t + ".mp3"


def normalize_prompt(body: str, max_chars: int) -> str:
    one = " ".join(body.split())
    return one[:max_chars]


def resolve_mp3(aud_dir: Path, expected_name: str) -> Optional[Path]:
    p = aud_dir / expected_name
    if p.is_file():
        return p
    prefix = expected_name.split("_", 1)[0] if "_" in expected_name else ""
    if prefix.isdigit() or (len(prefix) >= 3 and prefix[:2] == "00"):
        matches = sorted(aud_dir.glob(f"{prefix}_*.mp3"))
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            print(f"[warn] multiple MP3 for prefix {prefix}: taking first: {matches[0]}", file=sys.stderr)
            return matches[0]
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Whisper AN Book 2 MP3s with prompts from AN_Book_02.txt")
    ap.add_argument("--book", default="AN_Book_02.txt", help="Merged book text (SOURCE sections)")
    ap.add_argument("--aud_dir", default="aud", help="Directory containing MP3s")
    ap.add_argument("--model", default="small", help="faster-whisper model")
    ap.add_argument("--language", default="en")
    ap.add_argument(
        "--prompt_chars",
        type=int,
        default=4000,
        help="Max chars of each section to pass as initial_prompt (rest still helps via start of talk)",
    )
    ap.add_argument("--dry_run", action="store_true", help="Print planned jobs only")
    args = ap.parse_args()

    root = Path.cwd()
    book_path = Path(args.book)
    if not book_path.is_file():
        raise SystemExit(f"Book file not found: {book_path.resolve()}")

    aud_dir = Path(args.aud_dir)
    if not aud_dir.is_dir():
        raise SystemExit(f"aud dir not found: {aud_dir.resolve()}")

    sections = parse_book(book_path)
    if not sections:
        raise SystemExit(f"No SOURCE sections parsed from {book_path}")

    transcribe_py = root / "aud" / "transcribe_fasterwhisper.py"
    if not transcribe_py.is_file():
        raise SystemExit(f"Missing {transcribe_py}")

    for txt_fn, body in sections:
        mp3_name = txt_to_mp3_stem(txt_fn)
        mp3 = resolve_mp3(aud_dir, mp3_name)
        prompt = normalize_prompt(body, args.prompt_chars)

        if mp3 is None:
            print(f"[skip] no MP3 for {txt_fn!r} (expected {aud_dir / mp3_name})", file=sys.stderr)
            continue

        rel_mp3 = mp3
        try:
            rel_mp3 = mp3.relative_to(root)
        except ValueError:
            pass

        print(f"=== {mp3.name} ({len(prompt)} prompt chars) ===")
        if args.dry_run:
            continue

        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix="_prompt.txt",
            delete=False,
        ) as tmp:
            tmp.write(prompt)
            tmp_path = tmp.name

        try:
            cmd = [
                sys.executable,
                str(transcribe_py),
                "--mp3",
                str(rel_mp3),
                "--model",
                args.model,
                "--language",
                args.language,
                "--initial_prompt_file",
                tmp_path,
            ]
            subprocess.run(cmd, check=True, cwd=root)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
