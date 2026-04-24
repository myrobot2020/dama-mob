import json
import os
from pathlib import Path
from google.cloud import storage

def main():
    client = storage.Client()
    bucket = client.bucket("damalight-dama-json")
    val_root = Path("data/validated-json")

    if not val_root.is_dir():
        print(f"Directory {val_root} not found.")
        return 1

    count = 0
    # Recursive glob to find all sutta JSON files
    for path in val_root.rglob("*.json"):
        if path.name == "_index.json" or path.name.startswith("_"):
            continue

        # Target blob path: nikaya/{nikaya}/{subfolder}/{sutta}.json
        rel_path = path.relative_to(val_root)
        blob_path = f"nikaya/{rel_path.as_posix()}"

        blob = bucket.blob(blob_path)
        blob.upload_from_filename(str(path), content_type="application/json")
        count += 1
        if count % 50 == 0:
            print(f"Uploaded {count} files...")

    print(f"✅ Synced {count} files to GCS bucket.")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
