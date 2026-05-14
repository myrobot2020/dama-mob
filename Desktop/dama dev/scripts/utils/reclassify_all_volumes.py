import os
import shutil
import time
import cv2
import pytesseract
from pathlib import Path

# ================== TESSERACT CONFIG ==================
def fix_tesseract():
    try:
        pytesseract.get_tesseract_version()
        return True
    except: pass

    possible_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        os.path.join(os.getenv('LOCALAPPDATA', ''), r'Tesseract-OCR\tesseract.exe'),
        r'C:\Users\ADMIN\Miniconda3\Library\bin\tesseract.exe',
        r'C:\Python314\Scripts\tesseract.exe'
    ]

    for path in possible_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            return True
    return False

if not fix_tesseract():
    print("Warning: Tesseract not found in standard paths. Ensure it's in your PATH.")

# ================== CONFIG ==================
BASE_PATH = Path("data/raw/manga/panels")
VOLUMES = [f"buddha_v{i:02d}" for i in range(1, 9)]
TEXT_THRESHOLD = 2 # From classify_manga_panels.py

def get_image_folder_files(volume_path):
    # Try 'panels/image panels' subdirectory
    panels_dir = volume_path / "panels"
    if not panels_dir.exists():
        panels_dir = volume_path / volume_path.name

    image_folder = panels_dir / "image panels"
    text_folder = panels_dir / "text panels"

    if not image_folder.exists():
        return None, None, []

    files = sorted([f for f in image_folder.glob("*.png") if f.is_file()])
    return image_folder, text_folder, files

def is_text_panel(image_path):
    img = cv2.imread(str(image_path))
    if img is None:
        return False, 0, ""

    # Preprocessing as in classify_manga_panels.py
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    # Run OCR
    custom_config = r'--oem 3 --psm 6'
    raw_text = pytesseract.image_to_string(thresh, config=custom_config)

    # Filter meaningful words
    words = [word for word in raw_text.split() if len(word) > 1]
    score = len(words)

    return score >= TEXT_THRESHOLD, score, raw_text.strip()

# ================== RUN ==================
all_files = []
# volume_map: image_folder -> (text_folder, [files])
volume_map = {}

for vol in VOLUMES:
    vol_path = BASE_PATH / vol
    img_dir, txt_dir, files = get_image_folder_files(vol_path)
    if img_dir and files:
        all_files.extend([(img_dir, txt_dir, f) for f in files])

total_files = len(all_files)
print(f"Total panels to re-scan in image folders: {total_files}\n")

if total_files == 0:
    print("No files found in image folders.")
    exit()

moved_count = 0
stayed_count = 0
start_time = time.time()

for i, (img_dir, txt_dir, file_path) in enumerate(all_files, 1):
    try:
        os.makedirs(txt_dir, exist_ok=True)

        has_text, score, snippet = is_text_panel(file_path)

        if has_text:
            shutil.move(str(file_path), txt_dir / file_path.name)
            moved_count += 1
            status = "MOVED TO TEXT ✅"
        else:
            stayed_count += 1
            status = "STAYED IN IMAGE"

    except Exception as e:
        stayed_count += 1
        status = f"ERROR ({e})"

    # Progress and ETA every 10 files (matching original script style)
    if i % 10 == 0 or i == total_files:
        elapsed = time.time() - start_time
        avg_time = elapsed / i
        remaining = total_files - i
        eta_seconds = remaining * avg_time

        if eta_seconds > 3600:
            eta_str = f"{int(eta_seconds // 3600)}h {int((eta_seconds % 3600) // 60)}m"
        elif eta_seconds > 60:
            eta_str = f"{int(eta_seconds // 60)}m {int(eta_seconds % 60)}s"
        else:
            eta_str = f"{int(eta_seconds)}s"

        print(f"[{i}/{total_files}] {int(i/total_files*100)}% | MOVED: {moved_count} | STAYED: {stayed_count} | ETA: {eta_str}")

print("\n=== FINISHED RE-SCANNING ALL VOLUMES ===")
print(f"Total processed : {total_files}")
print(f"Moved to TEXT   : {moved_count}")
print(f"Stayed in IMAGE : {stayed_count}")
print(f"Total Time      : {int((time.time() - start_time) // 60)}m {int((time.time() - start_time) % 60)}s")
