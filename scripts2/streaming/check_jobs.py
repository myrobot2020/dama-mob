import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row
    print("--- VALIDATION JOBS ---")
    for r in conn.execute("select sutta_id, status, error_type from jobs where worker_type='validation'").fetchall():
        print(f"sid=[{r[0]}] status=[{r[1]}] err=[{r[2]}]")
    conn.close()

if __name__ == "__main__":
    check()
