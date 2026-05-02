import sqlite3
import os
from scripts2.streaming.db import DEFAULT_DB_PATH

def proof():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    print("--- VALIDATION ARTIFACT ---")
    row = conn.execute("select * from artifact_records where sutta_id='AN 1.1' and artifact_type='validation'").fetchone()
    if row:
        print(f"ID: {row['artifact_id']}")
        print(f"URI: {row['local_uri']}")
        if os.path.exists(row['local_uri']):
            print(f"FILE CONTENT: {open(row['local_uri']).read()}")
    else:
        print("NO VALIDATION ARTIFACT FOUND GRUNT")

    print("\n--- EVENTS ---")
    row = conn.execute("select * from pipeline_events where correlation_id='sutta:AN 1.1' and event_type='sutta.ready_to_seal'").fetchone()
    if row:
        print(f"EVENT FOUND: {row['event_type']}")
    else:
        print("NO READY_TO_SEAL EVENT FOUND GRUNT")

    print("\n--- SEAL JOB ---")
    row = conn.execute("select * from jobs where sutta_id='AN 1.1' and worker_type='seal'").fetchone()
    if row:
        print(f"JOB STATUS: {row['status']}")
    else:
        print("NO SEAL JOB FOUND GRUNT")

    conn.close()

if __name__ == "__main__":
    proof()
