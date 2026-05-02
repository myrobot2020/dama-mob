# Pipeline Dashboard

The dashboard is an operational instrument, not decoration.

It shows the local data plant state:

```text
What is queued?
What is running?
What failed?
What needs review?
What is validated?
What is sealed in GCS?
```

## Main Views

| View | Purpose |
|---|---|
| Nikaya view | Overall progress by collection |
| Book view | Book-level completion and failures |
| Sutta view | One sutta's artifacts, events, review, seal status |
| Stage view | Worker/stage health and backlog |
| Image view | Buddha book extraction, candidates, selections |
| Review queue | Low-confidence or rejected artifacts |
| Seal/GCS view | Sealed runs, manifests, checksum status |
| Event log view | Raw append-only facts for debugging |

## Progress Model

Each sutta should show stage state:

```text
not_started
queued
running
completed
failed
needs_review
validated
sealed
```

Example:

```text
AN1.1
  source: completed
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

## Nikaya/Book Progress

Example:

```text
AN
  Book 1: 48/80 sealed, 12 validating, 14 running, 6 failed
  Book 2: 11/75 sealed, 20 queued, 3 failed
```

Book view should include:

```text
total suttas
queued
running
needs review
validated
sealed
failed
missing sources
missing images
missing timestamps
```

## Sutta Detail View

Must show:

```text
sutta_id
source IDs
current stage
artifact list
artifact paths
event timeline
errors
review items
generation metadata
image selections
validation report
GCS sealed run if sealed
```

## Operator Actions

Actions should publish events.

| Action | Event |
|---|---|
| Retry job | `job.retried` |
| Cancel job | `job.cancelled` |
| Requeue sutta | `sutta.requeued` |
| Approve image | `image_selection.approved` |
| Reject image | `image_selection.rejected` |
| Override artifact | `artifact.overridden` |
| Pause pipeline | `pipeline.paused` |
| Resume pipeline | `pipeline.resumed` |

## Review Queue

Review items come from:

```text
low confidence sutta match
timestamp confidence below threshold
schema validation issue
duplicate content suspicion
image selection needed
generation quality warning
missing source reference
```

Review item fields:

```json
{
  "review_id": "rev_...",
  "sutta_id": "AN1.1",
  "stage": "audio_timestamps",
  "severity": "warning",
  "message": "Low confidence timestamp alignment",
  "artifact_uri": "local://...",
  "created_at": "2026-05-01T00:00:00Z",
  "status": "open"
}
```

## Dashboard Data Sources

| Source | Used For |
|---|---|
| Local RDB | Current status, jobs, artifact records |
| Local event log | Timeline and audit |
| Local artifact files | Preview/review |
| Image candidate store | Selector UI |
| GCS manifests | Sealed status |

## First Version Scope

For Book 1 and Book 2, first dashboard can be simple:

```text
table by sutta
columns for each stage
failure/review filter
artifact links
image selector entry
seal status
retry button
```

Do not wait for a polished admin system. The dashboard will expose pipeline problems early.

