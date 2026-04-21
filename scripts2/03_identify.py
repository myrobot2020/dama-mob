#!/usr/bin/env python3
"""
SN teacher playlist → English subtitles, corpus JSON under data/validated-json/sn/sn1/suttas/, audio in aud/.

Reads data/examples/sn/playlist_full.json (from scripts2/01_download.py).

  SN 1.1, SN 1.2 → first two videos (canonical ids).
  SN 1.pl.3 … SN 1.pl.N → remaining playlist rows (playlist lecture parts).

Steps (default run):
  1. yt-dlp writes WebVTT under data/raw/sn/transcripts/ (English auto subs).
  2. Copies matching files from data/examples/sn/audio/ -> aud/ (same basename).
  3. Per row: sutta_id → segment sutta + commentary → chain → map audio → valid (see ``corpus_row_valid``).

Requires: yt-dlp. Optional: ffprobe (faster local duration); else duration from yt-dlp --print duration.

Usage:
  python scripts2/03_identify.py
  python scripts2/03_identify.py --skip-subs     # only sync JSON + copy audio (subs already there)
  python scripts2/03_identify.py --subs-only     # only fetch subtitles
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from config import EXAMPLES_ROOT

REPO = Path(__file__).resolve().parents[1]

PLAYLIST_JSON = EXAMPLES_ROOT / "sn" / "playlist_full.json"
SN_AUDIO_DIR = EXAMPLES_ROOT / "sn" / "audio"
TRANSCRIPT_DIR = REPO / "data" / "raw" / "sn" / "transcripts"
CORPUS = REPO / "data" / "validated-json"

SN_PLAYLIST_ID = "PLD8I9vPmsYXz4HFUFPsA0b6mYyhluXq0a"

# Minimum cleaned transcript length to treat captions as usable (not stub).
MIN_VTT_CHARS = 80
# Minimum sutta body length after split for valid=true (browse index gate needs non-empty sutta).
MIN_SUTTA_CHARS = 40


def _load_module(path: Path, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


_norm = _load_module(REPO / "scripts2" / "00_normalize.py", "norm_sn")
_cc = _load_module(REPO / "scripts2" / "11_clean.py", "cc_sn")

split_transcript = _norm.split_transcript
chain_from_title = _norm.chain_from_title
yt_duration_seconds = _norm.yt_duration_seconds
vtt_to_plaintext = _cc.vtt_to_plaintext


def sutta_id_and_rel(idx: int) -> tuple[str, str]:
    """1-based playlist index → sutta_id and path under data/validated-json/."""
    if idx == 1:
        return "SN 1.1", "sn/sn1/suttas/1.1.json"
    if idx == 2:
        return "SN 1.2", "sn/sn1/suttas/1.2.json"
    return f"SN 1.pl.{idx}", f"sn/sn1/suttas/1.pl.{idx}.json"


def title_from_playlist_row(title: str) -> str:
    t = (title or "").strip()
    t = re.sub(r"^\s*Samyutta\s+Nikaya\s+", "", t, flags=re.I)
    t = re.sub(r"\s+by\s+Bhante.*$", "", t, flags=re.I).strip()
    return t or "Saṃyutta teaching"


def find_local_audio(sn_dir: Path, idx: int, vid: str) -> Path | None:
    pat = f"sn_{idx:03d}_{vid}.*"
    hits = sorted(sn_dir.glob(pat))
    if hits:
        return hits[0]
    loose = list(sn_dir.glob(f"*{vid}*"))
    return loose[0] if loose else None


def load_transcript_plain(vid: str) -> tuple[str, bool]:
    """
    Returns (full_plaintext, had_usable_vtt).
    ``had_usable_vtt`` is True when a VTT exists and cleans to at least MIN_VTT_CHARS characters.
    """
    vtt = find_vtt(vid)
    if not vtt:
        return "", False
    raw = vtt_to_plaintext(vtt)
    ok = len(raw.strip()) >= MIN_VTT_CHARS
    return raw, ok


def stub_transcript(title_en: str) -> str:
    return (
        f"(Caption track missing or short.) {title_en}. "
        "Open the YouTube subtitles or re-run with working yt-dlp captions."
    )


def segment_sutta_commentary(full_text: str) -> tuple[str, str]:
    """Split full transcript into sutta passage vs teacher commentary (normalize rules)."""
    sutta, commentary = split_transcript(full_text)
    if not sutta and full_text.strip():
        sutta, commentary = full_text[:400].strip(), full_text[400:].strip()
    return sutta.strip(), commentary.strip()


def map_audio_file(
    *,
    idx: int,
    vid: str,
    aud_target: Path,
    sn_dir: Path | None,
    dry_run: bool,
) -> tuple[str, bool]:
    """
    Resolve ``aud_file`` basename and copy from ``sn/audio`` when present.
    Returns (aud_file_name, audio_on_disk).
    """
    src_audio = find_local_audio(sn_dir, idx, vid) if sn_dir and sn_dir.is_dir() else None
    if src_audio and src_audio.is_file():
        aud_name = src_audio.name
        dest = aud_target / aud_name
        if dry_run:
            return aud_name, True
        if not dest.is_file() or dest.stat().st_size != src_audio.stat().st_size:
            shutil.copy2(src_audio, dest)
        return aud_name, dest.is_file()

    aud_name = f"sn_{idx:03d}_{vid}.webm"
    on_disk = (aud_target / aud_name).is_file()
    return aud_name, on_disk


def corpus_row_valid(
    *,
    had_usable_vtt: bool,
    sutta: str,
    aud_name: str,
    audio_mapped_ok: bool,
    aud_start: float,
    aud_end: float,
) -> bool:
    """
    Mirrors app expectations (``passesCorpusGate`` + practical audio mapping):
    True when captions were real, sutta body is substantive, aud filename set, file on disk, clip length positive.
    """
    if not had_usable_vtt:
        return False
    if len(sutta.strip()) < MIN_SUTTA_CHARS:
        return False
    if not (aud_name or "").strip():
        return False
    if not audio_mapped_ok:
        return False
    if aud_end <= aud_start:
        return False
    return True


def find_vtt(vid: str) -> Path | None:
    tr = TRANSCRIPT_DIR
    if not tr.is_dir():
        return None
    for name in (f"{vid}.en.vtt", f"{vid}.en-orig.vtt"):
        p = tr / name
        if p.is_file():
            return p
    return None


def ffprobe_duration(path: Path) -> float | None:
    try:
        out = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                str(path),
            ],
            stderr=subprocess.DEVNULL,
            timeout=120,
        )
        d = float(out.decode().strip())
        return round(d, 2) if d > 0 else None
    except (subprocess.CalledProcessError, FileNotFoundError, OSError, ValueError):
        return None


def youtube_duration_map_from_playlist() -> dict[str, float]:
    """Single yt-dlp call — video_id → seconds (playlist metadata)."""
    url = f"https://www.youtube.com/playlist?list={SN_PLAYLIST_ID}"
    try:
        out = subprocess.check_output(
            ["yt-dlp", "--dump-single-json", "--skip-download", "--no-warnings", url],
            stderr=subprocess.STDOUT,
            timeout=600,
        )
        data = json.loads(out.decode("utf-8", errors="replace"))
        out_map: dict[str, float] = {}
        for e in data.get("entries") or []:
            if not isinstance(e, dict):
                continue
            vid = str(e.get("id") or "").strip()
            dur = e.get("duration")
            if vid and dur is not None:
                out_map[vid] = round(float(dur), 2)
        return out_map
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError, ValueError, FileNotFoundError):
        return {}


def download_subtitles() -> int:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    url = f"https://www.youtube.com/playlist?list={SN_PLAYLIST_ID}"
    cmd = [
        "yt-dlp",
        "--write-auto-sub",
        "--sub-langs",
        "en.*,en",
        "--skip-download",
        "--no-warnings",
        "-o",
        str(TRANSCRIPT_DIR / "%(id)s"),
        url,
    ]
    print("Running:", " ".join(cmd))
    try:
        r = subprocess.run(cmd, cwd=str(REPO), timeout=7200)
    except FileNotFoundError:
        print("yt-dlp not found", file=sys.stderr)
        return 1
    return r.returncode


def sync_corpus(*, dry_run: bool) -> int:
    if not PLAYLIST_JSON.is_file():
        print(f"Missing {PLAYLIST_JSON}; run scripts2/01_download.py --manifest-only", file=sys.stderr)
        return 1
    rows = json.loads(PLAYLIST_JSON.read_text(encoding="utf-8"))
    aud_target = REPO / "aud"
    aud_target.mkdir(parents=True, exist_ok=True)

    if not SN_AUDIO_DIR.is_dir():
        print(f"[warn] {SN_AUDIO_DIR} missing — aud_file will point at basename only", file=sys.stderr)

    print("Fetching YouTube durations (one playlist query)…")
    yt_dur = youtube_duration_map_from_playlist()
    if not yt_dur:
        print("[warn] could not load durations from yt-dlp; aud_end_s may fall back to 3600", file=sys.stderr)

    ok = 0
    n_valid = 0
    n_invalid = 0
    for i, row in enumerate(rows, start=1):
        vid = str(row.get("video_id") or "").strip()
        url = str(row.get("url") or "").strip() or f"https://www.youtube.com/watch?v={vid}"
        title_raw = str(row.get("title") or "").strip()
        if not vid:
            continue

        sutta_id, rel = sutta_id_and_rel(i)
        jp = CORPUS / rel
        jp.parent.mkdir(parents=True, exist_ok=True)

        name_en = title_from_playlist_row(title_raw)
        raw_plain, had_usable_vtt = load_transcript_plain(vid)
        if had_usable_vtt:
            full_text = raw_plain
        else:
            full_text = stub_transcript(name_en)
            print(f"[warn] no usable VTT for {vid}; stub text → valid may be false")

        sutta, commentary = segment_sutta_commentary(full_text)
        chain = chain_from_title(name_en, sutta)

        aud_name, audio_ok = map_audio_file(
            idx=i,
            vid=vid,
            aud_target=aud_target,
            sn_dir=SN_AUDIO_DIR if SN_AUDIO_DIR.is_dir() else None,
            dry_run=dry_run,
        )
        if not audio_ok and not dry_run:
            print(f"[warn] audio missing under aud/ for {aud_name} (idx={i} vid={vid})")

        src_audio = find_local_audio(SN_AUDIO_DIR, i, vid) if SN_AUDIO_DIR.is_dir() else None
        dur = None
        if src_audio and src_audio.is_file():
            dur = ffprobe_duration(src_audio)
        if dur is None or dur <= 0:
            dur = yt_dur.get(vid)
        if dur is None or dur <= 0:
            dur = yt_duration_seconds(url)
        if dur is None or dur <= 0:
            dur = 3600.0
        dur = float(dur)

        aud_start = 0.0
        aud_end = round(dur, 2)
        valid = corpus_row_valid(
            had_usable_vtt=had_usable_vtt,
            sutta=sutta,
            aud_name=aud_name,
            audio_mapped_ok=audio_ok,
            aud_start=aud_start,
            aud_end=aud_end,
        )

        obj: dict = {
            "sutta_id": sutta_id,
            "sutta_name_en": name_en,
            "sutta_name_pali": "",
            "sutta": sutta,
            "commentary": commentary,
            "chain": chain,
            "aud_file": aud_name,
            "aud_start_s": aud_start,
            "aud_end_s": aud_end,
            "valid": valid,
            "youtube_video_id": vid,
            "youtube_url": url,
        }

        if not dry_run:
            jp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        vf = "T" if valid else "F"
        if valid:
            n_valid += 1
        else:
            n_invalid += 1
        print(f"OK {rel} valid={vf} aud={aud_name} sutta={len(sutta)} comm={len(commentary)}")
        ok += 1

    print(f"Done. {ok} records (valid=true: {n_valid}, valid=false: {n_invalid}).")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="SN playlist → transcripts + corpus JSON + aud/")
    ap.add_argument("--subs-only", action="store_true", help="Only download English VTT files")
    ap.add_argument("--skip-subs", action="store_true", help="Skip yt-dlp subtitle fetch")
    ap.add_argument("--dry-run", action="store_true", help="Print actions without writing JSON or copying")
    args = ap.parse_args()

    if args.subs_only:
        return download_subtitles()

    if not args.skip_subs:
        c = download_subtitles()
        if c != 0:
            print("[warn] subtitle download had errors; continuing with sync using any existing VTT", file=sys.stderr)

    return sync_corpus(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
