import sqlite3
import os
import json
from scripts2.streaming.db import DEFAULT_DB_PATH

def proof():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    print("--- MANIFEST FILE ---")
    manifest_path = "data/work/sealed/AN_1.1/manifest.json"
    if os.path.exists(manifest_path):
        print(open(manifest_path).read())
    else:
        print("MANIFEST NOT FOUND GRUNT")

    print("\n--- SEALED RUNS ROW ---")
    row = conn.execute("select * from sealed_runs where sutta_id='AN 1.1'").fetchone()
    if row:
        print(dict(row))
    else:
        print("NO SEALED RUN ROW FOUND GRUNT")

    conn.close()

if __name__ == "__main__":
    proof()
