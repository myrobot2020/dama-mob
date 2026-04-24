import json
from google.cloud import storage

def main():
    client = storage.Client()
    bucket = client.bucket("damalight-dama-json")

    items = []
    search_rows = []

    # List all blobs in nikaya/ and extract nikaya names
    blobs = list(bucket.list_blobs(prefix="nikaya/"))

    for blob in blobs:
        if not blob.name.endswith(".json") or "/index.json" in blob.name:
            continue

        # Path: nikaya/{nikaya}/{subfolder}/{sutta}.json
        parts = blob.name.split("/")
        if len(parts) < 3:
            continue

        try:
            content = blob.download_as_text()
            obj = json.loads(content)
        except Exception as e:
            print(f"Error reading {blob.name}: {e}")
            continue

        suttaid = obj.get("suttaid") or obj.get("sutta_id", "")
        if not suttaid:
            continue

        sutta_text = obj.get("sutta", "")
        commentary = obj.get("commentary", "")

        items.append({
            "suttaid": suttaid,
            "title": suttaid,
            "valid": obj.get("valid", False)
        })

        search_rows.append({
            "suttaid": suttaid,
            "blob": f"{suttaid}\n{sutta_text}\n{commentary}".lower()
        })

    # Sort items by suttaid
    items.sort(key=lambda x: x["suttaid"])

    index_data = {
        "items": items,
        "searchRows": search_rows
    }

    # Upload common index
    index_blob = bucket.blob("nikaya/index.json")
    index_blob.upload_from_string(
        json.dumps(index_data, indent=2),
        content_type="application/json"
    )
    print(f"✅ Generated index with {len(items)} suttas across all nikayas in nikaya/index.json")

if __name__ == "__main__":
    main()
