import sqlite3
import os
from scripts2.streaming.db import DEFAULT_DB_PATH

def seed():
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row

    workers = [
        ('Downloader', 'sub_down', 'active', "datetime('now')"),
        ('Segmenter', 'sub_seg', 'busy', "datetime('now')"),
        ('Translator', 'sub_trans', 'error', "datetime('now', '-5 minutes')"),
        ('Validator', 'sub_val', 'idle', "datetime('now', '-10 seconds')"),
    ]

    for name, sub, status, time_func in workers:
        conn.execute(f"insert or replace into worker_checkpoints (worker_name, subscription_name, status, updated_at) values ('{name}', '{sub}', '{status}', {time_func})")

    conn.commit()
    conn.close()
    print("UI seeded with worker data.")

if __name__ == '__main__':
    seed()
