import sqlite3
import json
from scripts2.streaming.db import DEFAULT_DB_PATH

def dump():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    candidates = []
    for r in conn.execute("select * from image_candidates").fetchall():
        row = dict(r)
        row["tags"] = json.loads(row["tags_json"])
        # Fix path grunt
        row["imageUrl"] = f"/panels/{Path(row['local_path']).name}" if row["local_path"] else None
        candidates.append(row)

    selections = {}
    for r in conn.execute("select * from image_selections").fetchall():
        selections[r["sutta_id"]] = dict(r)

    print(json.dumps({"candidates": candidates, "selections": selections}, ensure_ascii=False))
    conn.close()

if __name__ == "__main__":
    from pathlib import Path
    dump()
