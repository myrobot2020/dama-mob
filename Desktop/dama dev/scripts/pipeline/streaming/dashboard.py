import os
import time
import sqlite3
from scripts.pipeline.streaming.db import connect
from scripts.pipeline.streaming.resource_guard import thermal_snapshot

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_stats():
    with connect() as conn:
        events = conn.execute("select count(*) as n from pipeline_events").fetchone()["n"]
        queued = conn.execute("select count(*) as n from jobs where status = 'queued'").fetchone()["n"]
        failed = conn.execute("select count(*) as n from jobs where status = 'failed'").fetchone()["n"]
        completed = conn.execute("select count(*) as n from jobs where status = 'completed'").fetchone()["n"]

        # Recent activity grunt
        recent = conn.execute("""
            select sutta_id, worker_type, status, updated_at
            from jobs order by updated_at desc limit 5
        """).fetchall()

        return {
            "events": events,
            "queued": queued,
            "failed": failed,
            "completed": completed,
            "recent": recent
        }

def main():
    while True:
        stats = get_stats()
        snap = thermal_snapshot()

        clear()
        print("=== CAVE MAN FARM DASHBOARD ===")
        print(f"Events: {stats['events']} | Queued: {stats['queued']} | Failed: {stats['failed']} | Done: {stats['completed']}")
        print(f"GPU Temp: {snap.gpu_temp_c or '??'}C | CPU Temp: {snap.cpu_temp_c or '??'}C")
        print("-" * 30)
        print("RECENT ACTIVITY:")
        for r in stats["recent"]:
            print(f"[{r['updated_at']}] {r['sutta_id']} - {r['worker_type']}: {r['status']}")

        print("-" * 30)
        print("Ctrl+C to exit grunt.")
        time.sleep(5)

if __name__ == "__main__":
    main()
