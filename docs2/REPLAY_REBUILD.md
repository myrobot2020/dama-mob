# Replay And Rebuild

Replay is simple in Dama:

```text
Recreate local or serving database state from sealed GCS artifacts.
```

It does not require literal q/kdb+ mechanics. It means the database is a projection, not the only truth.

## Source Of Truth

| Layer | Role |
|---|---|
| Local RDB | Current working state, disposable |
| Local artifacts | Work-in-progress and reviewable stage output |
| GCS HDB | Sealed canonical truth |
| Serving DB/indexes | Rebuildable projection |

## What Replay Reads

Replay reads:

```text
GCS HDB manifests
sealed artifact JSON
checksums
schema versions
active run pointers
```

Replay should not need:

```text
local temp files
local RDB current state
old worker memory
dashboard state
```

## Rebuild Targets

| Target | Purpose |
|---|---|
| Local RDB | Restore operational status from sealed data |
| Serving DB | App query tables |
| Search index | Keyword/search lookup |
| Corpus index | Nikaya/book/sutta navigation |
| Image index | App image lookup |
| Validation reports | Verify sealed data quality |

## Rebuild Algorithm

```text
1. List GCS HDB manifests.
2. Resolve active run for each sutta.
3. Download manifest.
4. Verify artifact checksums.
5. Validate artifact schemas.
6. Insert/update serving rows.
7. Recreate indexes.
8. Compare counts against manifests.
9. Emit rebuild report.
```

## Example Command Shape

Final commands may differ, but the system should support this style:

```text
rebuild --from-gcs --nikaya AN --book 01
rebuild --from-gcs --sutta AN1.1
rebuild --from-gcs --all
rebuild --verify-only --nikaya AN --book 01
```

## Rebuild Report

```json
{
  "rebuild_id": "rebuild_...",
  "started_at": "2026-05-01T00:00:00Z",
  "finished_at": "2026-05-01T00:10:00Z",
  "scope": {
    "nikaya": "AN",
    "book": "01"
  },
  "counts": {
    "manifests_read": 80,
    "suttas_loaded": 78,
    "suttas_failed": 2
  },
  "failures": [
    {
      "sutta_id": "AN1.12",
      "reason": "checksum_mismatch"
    }
  ]
}
```

## Why This Matters

Replay gives:

```text
database recovery
schema migration path
index rebuilds
confidence in GCS HDB
debuggable history
ability to rebuild after code changes
```

## Rebuild Validation

After rebuild:

```text
all active manifests loaded
all required artifact files present
counts match rollup manifests
sutta IDs are unique
book/nikaya ordering works
image references resolve
audio timestamp references resolve
app index can load target suttas
```

## What Replay Is Not

Replay is not:

```text
rerunning transcription
regenerating MCQs
re-extracting images
re-downloading audio
```

Those are pipeline stages.

Replay reads already sealed clean artifacts and rebuilds projections.

