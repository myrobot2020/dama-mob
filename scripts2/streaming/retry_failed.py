import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def retry():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    cur = conn.execute("UPDATE jobs SET status='queued', error_type=NULL, error_message=NULL WHERE status='failed'")
    count = cur.rowcount
    conn.commit()
    conn.close()
    print(f"Retried {count} failed jobs grunt.")

if __name__ == "__main__":
    retry()
