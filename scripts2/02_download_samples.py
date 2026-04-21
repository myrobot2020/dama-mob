#!/usr/bin/env python3
"""
Emit JSON manifests + optional downloads for the first N entries of each teacher playlist.

Requires: yt-dlp on PATH (`pip install yt-dlp`)

Usage:
  python scripts2/02_download_samples.py
  python scripts2/02_download_samples.py --limit 5
  python scripts2/02_download_samples.py --download-audio

Default --limit is 2 (matches checked-in sample JSON count per nikāya under data/validated-json/).

Writes under data/raw/<nik>/playlist_topN.json (sn, dn, mn, kn). Anguttara has no single playlist here;
use corpus JSON + data/raw/an/ notes instead.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

PLAYLISTS: dict[str, str] = {
    "sn": "PLD8I9vPmsYXz4HFUFPsA0b6mYyhluXq0a",
    "dn": "PLD8I9vPmsYXyeQPTfw_D6mtywW7Jzv5tW",
    "mn": "PLD8I9vPmsYXyNK67SVKu3KSa2YdrHJToA",
    "kn": "PLD8I9vPmsYXwegw16WAhjxfjfoe0Mnmon",
}


def yt_dlp_json(playlist_id: str, limit: int) -> list[dict]:
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--playlist-end",
        str(limit),
        "--dump-single-json",
        "--no-warnings",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=120)
    except FileNotFoundError:
        print("yt-dlp not found; install with: pip install yt-dlp", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(e.output.decode("utf-8", errors="replace"), file=sys.stderr)
        sys.exit(1)
    data = json.loads(out.decode("utf-8"))
    entries = data.get("entries") or []
    rows = []
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
    return rows[:limit]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=2)
    ap.add_argument(
        "--download-audio",
        action="store_true",
        help="Download mp3/m4a into data/raw/<nik>/audio/ (needs disk space)",
    )
    args = ap.parse_args()
    lim = max(1, min(50, args.limit))

    for nik, plist in PLAYLISTS.items():
        rows = yt_dlp_json(plist, lim)
        out_dir = REPO / "data" / "raw" / nik
        audio_dir = out_dir / "audio"
        out_dir.mkdir(parents=True, exist_ok=True)
        outp = out_dir / f"playlist_top{lim}.json"
        outp.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {outp} ({len(rows)} entries)")

        if args.download_audio and rows:
            audio_dir.mkdir(parents=True, exist_ok=True)
            for r in rows:
                vid = r["video_id"]
                u = r["url"]
                sub = subprocess.run(
                    [
                        "yt-dlp",
                        "-x",
                        "--audio-format",
                        "mp3",
                        "-o",
                        str(audio_dir / f"{nik}_%(id)s.%(ext)s"),
                        u,
                    ],
                    cwd=str(REPO),
                    timeout=3600,
                )
                if sub.returncode != 0:
                    print(f"[warn] download failed for {vid}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
