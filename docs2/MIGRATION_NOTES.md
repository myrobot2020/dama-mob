# Migration Notes From Old Docs

Docs2 does not copy the old docs one-to-one. It reorganizes them around the data plant.

## Old Docs Reviewed

| Old Doc | Useful Material Brought Forward |
|---|---|
| `docs/README.md` | Core doc-set idea and reading order |
| `docs/ARCHITECTURE.md` | Existing stack, GCS, Supabase, Cloud Run, Python pipeline boundary |
| `docs/DATABASE.md` | Primary/secondary/tertiary data classification |
| `docs/BUILD.md` | Existing commands and old pipeline stage names |
| `docs/SCALE.md` | Static-first, batching, rate/cost controls |
| `docs/SCREENS.md` | App screen dependencies; future dashboard is separate |
| `docs/AI.md` | Model/version/tracing and generated-output safety |
| `docs/primary-data-build-checklist.md` | Data quality checks and 85% coverage target context |
| `README.md` | Current GCS buckets and pipeline command summary |

## What Changed

Old mental model:

```text
run scripts
validate output
sync to GCS
app reads GCS
```

New mental model:

```text
feed handlers publish events
async subscribers produce artifacts
local RDB tracks current state
validation gates complete suttas
seal subscriber uploads canonical artifacts to GCS HDB
replay rebuilds serving DB/indexes
dashboard operates the plant
```

## Redundancy Removed

Old docs repeated:

```text
data inventory
pipeline commands
GCS sync notes
progress/status scorecards
```

Docs2 separates:

```text
architecture roles
events
subscribers
artifacts
GCS HDB
dashboard
rebuild
runbook
```

## Mapping Old To New

| Old Concept | Docs2 Concept |
|---|---|
| Python pipeline scripts | Subscribers/workers |
| `scripts2/sync_gcs.py` | Seal subscriber |
| `npm run pipe2:*` stages | Event-driven stage contracts |
| Pipeline tally | Validation + rebuild verification |
| GCS JSON bucket | HDB and/or serving projection |
| Generated data | Artifact contracts |
| Validation reports | `validation.json` and dashboard review items |
| Data sync | Seal to GCS + replay/rebuild |
| PM status | Dashboard stage progress |

## Items Still To Decide

| Decision | Options |
|---|---|
| Local RDB engine | SQLite, Postgres, existing app DB |
| Local event bus | DB-backed queue, file log, in-process first |
| Real Pub/Sub timing | Later only, after local contracts stabilize |
| Final GCS prefixes | Reuse existing buckets or create new `hdb/` prefix |
| Image selector implementation | App route, local admin UI, or standalone tool |
| Artifact schema validation | JSON Schema, Zod, Pydantic, or mixed |

## Non-Negotiables

```text
GCS sealed data is canonical.
Local DB is rebuildable.
Workers communicate through events.
Images have their own pipeline.
Audio timestamps are first-class artifacts.
Dashboard must show pipeline truth.
Completed suttas can seal individually.
```

