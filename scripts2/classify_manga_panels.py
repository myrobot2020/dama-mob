import base64
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
INPUT_DIR = Path("data/raw/manga/panels")
OUTPUT_MANIFEST = INPUT_DIR / "classification_manifest.json"
MODEL = "moondream:latest"
OLLAMA_URL = "http://localhost:11434/api/generate"

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def classify_panel(image_path):
    base64_image = encode_image(image_path)

    prompt = (
        "Analyze this manga panel. "
        "First, categorize it as either 'image' (if it shows a scene, characters, or scenery) "
        "or 'text' (if it is primarily a title, credits page, or just text). "
        "If it is an 'image', provide a 1-sentence description of what is depicted. "
        "Return the result in this exact format: TYPE: [image/text] | DESCRIPTION: [Your description]"
    )

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "images": [base64_image],
        "stream": False,
        "options": {
            "temperature": 0.1
        }
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("response", "").strip()
    except Exception as e:
        return f"ERROR: {str(e)}"

def parse_response(response_text):
    # Default values
    panel_type = "image"
    description = ""

    if "TYPE: text" in response_text.upper():
        panel_type = "text"

    if "DESCRIPTION:" in response_text.upper():
        description = response_text.split("DESCRIPTION:")[-1].strip()
    else:
        description = response_text # Fallback to full response

    return panel_type, description

def main():
    print(f"🤖 Starting Manga Panel Classification using {MODEL}...")

    # Load existing manifest to resume
    manifest = {}
    if OUTPUT_MANIFEST.exists():
        try:
            manifest = json.loads(OUTPUT_MANIFEST.read_text(encoding="utf-8"))
            print(f"📂 Loaded existing manifest with {len(manifest)} entries.")
        except:
            pass

    # Find all panels
    all_panels = sorted(list(INPUT_DIR.rglob("*.png")))
    to_process = [p for p in all_panels if str(p.relative_to(INPUT_DIR)) not in manifest]

    total = len(all_panels)
    processed = len(manifest)
    start_time = time.time()

    print(f"📸 Found {total} total panels. {len(to_process)} remaining to process.")

    try:
        for i, panel_path in enumerate(to_process, 1):
            rel_path = str(panel_path.relative_to(INPUT_DIR))

            # Dashboard Progress
            elapsed = time.time() - start_time
            avg = elapsed / i if i > 0 else 0
            eta = avg * (len(to_process) - i)
            eta_m, eta_s = divmod(int(eta), 60)

            print(f"\r🔍 [{processed + i}/{total}] Processing: {panel_path.name} | ETA: {eta_m:02d}:{eta_s:02d}s   ", end="", flush=True)

            raw_resp = classify_panel(panel_path)
            if "ERROR" in raw_resp:
                print(f"\n❌ Error on {panel_path.name}: {raw_resp}")
                continue

            p_type, p_desc = parse_response(raw_resp)

            manifest[rel_path] = {
                "type": p_type,
                "description": p_desc,
                "volume": panel_path.parent.name,
                "filename": panel_path.name
            }

            # Periodic save
            if i % 10 == 0:
                OUTPUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    except KeyboardInterrupt:
        print("\n\n⚠️ Interrupted! Saving progress...")
    finally:
        OUTPUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"\n\n✅ Classification complete! Manifest saved to: {OUTPUT_MANIFEST}")

        # Summary
        img_count = sum(1 for v in manifest.values() if v['type'] == 'image')
        txt_count = sum(1 for v in manifest.values() if v['type'] == 'text')
        print(f"📊 Summary: {img_count} Images | {txt_count} Text/Titles")

if __name__ == "__main__":
    main()
