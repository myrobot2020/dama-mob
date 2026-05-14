#!/usr/bin/env python3
"""
Match local corpus JSON files to SuttaCentral IDs (uids) without using any paid tokens.

Strategy:
1) Use explicit `sc_id` / `sc_url` fields when present.
2) Otherwise, normalize local `sutta_id` (e.g. "SN 1.20" -> "sn1.20") and verify via SC suttaplex.
3) For legacy SN playlist-index files like "SN 1.pl.49", infer the likely SC uid from the transcript,
   e.g. "start with 1.20" -> sn1.20 or "starting on the 51st ... (first sutta)" -> sn51.1.

Writes JSONL with one record per local file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SC_SUTTAPLEX = "https://suttacentral.net/api/suttaplex/"


def load_json_lenient(path: Path) -> dict[str, Any]:
    txt = path.read_text(encoding="utf-8", errors="replace")
    try:
        data = json.loads(txt)
    except json.JSONDecodeError:
        data = json.loads(txt, strict=False)
    if not isinstance(data, dict):
        return {}
    return data


def uid_from_sc_fields(obj: dict[str, Any]) -> str:
    sid = str(obj.get("sc_id") or "").strip()
    if sid:
        return sid
    url = str(obj.get("sc_url") or "").strip()
    if url:
        # Accept .../sn1.20 or .../sn1.20/en/sujato; keep only the uid segment.
        m = re.search(r"/([a-z]{2}\d+(?:\.\d+)*(?:\.[a-z0-9-]+)?)", url, flags=re.IGNORECASE)
        if m:
            return m.group(1).lower()
    return ""


def normalize_sutta_id_to_uid(sutta_id: str) -> str:
    s = (sutta_id or "").strip()
    if not s:
        return ""
    # Typical: "SN 1.20", "AN 5.3.30"
    m = re.match(r"^(AN|SN|DN|MN|KN)\s+(.+)$", s, flags=re.IGNORECASE)
    if m:
        nik = m.group(1).lower()
        rest = m.group(2).strip()
        # Remove spaces, keep dots and "pl" segments.
        rest = re.sub(r"\s+", "", rest)
        return f"{nik}{rest}"
    return ""


_RX_START_WITH_DOTTED = re.compile(r"\bstart\s+with\s+(\d+\.\d+(?:\.\d+)*)\b", re.IGNORECASE)
_RX_COME_TO_DOTTED = re.compile(r"\bcome\s+to\s+(\d+\.\d+(?:\.\d+)*)\b", re.IGNORECASE)
_RX_STARTING_ON_THE_NTH = re.compile(r"\bstart(?:ing)?\s+on\s+the\s+(\d+)(?:st|nd|rd|th)\b", re.IGNORECASE)
_RX_START_WITH_THE_NTH_SUTTA = re.compile(
    r"\bstart\s+with\s+the\s+(\d+)(?:st|nd|rd|th)\b", re.IGNORECASE
)


def infer_uid_from_transcript(obj: dict[str, Any]) -> tuple[str, str]:
    """
    Returns (uid, reason). Empty uid means "could not infer".
    """
    t = str(obj.get("sutta") or "")
    if not t:
        return "", "no transcript"

    m = _RX_START_WITH_DOTTED.search(t)
    if m:
        dotted = m.group(1)
        # In these talks, "start with 1.xx" almost always refers to SN 1.xx.
        return f"sn{dotted}", f'transcript "start with {dotted}"'

    m = _RX_COME_TO_DOTTED.search(t)
    if m:
        dotted = m.group(1)
        return f"sn{dotted}", f'transcript "come to {dotted}"'

    m = _RX_STARTING_ON_THE_NTH.search(t)
    if m:
        sam = int(m.group(1))
        m2 = _RX_START_WITH_THE_NTH_SUTTA.search(t)
        if m2:
            sutta_num = int(m2.group(1))
        else:
            sutta_num = 1
        return f"sn{sam}.{sutta_num}", f'transcript "starting on the {sam}th" + sutta {sutta_num}'

    return "", "no recognizable start marker"


def fetch_suttaplex(uid: str, timeout_s: int = 30) -> dict[str, Any] | None:
    if not uid:
        return None
    url = SC_SUTTAPLEX + uid
    req = Request(url, headers={"accept": "application/json"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        if e.code == 404:
            return None
        raise
    except URLError:
        return None
    data = json.loads(raw)
    # API returns an array; first element has metadata.
    if isinstance(data, list) and data:
        meta = data[0] if isinstance(data[0], dict) else None
        if not meta:
            return None
        # SuttaCentral sometimes returns a "blank" meta object (all nulls) instead of 404.
        if not (meta.get("uid") or meta.get("acronym") or meta.get("translated_title") or meta.get("original_title")):
            return None
        return meta
    if isinstance(data, dict):
        if not (data.get("uid") or data.get("acronym") or data.get("translated_title") or data.get("original_title")):
            return None
        return data
    return None


def iter_json_files(root: Path) -> list[Path]:
    return sorted(
        p
        for p in root.rglob("*.json")
        if p.is_file() and p.name != "_index.json" and not p.name.startswith("_")
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Match local corpus JSON to SuttaCentral IDs (uids).")
    ap.add_argument("--root", default="data/validated-json", help="Root directory of local corpus JSON.")
    ap.add_argument("--out", default="data/sc_matches.jsonl", help="Output JSONL path.")
    ap.add_argument("--no-network", action="store_true", help="Do not call SuttaCentral API; only infer uids.")
    args = ap.parse_args()

    root = Path(args.root)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    paths = iter_json_files(root)
    if not paths:
        print(f"No JSON files found under {root}", file=sys.stderr)
        return 2

    n_ok = 0
    n_unknown = 0

    with out.open("w", encoding="utf-8", newline="\n") as f:
        for path in paths:
            obj = load_json_lenient(path)
            sutta_id = str(obj.get("sutta_id") or obj.get("suttaid") or "").strip()
            name_en = str(obj.get("sutta_name_en") or "").strip()

            uid = uid_from_sc_fields(obj)
            reason = "sc_fields"
            if not uid:
                uid = normalize_sutta_id_to_uid(sutta_id)
                reason = "normalized_sutta_id"
            # Transcript inference is useful for SN playlist-indexed files and for cases where
            # `sutta_id` in JSON is still a placeholder.
            if obj.get("sutta"):
                inferred, why = infer_uid_from_transcript(obj)
                if inferred:
                    # Prefer transcript-based inference when both look like SN ids and disagree.
                    if uid.startswith("sn") and inferred.startswith("sn") and inferred != uid:
                        uid = inferred
                        reason = why
                    # If we had no uid at all, take the inferred one.
                    elif not uid:
                        uid = inferred
                        reason = why

            sc_meta: dict[str, Any] | None = None
            if uid and not args.no_network:
                sc_meta = fetch_suttaplex(uid)

            rec = {
                "local_path": str(path.as_posix()),
                "local_sutta_id": sutta_id,
                "local_sutta_name_en": name_en,
                "uid": uid,
                "reason": reason,
                "sc": sc_meta or None,
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            if sc_meta:
                n_ok += 1
            else:
                n_unknown += 1

    print(f"Wrote {out} ({len(paths)} files). Verified via SC: {n_ok}. Unverified/unknown: {n_unknown}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
