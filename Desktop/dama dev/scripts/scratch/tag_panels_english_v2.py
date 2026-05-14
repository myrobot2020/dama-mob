import os
import json
import time
import base64
import requests
import re
from datetime import datetime, timedelta

# Configuration
VOLUME = "buddha_v01"
BASE_DIR = rf"C:\Users\ADMIN\Desktop\mob app\data\raw\manga\panels\{VOLUME}\panels\image panels"
LIMIT = 50
MODEL = "moondream:latest"

# English terms from your dictionary
ENGLISH_TERMS = [
    "abandonment", "higher powers", "covetousness", "truth-realization",
    "habitual karma", "hatelessness", "determination", "morality",
    "concentration", "wisdom", "suffering", "impermanence", "egolessness",
    "monk", "forest", "household life", "birth", "death", "enlightenment",
    "meditation", "teaching", "pilgrimage", "asceticism", "brahmin", "sacrifice"
]

EMOJIS = ["🕉️", "🧘", "🪷", "☸️", "🕯️", "🏮", "📜", "🏯", "🐘", "🌳"]

def get_base64_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def tag_image(image_path):
    base64_image = get_base64_image(image_path)

    # Using a clearer Q&A format for moondream
    prompt = f"Question: Describe this manga panel using 5 to 10 English keywords. Focus on Buddhist themes like: {', '.join(ENGLISH_TERMS)}. Do not use numbers or coordinates. Answer with only English words separated by commas."

    try:
        response = requests.post('http://localhost:11434/api/generate',
            json={
                "model": MODEL,
                "prompt": prompt,
                "images": [base64_image],
                "stream": False
            }, timeout=90)

        if response.status_code == 200:
            raw_text = response.json().get('response', '').strip()
            # Clean: Remove brackets, numbers, and non-ASCII
            clean_text = re.sub(r'[\[\]\d\.]', '', raw_text)
            tags = [t.strip().lower() for t in clean_text.split(',') if t.strip()]

            # Filter for valid English words (no single letters, no weird symbols)
            final_tags = [t for t in tags if len(t) > 2 and t.isalpha()]

            # If the model failed completely, fallback to a basic analysis
            if not final_tags:
                return ["scene", "illustration", "manga"]
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

    print(f"🚀 FIXED TAGGING: Processing {total} panels in {VOLUME} (ENGLISH ONLY)...")

    for i, filename in enumerate(target_files):
        img_path = os.path.join(BASE_DIR, filename)
        json_path = os.path.join(BASE_DIR, filename.replace('.png', '.json'))

        tags = tag_image(img_path)

        with open(json_path, 'w') as f:
            json.dump({"filename": filename, "tags": tags, "timestamp": datetime.now().isoformat()}, f, indent=2)

        done = i + 1
        elapsed = time.time() - start_time
        avg_time = elapsed / done
        eta_str = str(timedelta(seconds=int(avg_time * (total - done))))

        print(f"{EMOJIS[i % 10]} [{done}/{total}] {filename} -> {', '.join(tags)} | ETA: {eta_str}")

if __name__ == "__main__":
    main()
