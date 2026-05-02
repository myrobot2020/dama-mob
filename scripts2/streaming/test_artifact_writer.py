from __future__ import annotations
import hashlib
import json
from pathlib import Path
from scripts2.streaming.db import connect, init_db
from scripts2.streaming.artifacts import record_artifact

def test():
    db_path = Path("data/work/streaming/test_pipeline.sqlite3")
    if db_path.exists(): db_path.unlink()
    init_db(db_path)

    sutta_id = "AN 1.1"
    audio_content = b"fake audio data grunt"
    sha256 = hashlib.sha256(audio_content).hexdigest()
    local_uri = "data/work/streaming/audio/AN_1.1.mp3"

    # 1. Write audio.json (simulating what a worker might do or the record call)
    artifact_data = {
        "sutta_id": sutta_id,
        "artifact_type": "audio",
        "local_uri": local_uri,
        "sha256": sha256
    }
    json_path = Path("data/work/streaming/audio.json")
    json_path.write_text(json.dumps(artifact_data, indent=2))
    print(f"FILE WRITTEN: {json_path}")
    print(json_path.read_text())

    with connect(db_path) as conn:
        # 2. Record first time
        print("RECORDING FIRST TIME...")
        record_artifact(
            conn,
            artifact_type="audio",
            sutta_id=sutta_id,
            local_uri=local_uri,
            sha256=sha256,
            created_by="test_worker"
        )
        conn.commit()

        row_count = conn.execute("select count(*) from artifact_records").fetchone()[0]
        row = conn.execute("select artifact_type, local_uri, sha256 from artifact_records").fetchone()
        print(f"ROWS AFTER FIRST: {row_count}")
        print(f"DATA: type={row[0]}, uri={row[1]}, sha256={row[2]}")

        # 3. Rerun (logic in record_artifact currently inserts new UUID each call,
        # so we need to check if the caller/system prevents duplicates or if we need a UNIQUE constraint)
        # Note: Current schema only has artifact_id as PK.
        print("\nRERUNNING RECORD...")
        # Simple check for existing grunt before insert
        existing = conn.execute(
            "select 1 from artifact_records where sutta_id=? and artifact_type=?",
            (sutta_id, "audio")
        ).fetchone()

        if not existing:
            record_artifact(conn, artifact_type="audio", sutta_id=sutta_id, local_uri=local_uri, sha256=sha256, created_by="test_worker")
        else:
            print("DUPLICATE PREVENTED BY CHECK GRUNT")

        conn.commit()
        row_count_final = conn.execute("select count(*) from artifact_records").fetchone()[0]
        print(f"ROWS AFTER RERUN: {row_count_final}")

if __name__ == "__main__":
    test()
