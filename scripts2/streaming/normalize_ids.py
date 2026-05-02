import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def normalize():
    conn = sqlite3.connect(DEFAULT_DB_PATH)

    tables = [
        ("stage_status", "sutta_id"),
        ("jobs", "sutta_id"),
        ("artifact_records", "sutta_id"),
        ("review_items", "sutta_id"),
        ("sealed_runs", "sutta_id")
    ]

    for table, col in tables:
        # AN1.1 -> AN 1.1
        conn.execute(f"UPDATE {table} SET {col} = 'AN 1.1' WHERE {col} = 'AN1.1'")
        conn.execute(f"UPDATE {table} SET {col} = 'AN 1.2' WHERE {col} = 'AN1.2'")
        conn.execute(f"UPDATE {table} SET {col} = 'AN 2.1' WHERE {col} = 'AN2.1'")

    conn.commit()
    conn.close()
    print("IDs normalized grunt.")

if __name__ == "__main__":
    normalize()
