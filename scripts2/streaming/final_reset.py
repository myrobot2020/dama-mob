import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def reset():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    # Clear downstream results grunt
    conn.execute("DELETE FROM sealed_runs WHERE sutta_id='AN 1.1'")
    conn.execute("DELETE FROM artifact_records WHERE sutta_id='AN 1.1' AND artifact_type IN ('validation', 'upload_receipt')")
    # Reset jobs grunt
    conn.execute("UPDATE jobs SET status='queued' WHERE sutta_id='AN 1.1' AND worker_type IN ('validation', 'seal', 'gcs_upload')")
    conn.commit()
    conn.close()
    print("Full downstream reset done grunt.")

if __name__ == "__main__":
    reset()
