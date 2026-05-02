import sqlite3
import os
import json
from scripts2.streaming.db import DEFAULT_DB_PATH

def proof():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    print("--- UPLOAD RECEIPT ---")
    receipt_path = "data/work/gcs-mirror/AN_1.1/upload_receipt.json"
    if os.path.exists(receipt_path):
        print(open(receipt_path).read())
    else:
        print("RECEIPT NOT FOUND GRUNT")

    print("\n--- SEALED RUNS ROW ---")
    row = conn.execute("select * from sealed_runs where sutta_id='AN 1.1'").fetchone()
    if row:
        print(f"SUTTA: {row['sutta_id']} STATUS: {row['status']}")
    else:
        print("NO SEALED RUN ROW FOUND GRUNT")

    conn.close()

if __name__ == "__main__":
    proof()
