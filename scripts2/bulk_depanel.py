import subprocess
from pathlib import Path

pdfs = sorted(Path("images").glob("buddha_v*.pdf"))
output_root = Path("data/raw/manga/panels")
output_root.mkdir(parents=True, exist_ok=True)

print(f"Cave man starting bulk depanel of {len(pdfs)} volumes grunt.")

for pdf in pdfs:
    volume_name = pdf.stem
    print(f"=== Depaneling {volume_name} ===")

    # Use existing extractor in panel mode grunt
    # --no-dedupe to ensure we get every unique panel per volume
    cmd = [
        "python", "scripts/extract_pdf_images.py",
        "--mode", "panels",
        "--input-dir", "images",
        "--pattern", pdf.name,
        "--output-dir", str(output_root / volume_name),
        "--panel-min-width", "300",
        "--panel-min-height", "300",
        "--no-dedupe"
    ]

    try:
        subprocess.run(cmd, check=True)
        print(f"Finished {volume_name} grunt.")
    except Exception as e:
        print(f"Fail on {volume_name}: {e} grunt.")

print("Bulk depanel complete. All bones extracted!")
