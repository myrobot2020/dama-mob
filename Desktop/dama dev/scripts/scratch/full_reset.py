import sqlite3
db_path = 'data/work/streaming/pipeline.sqlite3'
c = sqlite3.connect(db_path)
sid = "AN 2.1.2"
print(f"Full reset for {sid}...")
# Clear progress
c.execute('delete from stage_status where sutta_id=?', (sid,))
# Reset all jobs for this sutta
c.execute('''
    update jobs set
        status="queued",
        attempt_count=0,
        is_manual=0,
        locked_by=NULL,
        locked_at=NULL,
        started_at=NULL,
        finished_at=NULL,
        error_type=NULL,
        error_message=NULL,
        retry_after=NULL
    where sutta_id=?
''', (sid,))
c.commit()
print("Done.")
