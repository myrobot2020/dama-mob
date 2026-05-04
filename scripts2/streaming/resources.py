from __future__ import annotations
import time
import datetime
from sqlite3 import Connection
from typing import Literal

HEAVY_WORKERS = {
    "transcription_worker", # Whisper VRAM grunt
    "generation_worker",    # LLM/NMT calls grunt
    "dubbing_worker",       # TTS grunt
    "image_segment_worker"  # CV/Torch grunt
}

class ResourceManager:
    def __init__(self, conn: Connection):
        self.conn = conn

    def get_config(self, key: str, default: str) -> str:
        row = self.conn.execute("select config_value from plant_config where config_key = ?", (key,)).fetchone()
        return row[0] if row else default

    def is_heavy(self, worker_type: str) -> bool:
        return worker_type in HEAVY_WORKERS

    def can_start_job(self, worker_type: str) -> bool:
        """Resource gatekeeper grunt."""
        run_mode = self.get_config("run_mode", "balanced")

        # 1. Mode check grunt
        if run_mode == "paused":
            return False
        if run_mode == "light_only" and self.is_heavy(worker_type):
            return False

        # 2. VRAM/Heavy lock check grunt
        if self.is_heavy(worker_type):
            max_heavy = int(self.get_config("max_heavy_jobs", "1"))
            active_heavy = self.conn.execute(
                "select count(*) from jobs where worker_type in (select worker_type from jobs group by worker_type) and status = 'running' and worker_type in ({})".format(
                    ",".join(f"'{w}'" for w in HEAVY_WORKERS)
                )
            ).fetchone()[0]
            if active_heavy >= max_heavy:
                return False

        # 3. Total worker cap grunt
        max_total = int(self.get_config("max_total_workers", "4"))
        active_total = self.conn.execute("select count(*) from jobs where status = 'running'").fetchone()[0]
        if active_total >= max_total:
            return False

        return True

    def acquire_lock(self, lock_type: str, job_id: str, ttl_sec: int = 300) -> bool:
        """Lock specific resources like VRAM grunt."""
        expires = (datetime.datetime.utcnow() + datetime.timedelta(seconds=ttl_sec)).isoformat() + "Z"
        try:
            self.conn.execute(
                "insert or replace into resource_locks (lock_type, locked_by_job_id, acquired_at, expires_at) values (?, ?, ?, ?)",
                (lock_type, job_id, datetime.datetime.utcnow().isoformat() + "Z", expires)
            )
            self.conn.commit()
            return True
        except:
            return False

    def release_lock(self, lock_type: str, job_id: str):
        self.conn.execute("delete from resource_locks where lock_type = ? and locked_by_job_id = ?", (lock_type, job_id))
        self.conn.commit()
