#!/usr/bin/env python3
"""
Shape teacher-download JSON like data/validated-json/an1/suttas/1.18.13.json:

- sutta: first sutta passage when cues exist (Thus have I heard … end of the suta)
- commentary: intro + teacher exposition (rest of transcript)
- chain: { items, count, is_ordered, category }
- aud_file / aud_start_s / aud_end_s: per-video mp3 in aud/ when yt-dlp (+ffmpeg) succeed

Re-run after replacing raw transcript; does not touch AN nipāta files.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AUD = REPO / "aud"

# video_id -> corpus json path (under data/validated-json/)
ROWS: list[dict[str, str]] = [
    {"vid": "7J0h61kRqBg", "rel": "sn/sn1/suttas/1.1.json", "safe": "SN_1_1"},
    {"vid": "G9KEzovtvfE", "rel": "sn/sn1/suttas/1.2.json", "safe": "SN_1_2"},
    {"vid": "U_4WrY1s4Hk", "rel": "dn/dn1/suttas/1.1.json", "safe": "DN_1_1"},
    {"vid": "I94ZyzJ97NE", "rel": "dn/dn1/suttas/1.2.json", "safe": "DN_1_2"},
    {"vid": "LTos07bzzbk", "rel": "mn/mn1/suttas/1.1.json", "safe": "MN_1_1"},
    {"vid": "3QT6dyjFTfE", "rel": "mn/mn1/suttas/1.2.json", "safe": "MN_1_2"},
    {"vid": "euxEqyNyUb8", "rel": "kn/kn1/suttas/1.1.json", "safe": "KN_1_1"},
    {"vid": "0ToXHUNZFaQ", "rel": "kn/kn1/suttas/1.2.json", "safe": "KN_1_2"},
]


def split_transcript(text: str) -> tuple[str, str]:
    """First sutta block vs teacher commentary (intro + discussion)."""
    t = text.strip()
    if not t:
        return "", ""
    low = t.lower()
    start_phrase = "thus have i heard"
    end_phrase = "end of the suta"
    i = low.find(start_phrase)
    if i >= 0:
        j = low.find(end_phrase, i)
        if j >= 0:
            sutta = t[i : j + len(end_phrase)].strip()
            before = t[:i].strip()
            after = t[j + len(end_phrase) :].strip()
            commentary = (before + " " + after).strip()
            return sutta, commentary
        sutta = t[i : i + 3200]
        commentary = (t[:i].strip() + " " + t[i + 3200 :].strip()).strip()
        return sutta.strip(), commentary.strip()
    if len(t) <= 700:
        return t, ""
    return t[:550].strip(), t[550:].strip()


def chain_from_title(sutta_name_en: str, sutta: str) -> dict:
    name = (sutta_name_en or "").strip()
    first = (name.split()[0].lower() if name else "teaching").strip(".,;:")
    low_s = sutta.lower()
    if "crossing the flood" in low_s:
        items = ["crossing the flood"]
        cat = "simile"
    elif first and first not in ("part", "chapter", "introduction"):
        items = [first]
        cat = "single factor"
    else:
        items = [name[:48].lower() if name else "exposition"]
        cat = "teacher exposition"
    return {
        "items": items,
        "count": len(items),
        "is_ordered": True,
        "category": cat,
    }


def yt_duration_seconds(url: str) -> float | None:
    try:
        out = subprocess.check_output(
            ["yt-dlp", "--dump-json", "--skip-download", url],
            stderr=subprocess.DEVNULL,
            timeout=120,
        )
        data = json.loads(out.decode("utf-8", errors="replace").split("\n", 1)[0])
        d = data.get("duration")
        return float(d) if d is not None else None
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError, ValueError):
        return None


def try_download_mp3(url: str, out_stem: Path) -> Path | None:
    """Write mp3 next to out_stem (no extension); returns path if .mp3 exists."""
    out_stem.parent.mkdir(parents=True, exist_ok=True)
    pattern = str(out_stem) + ".%(ext)s"
    try:
        subprocess.run(
            [
                "yt-dlp",
                "-x",
                "--audio-format",
                "mp3",
                "--no-playlist",
                "-o",
                pattern,
                url,
            ],
            cwd=str(REPO),
            check=True,
            timeout=7200,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except (subprocess.CalledProcessError, OSError):
        return None
    mp3 = out_stem.with_suffix(".mp3")
    return mp3 if mp3.is_file() else None


def build_record(obj: dict, vid: str, safe: str, url: str, *, download_audio: bool) -> dict:
    full = str(obj.get("sutta") or "").strip()
    sutta, commentary = split_transcript(full)
    if not sutta and full:
        sutta, commentary = full[:400].strip(), full[400:].strip()

    chain = chain_from_title(str(obj.get("sutta_name_en") or ""), sutta)
    aud_stem = AUD / f"{safe}__{vid}"
    mp3 = None
    dur = yt_duration_seconds(url) if download_audio else None
    if download_audio:
        mp3 = try_download_mp3(url, aud_stem)

    if mp3 and mp3.is_file():
        aud_file = mp3.name
        aud_start = 0.0
        aud_end = float(dur) if dur and dur > 0 else 0.0
    else:
        aud_file = str(obj.get("aud_file") or "").strip() or "005_Anguttara Nikaya Book 1D 1184 - 12148 by Bhante Hye Dhammavuddho Mahathera.mp3"
        aud_start = float(obj.get("aud_start_s") or 0)
        aud_end = float(obj.get("aud_end_s") or 120)

    # Field order like AN example; youtube last for optional API parity
    out: dict = {
        "sutta_id": obj.get("sutta_id"),
        "sutta_name_en": obj.get("sutta_name_en"),
        "sutta_name_pali": obj.get("sutta_name_pali") or "",
        "sutta": sutta,
        "commentary": commentary,
        "chain": chain,
        "aud_file": aud_file,
        "aud_start_s": aud_start,
        "aud_end_s": aud_end,
        "valid": True,
    }
    if obj.get("youtube_video_id"):
        out["youtube_video_id"] = obj["youtube_video_id"]
    if obj.get("youtube_url"):
        out["youtube_url"] = obj["youtube_url"]
    return out


def main() -> int:
    download_audio = "--no-audio" not in sys.argv
    corpus = REPO / "data" / "validated-json"
    for row in ROWS:
        rel = row["rel"]
        p = corpus / rel
        if not p.is_file():
            print(f"[skip] missing {rel}", file=sys.stderr)
            continue
        obj = json.loads(p.read_text(encoding="utf-8"))
        vid = row["vid"]
        url = f"https://www.youtube.com/watch?v={vid}"
        new_obj = build_record(obj, vid, row["safe"], url, download_audio=download_audio)
        p.write_text(json.dumps(new_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"OK {rel} sutta={len(new_obj['sutta'])} comm={len(new_obj['commentary'])} aud={new_obj['aud_file']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
