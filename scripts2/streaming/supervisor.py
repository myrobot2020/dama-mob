from __future__ import annotations

import time
import logging
import sqlite3
from pathlib import Path
from datetime import UTC, datetime, timedelta

from scripts2.streaming.db import connect
from scripts2.streaming.workers import run_one
from scripts2.streaming.resource_guard import thermal_snapshot, env_int

# Supervisor Chief Grunt
# 1. Respects is_manual to save human work.
# 2. Cools down GPU strictly.
# 3. Retries failed bones with backoff.
# 4. Sequential GPU hand-offs.

LOG = logging.getLogger("supervisor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SAFE_GPU_TEMP = env_int("DAMA_SAFE_GPU_TEMP_C", 70)
MAX_GPU_TEMP = env_int("DAMA_MAX_GPU_TEMP_C", 78)

GPU_WORKERS = {"transcription", "keys", "generation", "translation", "dubbing"}

def utc_now_str() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def get_next_job(conn: sqlite3.Connection):
    now = utc_now_str()
    # Find queued jobs that aren't manual, aren't waiting for retry
    return conn.execute("""
        SELECT * FROM jobs
        WHERE status IN ('queued', 'failed')
        AND attempt_count < max_attempts
        AND is_manual = 0
        AND (retry_after IS NULL OR retry_after < ?)
        ORDER BY created_at ASC
        LIMIT 1
    """, (now,)).fetchone()

def wait_for_cooling():
    while True:
        snap = thermal_snapshot()
        gpu_temp = snap.gpu_temp_c or 0
        if gpu_temp < SAFE_GPU_TEMP:
            break
        LOG.info(f"GPU too hot ({gpu_temp}C). Chief orders 30s rest grunt.")
        time.sleep(30)

def main_loop():
    LOG.info("Supervisor Chief starting the hunt grunt.")

    while True:
        with connect() as conn:
            job = get_next_job(conn)

            if not job:
                LOG.info("No bones to pick. Chief rests 10s.")
                time.sleep(10)
                continue

            worker_type = job["worker_type"]
            sutta_id = job["sutta_id"]

            # Resource Check
            if worker_type in GPU_WORKERS:
                wait_for_cooling()

            LOG.info(f"Dispatching {worker_type} for {sutta_id} grunt.")

            # Execute worker logic
            try:
                # We use the existing run_one from workers.py as a black box
                success = run_one(conn, worker_type, f"supervisor_v1_{worker_type}", sutta_id=sutta_id)

                if not success:
                    # Likely a resource guard pause or concurrency miss
                    time.sleep(5)
            except Exception as e:
                LOG.error(f"Job {job['job_id']} crashed: {e}")
                # Increment attempts and set backoff
                retry_time = (datetime.now(UTC) + timedelta(minutes=10)).isoformat()
                conn.execute("""
                    UPDATE jobs SET
                        status = 'failed',
                        attempt_count = attempt_count + 1,
                        retry_after = ?,
                        error_message = ?
                    WHERE job_id = ?
                """, (retry_time, str(e), job["job_id"]))
                conn.commit()

        # Small gap between jobs for the machine to breathe
        time.sleep(2)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        LOG.info("Supervisor Chief leaving the cave. Grunt.")
