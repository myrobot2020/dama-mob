# Streaming Data Plant

Purpose: define the KX/tickerplant-inspired processing layer for Dama without replacing the existing app, deployment, AI, or screen docs.

The rest of `docs/` remains the app/product/deploy documentation. This file owns the streaming pipeline idea.

## Diagram

![Dama streaming data plant](./data-plant-diagram-spread.png)

## Core Shape

```text
sources
  -> feed handlers
  -> local tickerplant / event bus
  -> subscribers / workers
  -> local RDB
  -> validation
  -> GCS HDB
  -> gateway / dashboard
```

Core rule:

```text
Everything stays local until a complete sutta is validated and sealed to GCS.
```

## Role Map

| KX role | Dama role | Responsibility |
|---|---|---|
| Feed handler | Source ingestor | Check, dedupe, and normalize outside inputs |
| Tickerplant | Local event bus / event log | Accept events, order/log them, fan out to subscribers |
| Subscriber | Pipeline worker | Listen for events, write artifacts, publish next event |
| RDB | Local working DB | Current jobs, status, artifacts, errors, review state |
| HDB | GCS sealed store | Validated immutable artifact sets |
| Gateway | Dashboard/app query layer | Read status/artifacts without exposing storage details |

## Source Inputs

| Source | Enters Through | First Event |
|---|---|---|
| YouTube video | Sutta feed handler | `source.sutta.discovered` |
| Playlist | Sutta feed handler | `source.sutta.discovered` |
| Local audio/video | Sutta feed handler | `source.sutta.discovered` |
| Manual row | Sutta feed handler | `source.sutta.discovered` |
| Buddha book PDF/scans | Image feed handler | `image_source.discovered` |

## Event Flow

Workers do not call each other directly. They publish events.

```text
source.sutta.discovered
  -> audio.download.completed
  -> transcript.completed
  -> sutta_match.completed
  -> segments.completed
  -> audio_timestamps.completed
  -> mcq.generated / vocab.generated / technique.generated
  -> image_selection.approved
  -> images.matched
  -> sutta.ready_to_seal
  -> sutta.sealed
```

## Subscribers

| Subscriber | Listens To | Writes | Publishes |
|---|---|---|---|
| Download | `source.sutta.discovered` | Audio/video artifact | `audio.download.completed` |
| Transcription | `audio.download.completed` | `transcript.json` | `transcript.completed` |
| Sutta match | `transcript.completed` | `sutta_match.json` | `sutta_match.completed` |
| Segmentation | `sutta_match.completed` | `segments.json` | `segments.completed` |
| Audio timestamp | `segments.completed` | `audio_timestamps.json` | `audio_timestamps.completed` |
| Generation | `segments.completed` | `mcq.json`, `vocab.json`, `technique.json` | `mcq.generated`, `vocab.generated`, `technique.generated` |
| Image pipeline | `image_source.discovered` | Panel metadata/thumbnails | `image_candidates.updated` |
| Image selector | Human action | Approved image selection | `image_selection.approved` |
| Image match | `image_selection.approved` | `images.json` | `images.matched` |
| Validation | Artifact completion events | `validation.json` | `sutta.ready_to_seal` |
| Seal | `sutta.ready_to_seal` | GCS artifact set | `sutta.sealed` |

## Local RDB

The local RDB stores operational state, not canonical truth.

Suggested tables:

| Table | Purpose |
|---|---|
| `pipeline_events` | Append-only event log |
| `jobs` | Work items and retries |
| `stage_status` | Current status per sutta/stage |
| `artifact_records` | Local/GCS artifact pointers |
| `review_items` | Human review queue |
| `worker_checkpoints` | Subscriber cursors |
| `image_candidates` | Buddha book panel candidates |
| `sealed_runs` | GCS seal records |

## Artifacts

Each meaningful stage writes a durable artifact.

For a complete sutta:

```text
source.json
audio.json
transcript.json
sutta_match.json
segments.json
audio_timestamps.json
mcq.json
vocab.json
technique.json
images.json
validation.json
manifest.json
```

Audio timestamps are first-class artifacts, not metadata hidden inside another file.

## Buddha Book Image Pipeline

Images are a separate stream:

```text
Buddha books / PDFs / scans
  -> image feed handler
  -> panel extraction
  -> tagging / dedupe
  -> local candidate store
  -> image selector UI
  -> approved image artifacts
  -> image match subscriber
  -> images.json
```

The image selector is human-in-the-loop.

## GCS HDB

Completed suttas seal to GCS individually.

Suggested layout:

```text
gs://<bucket>/hdb/nikaya=AN/book=01/sutta=AN1.1/run=001/
  manifest.json
  source.json
  audio.json
  transcript.json
  sutta_match.json
  segments.json
  audio_timestamps.json
  mcq.json
  vocab.json
  technique.json
  images.json
  validation.json
```

Seal rules:

```text
validate first
upload artifacts
upload manifest last
do not mutate sealed runs
write a new run for corrections
```

## Replay / Rebuild

Replay means rebuilding database/index projections from sealed artifacts.

```text
read GCS manifests
verify checksums
load artifacts
rebuild local/serving DB rows
rebuild indexes
verify counts
```

Replay is not re-transcribing, re-generating, or re-extracting. It only rebuilds projections from sealed truth.

## Dashboard

The dashboard should show:

```text
nikaya progress
book progress
sutta progress
stage status
failures
review queue
image selections
sealed runs
event timeline
```

Example sutta state:

```text
AN1.1
  audio: completed
  transcript: completed
  sutta_match: completed
  segments: completed
  audio_timestamps: needs_review
  mcq: completed
  vocab: completed
  technique: failed
  images: pending_selection
  validation: blocked
  seal: not_started
```

## V1 Boundary

For Book 1 and Book 2:

```text
run locally
use a local event bus/job table
keep artifacts local until seal
seal completed suttas to GCS
add Pub/Sub/cloud workers only after local contracts work
```
