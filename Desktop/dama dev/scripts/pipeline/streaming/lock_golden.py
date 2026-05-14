import sqlite3
from pathlib import Path
from scripts.pipeline.streaming.db import DEFAULT_DB_PATH

def main():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    # Mark AN Book 1 and Book 2 as manual to protect them from supervisor overwrite grunt
    # Matches patterns like "AN 1.1", "AN 2.1.2"
    result = conn.execute("""
        UPDATE jobs
        SET is_manual = 1
        WHERE sutta_id LIKE 'AN 1.%' OR sutta_id LIKE 'AN 2.%'
    """)
    conn.commit()
    print(f"Locked {result.rowcount} golden jobs from Books 1 & 2. Grunt.")
    conn.close()

if __name__ == "__main__":
    main()
