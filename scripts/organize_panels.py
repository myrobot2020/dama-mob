import os
import shutil
from pathlib import Path
import easyocr

# ================== CONFIG ==================
SOURCE_FOLDER = Path("data/raw/manga/panels/buddha_v01/panels")
TEXT_FOLDER = SOURCE_FOLDER / "text panels"
IMAGE_FOLDER = SOURCE_FOLDER / "image panels"

os.makedirs(TEXT_FOLDER, exist_ok=True)
os.makedirs(IMAGE_FOLDER, exist_ok=True)

# Initialize reader (English + Japanese for manga)
print("Loading EasyOCR...")
reader = easyocr.Reader(['en', 'ja'], gpu=False)   # Change gpu=True if you have GPU

# ================== RUN ==================
# Only grab .png files directly in SOURCE_FOLDER (orphans)
files = sorted([f for f in SOURCE_FOLDER.glob("*.png") if f.is_file()])

# Limit to first 100 only
files_to_process = files[:100]

print(f"Found {len(files)} orphan panels. Processing first {len(files_to_process)}.\n")

text_count = 0
image_count = 0

for i, file in enumerate(files_to_process, 1):
    try:
        result = reader.readtext(str(file), detail=0, paragraph=False)
        detected_text = " ".join(result).strip()

        has_text = len(detected_text) > 5   # at least some meaningful text

        if has_text:
            shutil.move(str(file), TEXT_FOLDER / file.name)
            text_count += 1
            print(f"[{i}/{len(files_to_process)}] {file.name} -> TEXT ✅")
        else:
            shutil.move(str(file), IMAGE_FOLDER / file.name)
            image_count += 1
            print(f"[{i}/{len(files_to_process)}] {file.name} -> IMAGE")

    except Exception as e:
        print(f"[{i}/{len(files_to_process)}] {file.name} -> ERROR ({e}), moved to IMAGE")
        shutil.move(str(file), IMAGE_FOLDER / file.name)
        image_count += 1

print("\n=== FINISHED ===")
print(f"Processed      : {len(files_to_process)}")
print(f"Text panels    : {text_count}")
print(f"Image panels   : {image_count}")
