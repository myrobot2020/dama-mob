import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def run():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.execute("UPDATE jobs SET status='queued' WHERE sutta_id='AN 1.5' AND worker_type='download'")
    conn.commit()
    conn.close()
    print("AN 1.5 queued grunt.")

if __name__ == "__main__":
    run()
