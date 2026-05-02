import sqlite3
import uuid
from scripts2.streaming.db import DEFAULT_DB_PATH

def queue():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    job_id = f"job_{uuid.uuid4().hex}"
    conn.execute(
        "INSERT INTO jobs (job_id, event_id, worker_type, sutta_id, status, updated_at) VALUES (?, 'manual', 'gcs_upload', 'AN 1.1', 'queued', '2026-05-01T13:00:00Z')",
        (job_id,)
    )
    conn.commit()
    conn.close()
    print("Upload job queued grunt.")

if __name__ == "__main__":
    queue()
