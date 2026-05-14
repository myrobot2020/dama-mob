from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from google.cloud import storage


BUCKET = "damalight-dama-json"
LOCAL_ROOT = Path("data/validated-json")
GCS_PREFIX = "nikaya"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _is_valid_sutta(raw: dict[str, Any]) -> bool:
    return raw.get("valid") is not False and bool(_text(raw.get("sutta")))


def _sutta_only(raw: dict[str, Any]) -> dict[str, Any]:
    keep: dict[str, Any] = {
        "sutta_id": _text(raw.get("sutta_id") or raw.get("suttaid")),
        "sutta_name_en": _text(raw.get("sutta_name_en")),
        "sutta_name_pali": _text(raw.get("sutta_name_pali")),
        "sutta": _text(raw.get("sutta")),
        "valid": True,
    }
    for key in ("sc_id", "sc_url", "sc_sutta", "chain"):
        if raw.get(key):
            keep[key] = raw[key]
    return keep


def _summary(raw: dict[str, Any]) -> dict[str, Any]:
    sid = _text(raw.get("sutta_id") or raw.get("suttaid"))
    if sid and not sid.upper().startswith("AN "):
        sid = f"AN {sid}"
    title = _text(raw.get("sutta_name_en")) or sid
    return {"suttaid": sid, "title": title, "has_commentary": False, "nikaya": "AN"}


def _natural_key(suttaid: str) -> tuple[int, ...]:
    core = re.sub(r"^AN\s+", "", suttaid.strip(), flags=re.I)
    nums = tuple(int(part) for part in re.findall(r"\d+", core))
    return nums or (0,)


def _iter_an_json() -> list[Path]:
    return sorted((LOCAL_ROOT / "an").glob("an*/*.json"))


def main() -> int:
    if not LOCAL_ROOT.is_dir():
        print(f"Directory not found: {LOCAL_ROOT}")
        return 1

    client = storage.Client()
    bucket = client.bucket(BUCKET)
    items: list[dict[str, Any]] = []
    search_rows: list[dict[str, str]] = []
    uploaded = 0
    skipped = 0

    for path in _iter_an_json():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            skipped += 1
            print(f"skip invalid json: {path} ({exc})")
            continue
        if not _is_valid_sutta(raw):
            skipped += 1
            continue

        out = _sutta_only(raw)
        rel = path.relative_to(LOCAL_ROOT).as_posix()
        blob = bucket.blob(f"{GCS_PREFIX}/{rel}")
        blob.upload_from_string(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n",
            content_type="application/json; charset=utf-8",
        )
        uploaded += 1
        item = _summary(raw)
        items.append(item)
        search_rows.append(
            {
                "suttaid": item["suttaid"],
                "blob": f"{item['suttaid']}\n{out['sutta']}".lower(),
            }
        )

    items.sort(key=lambda item: _natural_key(item["suttaid"]))
    index = {"items": items, "searchRows": search_rows}
    bucket.blob(f"{GCS_PREFIX}/index.json").upload_from_string(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        content_type="application/json; charset=utf-8",
    )
    print(f"Uploaded {uploaded} sutta-only AN JSON files to gs://{BUCKET}/{GCS_PREFIX}/")
    print(f"Skipped {skipped} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
