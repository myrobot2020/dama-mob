import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row
    print("--- LATEST EVENTS ---")
    for r in conn.execute("select event_type, correlation_id from pipeline_events order by occurred_at desc limit 10").fetchall():
        print(f"type=[{r[0]}] correlation=[{r[1]}]")
    conn.close()

if __name__ == "__main__":
    check()
