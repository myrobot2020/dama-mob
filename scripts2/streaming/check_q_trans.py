import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    for r in conn.execute("select sutta_id, status from jobs where worker_type='transcription' and status='queued'").fetchall():
        print(f"queued sid={r[0]}")
    conn.close()

if __name__ == "__main__":
    check()
