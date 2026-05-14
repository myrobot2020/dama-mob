import os
import json
import time
import base64
import requests
import re
from datetime import datetime, timedelta

# ================= CONFIGURATION =================
VOLUME = "buddha_v01"
BASE_DIR = rf"C:\Users\ADMIN\Desktop\mob app\data\raw\manga\panels\{VOLUME}\panels\image panels"
DICT_FILE = "clean_dictionary.txt" # Using the cleaned text file now
LIMIT = 50
MODEL = "llava"

EMOJIS = ["🕉️", "🧘", "🪷", "☸️", "🕯️", "🏮", "📜", "🏯", "🐘", "🌳"]
# =================================================

def get_base64_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_path, "rb")

def get_base64_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def load_clean_dictionary():
    print(f"📖 Loading legit dictionary from {DICT_FILE}...")
    try:
        with open(DICT_FILE, 'r', encoding='utf-8') as f:
            return [line.strip().lower() for line in f if line.strip()]
    except Exception as e:
        print(f"❌ Dictionary file missing! Run the cleaning script first. Error: {e}")
        return []

def tag_image_local(image_path, dictionary):
    base64_image = get_base64_image(image_path)

    # We give the model a a hint of the dictionary to guide it
    dict_sample = ", ".join(dictionary[:50])
    prompt = (
        f"Analyze this image. Use ONLY these legit English words for tags: {dict_sample}... "
        f"Return only the words separated by commas. NO Pali, NO accents, NO coordinates."
    )

    try:
        response = requests.post('http://localhost:11434/api/generate',
            json={"model": MODEL, "prompt": prompt, "images": [base64_image], "stream": False},
            timeout=300)

        if response.status_code == 200:
            raw_text = response.json().get('response', '').strip().lower()
            raw_words = re.split(r'[,\s]+', raw_text)

            # THE ULTIMATE FILTER: If the word is not in our clean_dictionary.txt, it is DELETED.
            final_tags = [w.strip().strip('.') for w in raw_words if w.strip().strip('.') in dictionary]

            if not final_tags:
                return ["illustration"]

            return list(dict.fromkeys(final_tags))[:10]
        return ["error: api"]
    except Exception as e:
        return [f"error: {str(e)}"]

def main():
    dictionary = load_clean_dictionary()
    if not dictionary: return

    all_files = [f for f in os.listdir(BASE_DIR) if f.endswith('.png')]
    all_files.sort()
    target_files = all_files[:LIMIT]

    total = len(target_files)
    start_time = time.time()

    print(f"\n🚀 CANON TAGGING STARTING: {total} panels | Model: {MODEL}")
    print("-" * 60)

    for i, filename in enumerate(target_files):
        img_path = os.path.join(BASE_DIR, filename)
        json_path = os.path.join(BASE_DIR, filename.replace('.png', '.json'))

        tags = tag_image_local(img_path, dictionary)

        with open(json_path, 'w') as f:
            json.dump({"filename": filename, "tags": tags, "timestamp": datetime.now().isoformat()}, f, indent=2)

        # UI Logic
        done = i + 1
        elapsed = time.time() - start_time
        avg_time = elapsed / done
        eta = str(timedelta(seconds=int(avg_time * (total - done))))
        current_emoji = EMOJIS[i % len(EMOJIS)]

        print(f"{current_emoji} [{done}/{total}] {filename} -> {', '.join(tags)} | ETA: {eta}")

    print("-" * 60 + f"\n✅ FINISHED!")

if __name__ == "__main__":
    main()
