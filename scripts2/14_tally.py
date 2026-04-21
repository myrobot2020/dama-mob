from __future__ import annotations

import json
from google.cloud import storage

def main() -> int:
    client = storage.Client()
    bucket = client.bucket("damalight-dama-json")

    stats = {} # nikaya -> stats

    blobs = bucket.list_blobs(prefix="nikaya/")
    for blob in blobs:
        if not blob.name.endswith(".json") or "/index.json" in blob.name:
            continue

        parts = blob.name.split("/")
        if len(parts) < 3:
            continue
        nikaya = parts[1]

        if nikaya not in stats:
            stats[nikaya] = {"total": 0, "valid_true": 0, "commentary_non_empty": 0}

        try:
            content = blob.download_as_text()
            obj = json.loads(content)
        except Exception:
            continue

        if not isinstance(obj, dict):
            continue

        stats[nikaya]["total"] += 1
        if obj.get("valid") is True:
            stats[nikaya]["valid_true"] += 1
        if str(obj.get("commentary") or "").strip():
            stats[nikaya]["commentary_non_empty"] += 1

    for nk, s in stats.items():
        print(f"[{nk}] total={s['total']}, valid={s['valid_true']}, commentary={s['commentary_non_empty']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
