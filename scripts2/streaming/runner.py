from __future__ import annotations

import argparse
import time
from pathlib import Path
from scripts2.streaming.db import DEFAULT_DB_PATH, connect
from scripts2.streaming.workers import run_one

def main() -> int:
    parser = argparse.ArgumentParser(description="Run pipeline end-to-end for one sutta.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--sutta-id", required=True)
    args = parser.parse_args()

    # Worker chain in order grunt
    worker_chain = [
        "download",
        "panel_extraction",
        "transcription",
        "sutta_match",
        "segmentation",
        "audio_timestamps",
        "generation",
        "image_match",
        "validation",
        "seal",
        "gcs_upload"
    ]

    print(f"Cave man runner starting hunt for {args.sutta_id} grunt.")

    with connect(args.db) as conn:
        for worker in worker_chain:
            print(f"Running {worker} worker grunt...")
            # We use a custom loop to only run jobs for this specific sutta grunt
            # run_one handles claiming, but we want to make sure it only picks up OUR sutta
            # For simplicity in v1, we assume no other suttas are running grunt.

            # Find the job for this worker and sutta grunt
            job = conn.execute(
                "select job_id from jobs where worker_type=? and sutta_id=? and status='queued'",
                (worker, args.sutta_id)
            ).fetchone()

            if job:
                success = run_one(conn, worker, f"runner_v1_{worker}", sutta_id=args.sutta_id)
                if success:
                    print(f"Worker {worker} finish bone grunt.")
                    conn.commit()
                else:
                    print(f"Worker {worker} fail or no job grunt.")
            else:
                print(f"No queued job for {worker} / {args.sutta_id} grunt.")

    print(f"Cave man runner finish hunt for {args.sutta_id} grunt!")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
