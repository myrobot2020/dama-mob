#!/usr/bin/env python3
"""Generate the production corpus index from local validated JSON files.

The app's local dev middleware builds `/__dama_corpus__/index.json` from actual
validated files, skipping records that are not publishable. This script mirrors
that behavior for the GCS `nikaya/index.json` object.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


VALID_TRUE = {"1", "true", "yes", "y", "on"}
VALID_FALSE = {"0", "false", "no", "n", "off", ""}


def strip_an_prefix(s: str) -> str:
    return re.sub(r"^AN\s+", "", s.strip(), flags=re.I).strip()


def normalize_sutta_id(raw: str) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    m = re.match(r"^(AN|SN|DN|MN|KN)\s+", s, flags=re.I)
    if m:
        return f"{m.group(1).upper()} {s[m.end():].strip()}"
    if re.match(r"^\d", s):
        return f"AN {s}"
    return s


def coerce_valid(raw: Any) -> bool:
    if raw is True:
        return True
    if raw is False:
        return False
    if isinstance(raw, (int, float)):
        return raw != 0
    if isinstance(raw, str):
        s = raw.strip().lower()
        if s in VALID_TRUE:
            return True
        if s in VALID_FALSE:
            return False
    return False


def ensure_english_sutta_suffix(title: str) -> str:
    t = re.sub(r"\s+", " ", str(title or "")).strip()
    if not t:
        return ""
    t = t[:1].upper() + t[1:]
    if re.search(r"\bsutta$", t, flags=re.I):
        return t
    return f"{t} sutta"


def passes_corpus_gate(obj: dict[str, Any]) -> bool:
    if not coerce_valid(obj.get("valid")):
        return False
    if not str(obj.get("sutta") or "").strip():
        return False
    if not str(obj.get("aud_file") or "").strip():
        return False
    return True


def title_from_obj(obj: dict[str, Any]) -> str:
    en = str(obj.get("sutta_name_en") or "").strip()
    if en:
        return ensure_english_sutta_suffix(en)
    sutta = re.sub(r"\s+", " ", str(obj.get("sutta") or "")).strip()
    return sutta[:72] + ("..." if len(sutta) > 72 else "")


def infer_nikaya(suttaid: str) -> str:
    raw = str(suttaid or "").strip()
    up = raw.upper()
    if re.match(r"^\s*SN(?:[\s.]|$)", raw, flags=re.I):
        return "SN"
    if re.match(r"^\s*DN[\s.]", raw, flags=re.I) or re.match(r"^DN\d", up):
        return "DN"
    if re.match(r"^\s*MN[\s.]", raw, flags=re.I) or re.match(r"^MN\d", up):
        return "MN"
    if re.match(r"^\s*KN\b", raw, flags=re.I):
        return "KN"
    return "AN"


def sort_key(item: dict[str, Any]) -> str:
    return str(item["suttaid"])


def build_index(val_root: Path) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    search_rows: list[dict[str, str]] = []

    paths = sorted(
        p
        for p in val_root.rglob("*.json")
        if p.is_file() and p.name != "_index.json" and not p.name.startswith("_")
    )

    for path in paths:
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"skip {path}: {exc}")
            continue
        if not isinstance(obj, dict) or not passes_corpus_gate(obj):
            continue

        sid = normalize_sutta_id(str(obj.get("suttaid") or obj.get("sutta_id") or ""))
        if not sid:
            continue
        sutta = str(obj.get("sutta") or "").strip()
        commentary = str(obj.get("commentary") or obj.get("commentry") or "").strip()

        items.append(
            {
                "suttaid": sid,
                "title": title_from_obj(obj),
                "has_commentary": bool(commentary),
                "nikaya": infer_nikaya(sid),
            }
        )
        search_rows.append(
            {
                "suttaid": sid,
                "blob": f"{sid}\n{sutta}\n{commentary}".lower(),
            }
        )

    items.sort(key=sort_key)
    search_rows.sort(key=lambda row: row["suttaid"])
    return {"items": items, "searchRows": search_rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="data/validated-json")
    ap.add_argument("--out", default="data/validated-json/index.json")
    ap.add_argument("--upload", action="store_true", help="Upload to gs://damalight-dama-json/nikaya/index.json")
    args = ap.parse_args()

    val_root = Path(args.root)
    if not val_root.is_dir():
        raise SystemExit(f"Directory {val_root} not found.")

    index_data = build_index(val_root)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(index_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {out_path} with {len(index_data['items'])} indexed suttas.")

    if args.upload:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket("damalight-dama-json")
        blob = bucket.blob("nikaya/index.json")
        blob.cache_control = "no-cache, max-age=0"
        blob.upload_from_string(
            json.dumps(index_data, ensure_ascii=False, indent=2),
            content_type="application/json",
        )
        print("Uploaded gs://damalight-dama-json/nikaya/index.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
