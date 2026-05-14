import sqlite3
import csv
import json
import re
from pathlib import Path
from scripts.pipeline.streaming.db import DEFAULT_DB_PATH

def seed():
    csv_path = Path("tmp/tezuka_word_match_20260430_093037/canonical_word_panel_matches.csv")
    if not csv_path.exists():
        print(f"Bones missing at {csv_path} grunt.")
        return

    conn = sqlite3.connect(DEFAULT_DB_PATH)

    # Map panel_id to its proposal data
    panels = {}

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            p_file = row["panel_file"]
            p_id = Path(p_file).name.replace(".jpg", "").replace(".png", "")

            # Extract book and page
            book = "unknown"
            page = 0
            m = re.search(r"v(\d+)_p(\d+)", p_id)
            if m:
                book = f"volume_{m.group(1)}"
                page = int(m.group(2))

            if p_id not in panels:
                panels[p_id] = {
                    "panel_id": p_id,
                    "source_book_id": book,
                    "page": page,
                    "local_path": p_file,
                    "quality_score": float(row["score"]) if row["score"] else 0.0,
                    "caption": row.get("caption", ""),
                    "proposals": []
                }

            panels[p_id]["proposals"].append({
                "sutta_id": row["sutta_id"],
                "canonical_word": row["canonical_word"],
                "reason": row["reason"],
                "score": row["score"],
                "rank": row["rank"]
            })

    print(f"Loading {len(panels)} panel bones grunt.")

    for p_id, p in panels.items():
        conn.execute("""
            INSERT OR REPLACE INTO image_candidates (
                panel_id, source_book_id, page, local_path,
                quality_score, tags_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'ready')
        """, (
            p_id, p["source_book_id"], p["page"], p["local_path"],
            p["quality_score"], json.dumps({"proposals": p["proposals"], "caption": p["caption"]}, ensure_ascii=False),
        ))

    conn.commit()
    conn.close()
    print("Candidates seeded in rock grunt.")

if __name__ == "__main__":
    seed()
