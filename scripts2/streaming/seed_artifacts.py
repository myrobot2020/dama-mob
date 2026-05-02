import sqlite3
from scripts2.streaming.db import DEFAULT_DB_PATH

def seed():
    conn = sqlite3.connect(DEFAULT_DB_PATH)

    artifacts = [
        ('art_1', 'audio', 'AN 1.1', '1.0', 'data/work/streaming/audio/AN_1.1.mp3', 'manual', 'completed'),
        ('art_2', 'transcript', 'AN 1.1', '1.0', 'data/work/streaming/transcripts/AN_1.1.json', 'manual', 'completed'),
        ('art_3', 'segments', 'AN 1.1', '1.0', 'data/work/streaming/segments/AN_1.1.json', 'manual', 'completed')
    ]

    for art in artifacts:
        conn.execute("INSERT OR REPLACE INTO artifact_records (artifact_id, artifact_type, sutta_id, schema_version, local_uri, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?)", art)

    conn.commit()
    conn.close()
    print("Artifacts seeded grunt.")

if __name__ == "__main__":
    seed()
