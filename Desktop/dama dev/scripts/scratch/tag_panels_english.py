import os
import json
import time
import base64
import requests
from datetime import datetime, timedelta

# Configuration
VOLUME = "buddha_v01"
BASE_DIR = rf"C:\Users\ADMIN\Desktop\mob app\data\raw\manga\panels\{VOLUME}\panels\image panels"
LIMIT = 50
MODEL = "moondream:latest"

# List of English terms from the dictionary
ENGLISH_TERMS = [
    "abandonment", "aberration", "higher powers", "covetousness",
    "truth-realization", "habitual karma", "hatelessness", "determination",
    "morality", "concentration", "wisdom", "suffering", "impermanence",
    "egolessness", "monk", "forest", "household life", "birth", "death",
    "enlightenment", "meditation", "teaching", "pilgrimage", "asceticism"
]

EMOJIS = ["🕉️", "🧘", "🪷", "☸️", "🕯️", "🏮", "📜", "🏯", "🐘", "🌳"]

def get_base64_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def tag_image(image_path):
    base64_image = get_base64_image(image_path)

    prompt = f"""
    Analyze this manga panel from a biography of the Buddha.
    Tag it with 5-10 simple ENGLISH words describing the scene.
    STRICT RULE: Use ONLY English words. No Pali, no Sanskrit, no other languages.
    Focus on these concepts if they apply: {', '.join(ENGLISH_TERMS)}
    Return ONLY a comma-separated list of English tags.
    """

    try:
        response = requests.post('http://localhost:11434/api/generate',
            json={
                "model": MODEL,
                "prompt": prompt,
                "images": [base64_image],
                "stream": False
            }, timeout=90) # Increased timeout

        if response.status_code == 200:
            result = response.json().get('response', '').strip()
            # Clean up: Remove any non-English/non-comma text if the model hallucinated headers
            tags = [t.strip().lower() for t in result.split(',') if t.strip()]
            # Filter to ensure we don't have long sentences or Pali leftovers
            final_tags = []
            for t in tags:
                if len(t.split()) <= 3 and t.isascii(): # Only ASCII/short phrases
                    final_tags.append(t)
            return final_tags[:10]
        else:
            return ["error: api failure"]
    except Exception as e:
        return [f"error: {str(e)}"]

def main():
    files = [f for f in os.listdir(BASE_DIR) if f.endswith('.png')]
    files.sort()
    target_files = files[:LIMIT]

    total = len(target_files)
    start_time = time.time()

    print(f"🚀 Re-tagging first {total} panels in {VOLUME} with STRICT ENGLISH ONLY...")

    for i, filename in enumerate(target_files):
        img_path = os.path.join(BASE_DIR, filename)
        json_path = os.path.join(BASE_DIR, filename.replace('.png', '.json'))

        # Process every file (no skipping)
        tags = tag_image(img_path)

        # Save
        with open(json_path, 'w') as f:
            json.dump({"filename": filename, "tags": tags, "timestamp": datetime.now().isoformat()}, f, indent=2)

        # Progress Calculation
        done = i + 1
        remaining = total - done
        elapsed = time.time() - start_time
        avg_time = elapsed / done
        eta_seconds = avg_time * remaining
        eta_str = str(timedelta(seconds=int(eta_seconds)))

        emoji = EMOJIS[i % len(EMOJIS)]
        print(f"{emoji} [{done}/{total}] {filename} -> Tags: {', '.join(tags)} | ETA: {eta_str}")

if __name__ == "__main__":
    main()
