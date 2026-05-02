# Dama Docs2

Docs2 is the new architecture documentation set for the Dama data plant.

This folder is anchored by the spread diagram:

- `data-plant-diagram-spread.png`
- `data-plant-diagram-spread.svg`

Docs2 replaces the old "linear scripts that sync to GCS" mental model with a local tickerplant-style data plant:

```text
external sources
  -> feed handlers
  -> local tickerplant / event bus
  -> async subscribers
  -> local RDB + local artifacts
  -> validation
  -> seal complete sutta to GCS HDB
  -> replay/rebuild serving DB and indexes
  -> Dama app, gateway, dashboard
```

Core rule:

```text
Everything stays local until a complete sutta is validated and sealed to GCS.
```

## Reading Order

| Order | Doc | Purpose |
|---:|---|---|
| 1 | `README.md` | Entry point and reading order |
| 2 | `ARCHITECTURE.md` | System roles and the anchor diagram explained |
| 3 | `EVENT_CATALOG.md` | Event names, payload fields, publishers, subscribers |
| 4 | `SUBSCRIBERS.md` | Worker contracts and async processing rules |
| 5 | `LOCAL_RDB_SCHEMA.md` | Local operational database tables |
| 6 | `SOURCE_REGISTRY.md` | Source intake, dedupe, and provenance |
| 7 | `ARTIFACTS.md` | Local and sealed artifact schemas |
| 8 | `GCS_HDB.md` | Canonical sealed storage layout and manifests |
| 9 | `IMAGE_PIPELINE.md` | Buddha book image extraction and selector UI |
| 10 | `GATEWAY.md` | Read/control layer for app and dashboard |
| 11 | `DASHBOARD.md` | Pipeline progress UI requirements |
| 12 | `REPLAY_REBUILD.md` | Recreate DB/indexes from sealed GCS artifacts |
| 13 | `CONFIG_ENV.md` | Environment variables and config boundaries |
| 14 | `AI_GENERATION.md` | Generated content, model traces, grounding |
| 15 | `SECURITY_PRIVACY.md` | Secrets, user data, GCS, operator controls |
| 16 | `TESTING_QUALITY.md` | Coverage, schema tests, validation gates |
| 17 | `SCALE_MONITORING.md` | Worker limits, cost, monitoring, degradation |
| 18 | `DEPLOYMENT.md` | App deploy and data output deployment |
| 19 | `APP_SURFACE.md` | Public app and operator surface mapping |
| 20 | `RUNBOOK.md` | How to run, pause, retry, validate, and seal |
| 21 | `MIGRATION_NOTES.md` | How old docs map into docs2 |
| 22 | `DOC_INDEX.md` | File inventory and ownership map |

## Vocabulary

| Term | Meaning In Dama |
|---|---|
| Feed handler | First normalizer for outside source material |
| Tickerplant / event bus | Local event spine; accepts published events and fans them out |
| Publisher | Any process that emits an event |
| Subscriber | Async worker that consumes events and may emit new events |
| Local RDB | Current local operational state: jobs, statuses, artifacts, errors |
| Local event log | Append-only list of pipeline facts |
| GCS HDB | Durable sealed store of validated clean artifacts |
| Replay / rebuild | Code path that recreates DB/indexes from sealed GCS artifacts |
| Gateway | Read/control layer used by app and dashboard |

## Design Commitments

| Commitment | Why |
|---|---|
| Workers do not call each other directly | Keeps the pipeline decoupled and async |
| Every important stage emits events | Makes progress, retry, audit, and dashboard possible |
| Every expensive stage writes an artifact | Makes work resumable and inspectable |
| Completed suttas seal individually | No need to wait for end-of-day or whole-book batches |
| GCS sealed artifacts are canonical | Local DB can be recreated |
| Schema comes before scale | Prevents JSON/file sprawl |
| Image selection is its own pipeline | Buddha book images need extraction, candidates, review, and approval |
