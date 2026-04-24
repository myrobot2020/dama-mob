#!/usr/bin/env python3
"""
Download the full teacher Saṃyutta Nikāya YouTube playlist into ``data/examples/sn/``.

Writes:
  data/examples/sn/playlist_full.json   — manifest (video_id, title, url)
  data/examples/sn/audio/*              — best audio (``.webm`` / ``m4a`` by default; no ffmpeg)

Use ``--mp3`` to transcode to MP3 (requires ffmpeg/ffprobe on PATH).

Requires: yt-dlp on PATH.

Usage:
  python scripts2/01_download.py --manifest-only
  python scripts2/01_download.py
  python scripts2/01_download.py --mp3   # needs ffmpeg
  python scripts2/01_download.py --items 1-58
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from config import EXAMPLES_ROOT

REPO = Path(__file__).resolve().parents[1]

SN_PLAYLIST_ID = "PLD8I9vPmsYXz4HFUFPsA0b6mYyhluXq0a"


def playlist_url(playlist_id: str) -> str:
    return f"https://www.youtube.com/playlist?list={playlist_id}"


def yt_dlp_full_manifest(playlist_id: str) -> list[dict]:
    url = playlist_url(playlist_id)
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=300)
    except FileNotFoundError:
        print("yt-dlp not found; install with: pip install yt-dlp", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(e.output.decode("utf-8", errors="replace"), file=sys.stderr)
        sys.exit(1)
    data = json.loads(out.decode("utf-8"))
    entries = data.get("entries") or []
    rows: list[dict] = []
    for ent in entries:
        if not isinstance(ent, dict):
            continue
        vid = str(ent.get("id") or "").strip()
        title = str(ent.get("title") or "").strip()
        if vid:
            rows.append(
                {
                    "video_id": vid,
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={vid}",
                }
            )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Full SN playlist -> data/examples/sn/")
    ap.add_argument(
        "--manifest-only",
        action="store_true",
        help="Only write data/examples/sn/playlist_full.json; do not download audio.",
    )
    ap.add_argument(
        "--playlist-id",
        default=SN_PLAYLIST_ID,
        help=f"Override playlist id (default: {SN_PLAYLIST_ID}).",
    )
    ap.add_argument(
        "--mp3",
        action="store_true",
        help="Extract MP3 with ffmpeg (-x --audio-format mp3). Requires ffmpeg.",
    )
    ap.add_argument(
        "--items",
        default="",
        help="Optional yt-dlp --playlist-items selector (e.g. 1-58 or 1,2,5).",
    )
    args = ap.parse_args()

    sn_root = EXAMPLES_ROOT / "sn"
    audio_dir = sn_root / "audio"
    sn_root.mkdir(parents=True, exist_ok=True)

    rows = yt_dlp_full_manifest(args.playlist_id)
    manifest_path = sn_root / "playlist_full.json"
    manifest_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path} ({len(rows)} entries)")

    if args.manifest_only:
        return 0

    if not rows:
        return 0

    audio_dir.mkdir(parents=True, exist_ok=True)
    playlist_url_s = playlist_url(args.playlist_id)
    # Best audio only; avoid -x unless --mp3 so ffmpeg is not required.
    cmd: list[str] = [
        "yt-dlp",
        "--continue",
        "-f",
        # Prefer m4a/MP4 container when available (plays reliably in browsers) without requiring ffmpeg.
        "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/best",
        "-o",
        str(audio_dir / "sn_%(playlist_index)03d_%(id)s.%(ext)s"),
        playlist_url_s,
    ]
    if args.mp3:
        cmd = [
            "yt-dlp",
            "--continue",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            str(audio_dir / "sn_%(playlist_index)03d_%(id)s.%(ext)s"),
            playlist_url_s,
        ]
    if args.items.strip():
        # Insert after `--continue` so it applies to both mp3/non-mp3 variants.
        cmd.insert(2, "--playlist-items")
        cmd.insert(3, args.items.strip())
    sub = subprocess.run(cmd, cwd=str(REPO))
    return sub.returncode


if __name__ == "__main__":
    raise SystemExit(main())
