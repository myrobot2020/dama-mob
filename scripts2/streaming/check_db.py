import sqlite3
import json
from scripts2.streaming.db import DEFAULT_DB_PATH

def check():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    print("--- SOURCES ---")
    for r in conn.execute("select sutta_hint, source_id from source_records").fetchall():
        print(f"hint=[{r[0]}] id=[{r[1]}]")

    print("\n--- STAGES ---")
    for r in conn.execute("select sutta_id, stage, status from stage_status").fetchall():
        print(f"sid=[{r[0]}] stage=[{r[1]}] status=[{r[2]}]")

    print("\n--- ARTIFACTS ---")
    for r in conn.execute("select sutta_id, artifact_type, local_uri from artifact_records").fetchall():
        print(f"sid=[{r[0]}] type=[{r[1]}] uri=[{r[2]}]")

    conn.close()

if __name__ == "__main__":
    check()
