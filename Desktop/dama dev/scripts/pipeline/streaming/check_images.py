import sqlite3
import json
from scripts.pipeline.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    print("--- IMAGE SELECTIONS ---")
    for r in conn.execute("select * from image_selections").fetchall():
        print(dict(r))

    print("\n--- IMAGE STAGE STATUS ---")
    for r in conn.execute("select * from stage_status where stage='images'").fetchall():
        print(dict(r))

    conn.close()

if __name__ == "__main__":
    check()
