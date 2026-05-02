import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row
    print("--- UPLOAD JOBS ---")
    for r in conn.execute("select sutta_id, status from jobs where worker_type='gcs_upload'").fetchall():
        print(f"sid=[{r[0]}] status=[{r[1]}]")
    conn.close()

if __name__ == "__main__":
    check()
