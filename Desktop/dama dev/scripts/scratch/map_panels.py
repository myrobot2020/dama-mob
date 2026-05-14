import os
import json
import base64
import requests
from tqdm import tqdm
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import io

# === CONFIGURATION ===
ROOT_DIR = r"C:/Users/ADMIN/Desktop/mob app"
IMAGE_DIR = os.path.join(ROOT_DIR, "data", "raw", "manga", "panels", "buddha_v01", "panels", "image panels")
SUTTA_FILE = os.path.join(ROOT_DIR, "an_sutta_names.txt")
OUTPUT_FILE = os.path.join(ROOT_DIR, "sutta_panel_mapping.json")
OLLAMA_URL = "http://localhost:11434/api/generate"

# Use moondream for speed (5-10x faster than llava)
IMAGE_MODEL = "moondream"  # Fastest option
MATCH_MODEL = "llama3"

# Performance settings
MAX_WORKERS = 3  # Parallel images (watch your GPU memory)
IMAGE_MAX_SIZE = 768  # Resize to this max dimension (faster processing)
BATCH_SAVE_INTERVAL = 20  # Save less frequently
MAX_RETRIES = 2
RETRY_DELAY = 2
TIMEOUT = 120

def load_suttas():
    suttas = []
    if not os.path.exists(SUTTA_FILE):
        print(f"ERROR: Sutta file not found at {SUTTA_FILE}")
        sys.exit(1)
    with open(SUTTA_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if '|' not in line:
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 3:
                suttas.append({
                    'ref': parts[0],
                    'name': parts[1],
                    'chain': parts[2].replace('Chain:', '').strip()
                })
    return suttas

def resize_and_encode_image(image_path, max_size=768):
    """Resize image to reduce processing time"""
    try:
        with Image.open(image_path) as img:
            # Convert RGBA to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')

            # Resize if too large
            if max(img.size) > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Encode to JPEG (smaller than PNG, faster to transmit)
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode()
    except Exception as e:
        # Fallback to original
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode()

def call_ollama_fast(prompt, model, images=None):
    """Optimized Ollama call with retry"""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": 150,  # Limit response length for speed
            "temperature": 0.7
        }
    }
    if images:
        payload["images"] = images

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=TIMEOUT)
            response.raise_for_status()
            return response.json().get('response', '').strip()
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                return f"ERROR: {str(e)[:100]}"
    return "ERROR: Max retries exceeded"

def create_sutta_context(suttas, max_suttas=30):
    """Only send top relevant suttas (much faster)"""
    # For speed, just send the first 30 suttas as reference
    # You can make this smarter by keyword matching later
    result = []
    for s in suttas[:max_suttas]:
        result.append(f"{s['ref']} - {s['name']}: {s['chain'][:60]}...")
    return "\n".join(result)

def process_single_panel(img_name, suttas, sutta_context):
    """Process one image - designed for parallel execution"""
    img_path = os.path.join(IMAGE_DIR, img_name)

    try:
        # Step 1: Analyze image (faster with resize)
        img_b64 = resize_and_encode_image(img_path, IMAGE_MAX_SIZE)

        # Short, focused prompt for speed
        analysis_prompt = "Describe this manga panel briefly (15-20 words): characters, action, Buddhist theme if any."
        description = call_ollama_fast(analysis_prompt, IMAGE_MODEL, [img_b64])

        if description.startswith("ERROR"):
            return img_name, {"error": description, "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}

        # Step 2: Match to sutta (using llama3 - faster)
        match_prompt = f"""Panel: "{description}"
Match to best sutta from:
{sutta_context}

Return: SUTTA: [ref] | REASON: [1-2 words]"""

        mapping = call_ollama_fast(match_prompt, MATCH_MODEL)

        return img_name, {
            "description": description,
            "mapping": mapping[:200],  # Trim long responses
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    except Exception as e:
        return img_name, {"error": str(e), "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}

def main():
    print("=== FAST Sutta-Panel Mapper ===")
    print(f"Model: {IMAGE_MODEL} (vision) + {MATCH_MODEL} (text)")
    print(f"Parallel workers: {MAX_WORKERS}")
    print(f"Image resize: {IMAGE_MAX_SIZE}px max\n")

    # Load data
    suttas = load_suttas()
    print(f"Loaded {len(suttas)} suttas")

    sutta_context = create_sutta_context(suttas, max_suttas=40)

    # Get images
    if not os.path.exists(IMAGE_DIR):
        print(f"ERROR: {IMAGE_DIR} not found")
        sys.exit(1)

    images = [f for f in os.listdir(IMAGE_DIR)
              if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    print(f"Found {len(images)} images\n")

    # Load checkpoint
    results = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                results = json.load(f)
            print(f"Resuming: {len(results)} already processed")
        except:
            print("Starting fresh")

    to_process = [img for img in images if img not in results]
    print(f"To process: {len(to_process)} images")

    if not to_process:
        print("All done!")
        return

    # Process in parallel
    print(f"\nProcessing with {MAX_WORKERS} parallel workers...")
    processed_count = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_single_panel, img_name, suttas, sutta_context): img_name
            for img_name in to_process
        }

        with tqdm(total=len(to_process), desc="Processing", unit="img") as pbar:
            for future in as_completed(futures):
                img_name, result = future.result()
                results[img_name] = result
                processed_count += 1
                pbar.update(1)

                # Update progress bar with speed info
                if processed_count % 5 == 0:
                    avg_time = pbar.format_dict['elapsed'] / processed_count
                    pbar.set_postfix({"avg": f"{avg_time:.1f}s"})

                # Save checkpoint periodically
                if processed_count % BATCH_SAVE_INTERVAL == 0:
                    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                        json.dump(results, f, indent=2)
                    tqdm.write(f"✓ Checkpoint saved ({processed_count}/{len(to_process)})")

    # Final save
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)

    # Summary
    errors = sum(1 for v in results.values() if "error" in v)
    print(f"\n✅ Complete! {len(results)-errors} successful, {errors} errors")
    print(f"Results saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()