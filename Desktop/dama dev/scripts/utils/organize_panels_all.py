import os
import shutil
import time
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR

# ================== CONFIG ==================
BASE_PATH = Path("data/raw/manga/panels")
VOLUMES = [f"buddha_v{i:02d}" for i in range(1, 9)]

# Initialize RapidOCR
print("Loading RapidOCR...")
engine = RapidOCR()

def get_orphan_files(volume_path):
    # Try 'panels' or 'volume_name' subdirectory
    panels_dir = volume_path / "panels"
    if not panels_dir.exists():
        panels_dir = volume_path / volume_path.name

    if not panels_dir.exists():
        return None, []

    # Orphans are .png files directly in panels_dir
    files = sorted([f for f in panels_dir.glob("*.png") if f.is_file()])
    return panels_dir, files

# ================== RUN ==================
all_files = []
volume_map = {} # panels_dir -> [files]

for vol in VOLUMES:
    vol_path = BASE_PATH / vol
    panels_dir, files = get_orphan_files(vol_path)
    if panels_dir and files:
        volume_map[panels_dir] = files
        all_files.extend([(panels_dir, f) for f in files])

total_files = len(all_files)
print(f"Total orphan panels found across all volumes: {total_files}\n")

if total_files == 0:
    print("No orphan files found.")
    exit()

text_count = 0
image_count = 0
start_time = time.time()

for i, (panels_dir, file_path) in enumerate(all_files, 1):
    try:
        # Ensure destination folders exist
        text_folder = panels_dir / "text panels"
        image_folder = panels_dir / "image panels"
        os.makedirs(text_folder, exist_ok=True)
        os.makedirs(image_folder, exist_ok=True)

        # Process OCR
        result, _ = engine(str(file_path))
        detected_text = ""
        if result:
            detected_text = " ".join([line[1] for line in result]).strip()

        has_text = len(detected_text) > 5

        if has_text:
            shutil.move(str(file_path), text_folder / file_path.name)
            text_count += 1
        else:
            shutil.move(str(file_path), image_folder / file_path.name)
            image_count += 1

    except Exception as e:
        # If error, move to image panels as safe default
        image_folder = panels_dir / "image panels"
        os.makedirs(image_folder, exist_ok=True)
        shutil.move(str(file_path), image_folder / file_path.name)
        image_count += 1

    # Progress and ETA every 10 files
    if i % 10 == 0 or i == total_files:
        elapsed = time.time() - start_time
        avg_time = elapsed / i
        remaining = total_files - i
        eta_seconds = remaining * avg_time

        # Format ETA
        if eta_seconds > 3600:
            eta_str = f"{int(eta_seconds // 3600)}h {int((eta_seconds % 3600) // 60)}m"
        elif eta_seconds > 60:
            eta_str = f"{int(eta_seconds // 60)}m {int(eta_seconds % 60)}s"
        else:
            eta_str = f"{int(eta_seconds)}s"

        print(f"[{i}/{total_files}] {int(i/total_files*100)}% | TEXT: {text_count} | IMAGE: {image_count} | ETA: {eta_str}")

print("\n=== FINISHED ALL VOLUMES ===")
print(f"Total processed : {total_files}")
print(f"Total TEXT      : {text_count}")
print(f"Total IMAGE     : {image_count}")
print(f"Total Time      : {int((time.time() - start_time) // 60)}m {int((time.time() - start_time) % 60)}s")
