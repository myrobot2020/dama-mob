"""
Split long teacher MP3s into per-sutta clips using timings from sutta JSON files.

Each sutta JSON under valid json/an*/suttas/*.json may contain:
  aud_file, aud_start_s, aud_end_s, sutta_id, sutta_name_en

Output files: "<Sanitized English title>__<sutta_id>.mp3"

Requires ffmpeg on PATH (or set FFMPEG_BIN).

Example:
  python aud/split_mp3_from_sutta_json.py --mp3-dir "C:/Users/ADMIN/Desktop/dama" --out-dir aud/sutta_clips
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def sanitize_filename_component(s: str, *, max_len: int = 140) -> str:
    """Safe single path segment for Windows/macOS/Linux."""
    t = re.sub(r"\s+", " ", (s or "").strip())
    bad = '<>:"/\\|?*'
    out = "".join(c if c not in bad and ord(c) >= 32 else "_" for c in t)
    out = re.sub(r"_+", "_", out).strip("._ ")
    if len(out) > max_len:
        out = out[:max_len].rstrip("._ ")
    return out or "unnamed"


def output_basename(sutta_name_en: str, sutta_id: str) -> str:
    sid = sanitize_filename_component(sutta_id, max_len=80)
    name = sanitize_filename_component(sutta_name_en, max_len=140)
    return f"{name}__{sid}"


def iter_sutta_json_files(json_root: Path) -> List[Path]:
    return sorted(json_root.glob("an*/suttas/*.json"))


def load_sutta_record(path: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return data


def ffmpeg_bin() -> str:
    return (os.environ.get("FFMPEG_BIN") or "").strip() or "ffmpeg"


def run_ffmpeg_clip(
    *,
    ffmpeg: str,
    src_mp3: Path,
    start_s: float,
    end_s: float,
    dst_mp3: Path,
    dry_run: bool,
) -> Tuple[bool, str]:
    if end_s <= start_s:
        return False, "invalid range (end <= start)"
    duration = end_s - start_s
    dst_mp3.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start_s:.3f}",
        "-i",
        str(src_mp3),
        "-t",
        f"{duration:.3f}",
        "-c",
        "copy",
        str(dst_mp3),
    ]
    if dry_run:
        return True, " ".join(cmd)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return False, f"{ffmpeg} not found (install ffmpeg or set FFMPEG_BIN)"
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip()
        return False, err or f"ffmpeg exit {r.returncode}"
    return True, ""


def collect_jobs(
    json_root: Path,
    *,
    require_valid: bool,
) -> Iterable[Tuple[Path, Dict[str, Any]]]:
    for jp in iter_sutta_json_files(json_root):
        obj = load_sutta_record(jp)
        if not obj:
            continue
        if require_valid and obj.get("valid") is not True:
            continue
        aud_file = str(obj.get("aud_file") or "").strip()
        if not aud_file:
            continue
        try:
            start_s = float(obj.get("aud_start_s"))
            end_s = float(obj.get("aud_end_s"))
        except (TypeError, ValueError):
            continue
        sutta_id = str(obj.get("sutta_id") or "").strip()
        if not sutta_id:
            continue
        name_en = str(obj.get("sutta_name_en") or "").strip()
        if not name_en:
            name_en = sutta_id
        yield jp, {
            "aud_file": aud_file,
            "aud_start_s": start_s,
            "aud_end_s": end_s,
            "sutta_id": sutta_id,
            "sutta_name_en": name_en,
        }


def main() -> int:
    p = argparse.ArgumentParser(description="Split MP3s using sutta JSON timings.")
    p.add_argument(
        "--json-root",
        type=Path,
        default=_REPO_ROOT / "valid json",
        help="Folder containing an*/suttas/*.json (default: valid json/)",
    )
    p.add_argument(
        "--mp3-dir",
        type=Path,
        required=True,
        help="Directory containing source MP3 files named in aud_file (e.g. Desktop/dama)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=_REPO_ROOT / "aud" / "sutta_clips",
        help="Output folder for per-sutta MP3s (default: aud/sutta_clips)",
    )
    p.add_argument(
        "--require-valid",
        action="store_true",
        help="Only process JSON where valid is true",
    )
    p.add_argument("--dry-run", action="store_true", help="Print ffmpeg commands only")
    p.add_argument("--limit", type=int, default=0, help="Process at most N clips (0=all)")
    args = p.parse_args()

    json_root = args.json_root.resolve()
    mp3_dir = args.mp3_dir.resolve()
    out_dir = args.out_dir.resolve()

    if not json_root.is_dir():
        print(f"json-root not found: {json_root}", file=sys.stderr)
        return 2

    jobs = list(collect_jobs(json_root, require_valid=args.require_valid))
    if args.limit and args.limit > 0:
        jobs = jobs[: args.limit]

    ffmpeg = ffmpeg_bin()
    ok_n = 0
    skip_n = 0
    err_n = 0

    for jp, rec in jobs:
        base = output_basename(rec["sutta_name_en"], rec["sutta_id"])
        dst = out_dir / f"{base}.mp3"
        src_name = rec["aud_file"]
        src = mp3_dir / src_name
        if not src.is_file():
            print(f"skip missing mp3: {src_name}", file=sys.stderr)
            skip_n += 1
            continue

        good, msg = run_ffmpeg_clip(
            ffmpeg=ffmpeg,
            src_mp3=src,
            start_s=rec["aud_start_s"],
            end_s=rec["aud_end_s"],
            dst_mp3=dst,
            dry_run=args.dry_run,
        )
        if not good:
            print(f"ERR {jp.name} -> {dst.name}: {msg}", file=sys.stderr)
            err_n += 1
            continue
        if args.dry_run:
            print(msg)
        ok_n += 1

    print(
        f"Done. ok={ok_n} skipped_missing_source={skip_n} errors={err_n} "
        f"out_dir={out_dir}"
    )
    return 0 if err_n == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
