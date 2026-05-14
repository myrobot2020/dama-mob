import sqlite3
db_path = 'data/work/streaming/pipeline.sqlite3'
c = sqlite3.connect(db_path)
print("Nudging AN 2.1.2...")
c.execute('update jobs set is_manual=0 where sutta_id=?', ("AN 2.1.2",))
# Also reset download stage specifically just in case
c.execute('update jobs set status="queued", attempt_count=0 where sutta_id=? and worker_type="download"', ("AN 2.1.2",))
c.commit()
print("Done.")
