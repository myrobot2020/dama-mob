import sqlite3
import json

db_path = 'data/work/streaming/pipeline.sqlite3'
c = sqlite3.connect(db_path)
c.row_factory = sqlite3.Row

print("JOB SUMMARY:")
r = c.execute('select status, count(*) from jobs group by status').fetchall()
for row in r:
    print(f"  {row[0]}: {row[1]}")

print("\nAN 2.1.2 JOBS (DETAILED):")
r = c.execute('select * from jobs where sutta_id=?', ("AN 2.1.2",)).fetchall()
for row in r:
    print(f"  {dict(row)}")

print("\nSTALE WORKERS:")
r = c.execute('select worker_name, status, updated_at from worker_checkpoints').fetchall()
for row in r:
    is_stale = c.execute("select (julianday('now') - julianday(?)) * 86400 > 60", (row["updated_at"],)).fetchone()[0]
    print(f"  {row['worker_name']}: status={row['status']}, stale={bool(is_stale)}, last={row['updated_at']}")
