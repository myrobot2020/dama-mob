import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def purge():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    hints = ['AN 1.1', 'AN 1.50', 'AN 1.pl']

    for hint in hints:
        print(f"Purging {hint} grunt.")
        conn.execute("DELETE FROM source_records WHERE sutta_hint=?", (hint,))
        conn.execute("DELETE FROM stage_status WHERE sutta_id=?", (hint,))
        conn.execute("DELETE FROM jobs WHERE sutta_id=?", (hint,))
        conn.execute("DELETE FROM artifact_records WHERE sutta_id=?", (hint,))
        conn.execute("DELETE FROM sealed_runs WHERE sutta_id=?", (hint,))

    conn.commit()
    conn.close()
    print("Purge finish in rock grunt.")

if __name__ == "__main__":
    purge()
