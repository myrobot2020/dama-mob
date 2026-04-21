#!/usr/bin/env python3
"""
Merge cleaned YouTube caption text into validated sutta fields.

Expects WebVTT from yt-dlp (e.g. data/raw/<nik>/transcripts/<video_id>.en.vtt).
Run after: yt-dlp --write-auto-sub --skip-download --sub-langs en -o data/raw/<nik>/transcripts/%(id)s <url>

Does not rename sutta ids or paths — only replaces `sutta` body text with stripped transcript.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# video_id -> relative path under data/validated-json/
VIDEO_TO_JSON: dict[str, str] = {
    "7J0h61kRqBg": "sn/sn1/suttas/1.1.json",
    "G9KEzovtvfE": "sn/sn1/suttas/1.2.json",
    "U_4WrY1s4Hk": "dn/dn1/suttas/1.1.json",
    "I94ZyzJ97NE": "dn/dn1/suttas/1.2.json",
    "LTos07bzzbk": "mn/mn1/suttas/1.1.json",
    "3QT6dyjFTfE": "mn/mn1/suttas/1.2.json",
    "euxEqyNyUb8": "kn/kn1/suttas/1.1.json",
    "0ToXHUNZFaQ": "kn/kn1/suttas/1.2.json",
}

TAG_RE = re.compile(r"<[^>]+>")
TIME_LINE = re.compile(r"^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->")

# Align with stripTranscriptNoise in damaApi.ts (subset in Python)
NOISE_BRACKET = re.compile(
    r"\s*\[(?:Music|music|MUSIC|Laughter|laughter|LAUGHTER|Applause|applause|"
    r"Noise|noise|Silence|silence)\]\s*",
    re.I,
)


def find_vtt_for_video(dama_root: Path, video_id: str) -> Path | None:
    for nik in ("sn", "dn", "mn", "kn"):
        tr = dama_root / "data" / "raw" / nik / "transcripts"
        if not tr.is_dir():
            continue
        for name in (f"{video_id}.en.vtt", f"{video_id}.en-orig.vtt"):
            p = tr / name
            if p.is_file():
                return p
    return None


def dedupe_adjacent_duplicate_blocks(words: list[str]) -> list[str]:
    """Collapse A B A B -> A B when two consecutive equal-length blocks match (auto-captions)."""
    out: list[str] = []
    i = 0
    n = len(words)
    max_chunk = min(200, max(0, n // 2))
    while i < n:
        hi = min(max_chunk, (n - i) // 2)
        lo = 5
        best_l = 0
        while lo <= hi:
            mid = (lo + hi) // 2
            if mid >= 5 and i + 2 * mid <= n and words[i : i + mid] == words[i + mid : i + 2 * mid]:
                best_l = mid
                lo = mid + 1
            else:
                hi = mid - 1
        if best_l >= 5:
            out.extend(words[i : i + best_l])
            i += 2 * best_l
        else:
            out.append(words[i])
            i += 1
    return out


def collapse_adjacent_duplicate_words(words: list[str]) -> list[str]:
    """Remove doubled words (july july, and and)."""
    out: list[str] = []
    i = 0
    while i < len(words):
        if i + 1 < len(words) and words[i] == words[i + 1]:
            out.append(words[i])
            i += 2
            continue
        out.append(words[i])
        i += 1
    return out


def collapse_duplicate_runs(text: str) -> str:
    words = text.split()
    for _ in range(30):
        nw = dedupe_adjacent_duplicate_blocks(words)
        if nw == words:
            break
        words = nw
    for _ in range(8):
        nw = collapse_adjacent_duplicate_words(words)
        if nw == words:
            break
        words = nw
    return " ".join(words)


def vtt_to_plaintext(vtt_path: Path) -> str:
    raw = vtt_path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\n+", raw)
    pieces: list[str] = []
    for block in blocks:
        lines = block.strip().splitlines()
        if not lines:
            continue
        if not TIME_LINE.search(lines[0]):
            continue
        body = "\n".join(lines[1:])
        body = TAG_RE.sub("", body)
        body = re.sub(r"\s+", " ", body).strip()
        if not body:
            continue
        best = max((ln.strip() for ln in body.split("\n")), key=len, default="")
        if best:
            pieces.append(best)

    out: list[str] = []
    for p in pieces:
        if not out:
            out.append(p)
            continue
        prev = out[-1]
        if p == prev:
            continue
        if p.startswith(prev) and len(p) >= len(prev):
            out[-1] = p
        elif prev in p and len(p) > len(prev):
            out[-1] = p
        else:
            out.append(p)

    text = " ".join(out)
    text = NOISE_BRACKET.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = collapse_duplicate_runs(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main() -> int:
    corpus = REPO / "data" / "validated-json"
    updated = 0
    for vid, rel in VIDEO_TO_JSON.items():
        jp = corpus / rel
        if not jp.is_file():
            print(f"[skip] missing target JSON for {vid} -> {rel}")
            continue
        vtt = find_vtt_for_video(REPO, vid)
        if not vtt:
            print(f"[skip] no VTT for {vid} -> {rel}")
            continue
        sutta_text = vtt_to_plaintext(vtt)
        if len(sutta_text) < 80:
            print(f"[warn] short text ({len(sutta_text)} chars) for {vid}")
        obj = json.loads(jp.read_text(encoding="utf-8"))
        obj["sutta"] = sutta_text
        jp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"OK {rel} ({len(sutta_text)} chars) <- {vtt.name}")
        updated += 1
    print(f"Updated {updated} files.")
    return 0 if updated else 1


if __name__ == "__main__":
    raise SystemExit(main())
