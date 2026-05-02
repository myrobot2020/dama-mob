import sqlite3
import hashlib
from pathlib import Path
from scripts2.streaming.db import DEFAULT_DB_PATH

def get_h(p):
    path = Path(p)
    if not path.exists(): return None
    return hashlib.sha256(path.read_bytes()).hexdigest()

def update():
    conn = sqlite3.connect(DEFAULT_DB_PATH)

    updates = [
        ('audio', 'data/work/streaming/audio/AN_1.1.mp3'),
        ('transcript', 'data/work/streaming/transcripts/AN_1.1.json'),
        ('segments', 'data/work/streaming/segments/AN_1.1.json')
    ]

    for atype, path in updates:
        h = get_h(path)
        if h:
            conn.execute("UPDATE artifact_records SET sha256=? WHERE sutta_id='AN 1.1' AND artifact_type=?", (h, atype))
            print(f"Update {atype}: {h}")

    conn.commit()
    conn.close()
    print("Hashes updated in rock grunt.")

if __name__ == "__main__":
    update()
