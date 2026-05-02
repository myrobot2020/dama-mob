# Event Catalog

Events are the contract between publishers and subscribers.

Every event should be append-only, timestamped, and idempotent.

## Event Envelope

All events should share this envelope:

```json
{
  "event_id": "evt_...",
  "event_type": "transcript.completed",
  "occurred_at": "2026-05-01T00:00:00Z",
  "publisher": "transcription_subscriber",
  "pipeline_run_id": "run_...",
  "correlation_id": "sutta:AN1.1",
  "idempotency_key": "transcript.completed:AN1.1:audio_hash",
  "payload": {}
}
```

## Required Envelope Fields

| Field | Purpose |
|---|---|
| `event_id` | Unique event identifier |
| `event_type` | Routing key for subscribers |
| `occurred_at` | UTC event time |
| `publisher` | Process/component that emitted it |
| `pipeline_run_id` | Groups events from one run |
| `correlation_id` | Usually sutta ID or image source ID |
| `idempotency_key` | Prevents duplicate work |
| `payload` | Event-specific data |

## Sutta Intake Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `source.sutta.discovered` | Sutta feed handler | Download, dashboard, audit | A source exists and is normalized |
| `source.sutta.rejected` | Sutta feed handler | Dashboard, audit | Source failed validation/dedupe |
| `sutta.queued` | Sutta feed handler/operator | Download, dashboard | Sutta is ready for processing |

Example payload:

```json
{
  "source_id": "youtube:abc123",
  "source_type": "youtube",
  "source_url": "https://youtube.com/watch?v=abc123",
  "nikaya": "AN",
  "book": "1",
  "sutta_hint": "AN1.1",
  "dedupe_key": "youtube:abc123"
}
```

## Audio And Transcript Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `audio.download.started` | Download subscriber | Dashboard, audit | Download began |
| `audio.download.completed` | Download subscriber | Transcription, dashboard, audit | Local audio artifact exists |
| `audio.download.failed` | Download subscriber | Dashboard, retry controller, audit | Download failed |
| `transcript.started` | Transcription subscriber | Dashboard, audit | Transcription began |
| `transcript.completed` | Transcription subscriber | Sutta match, segmentation, dashboard, audit | Transcript artifact exists |
| `transcript.failed` | Transcription subscriber | Dashboard, retry controller, audit | Transcription failed |

## Matching, Segmentation, And Timestamp Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `sutta_match.started` | Sutta match subscriber | Dashboard, audit | Matching began |
| `sutta_match.completed` | Sutta match subscriber | Segmentation, dashboard, audit | Canonical sutta ID is known |
| `sutta_match.failed` | Sutta match subscriber | Dashboard, review, audit | Could not identify sutta confidently |
| `segments.started` | Segmentation subscriber | Dashboard, audit | Segmenting began |
| `segments.completed` | Segmentation subscriber | Audio timestamp, generation, dashboard, audit | Segment artifact exists |
| `segments.failed` | Segmentation subscriber | Dashboard, retry/review, audit | Segmenting failed |
| `audio_timestamps.started` | Audio timestamp subscriber | Dashboard, audit | Timestamp alignment began |
| `audio_timestamps.completed` | Audio timestamp subscriber | Validation, dashboard, audit | Segment audio times exist |
| `audio_timestamps.failed` | Audio timestamp subscriber | Dashboard, review, audit | Timestamp alignment failed |

## Content Generation Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `mcq.generated` | Generation subscriber | Validation, dashboard, audit | MCQ artifact exists |
| `vocab.generated` | Generation subscriber | Validation, dashboard, audit | Vocab artifact exists |
| `technique.generated` | Generation subscriber | Validation, dashboard, audit | Technique artifact exists |
| `generation.failed` | Generation subscriber | Dashboard, retry/review, audit | One generated artifact failed |

Generation payload must include:

```json
{
  "sutta_id": "AN1.1",
  "artifact_type": "mcq",
  "artifact_uri": "local://artifacts/AN1.1/mcq.json",
  "model": "model-name",
  "prompt_version": "prompt-v1",
  "input_hash": "sha256:..."
}
```

## Image Pipeline Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `image_source.discovered` | Image feed handler | Image extraction, dashboard, audit | Buddha book/page source exists |
| `image_panels.extracted` | Image pipeline subscriber | Tag/dedupe, dashboard, audit | Page panels were extracted |
| `image_candidates.updated` | Image pipeline subscriber | Image selector UI, dashboard | Candidate set changed |
| `image_selection.approved` | Image selector UI | Image match, dashboard, audit | Human approved image(s) |
| `image_selection.rejected` | Image selector UI | Dashboard, audit | Human rejected candidates |
| `images.matched` | Image match subscriber | Validation, dashboard, audit | Approved images attached to sutta |
| `images.failed` | Image match subscriber | Dashboard, review, audit | Image attachment failed |

## Validation And Seal Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `artifact.validated` | Validation subscriber | Dashboard, audit | One artifact passed validation |
| `artifact.rejected` | Validation subscriber | Dashboard, review, audit | Artifact failed validation |
| `sutta.ready_to_seal` | Validation subscriber | Seal subscriber, dashboard, audit | Complete sutta passed gates |
| `sutta.seal.started` | Seal subscriber | Dashboard, audit | GCS upload began |
| `sutta.sealed` | Seal subscriber | Dashboard, replay indexer, audit | Sutta is canonical in GCS |
| `sutta.seal.failed` | Seal subscriber | Dashboard, retry controller, audit | Upload/checksum/manifest failed |

## Operator Events

| Event | Publisher | Subscribers | Meaning |
|---|---|---|---|
| `job.retried` | Dashboard/operator | Target worker, dashboard, audit | Retry requested |
| `job.cancelled` | Dashboard/operator | Dashboard, audit | Job cancelled |
| `sutta.requeued` | Dashboard/operator | Pipeline workers, dashboard, audit | Sutta re-entered pipeline |
| `artifact.overridden` | Dashboard/operator | Validation, dashboard, audit | Human override was applied |
| `pipeline.paused` | Dashboard/operator | Workers, dashboard, audit | Stop starting new work |
| `pipeline.resumed` | Dashboard/operator | Workers, dashboard, audit | Continue work |

## Event Naming Rules

```text
domain.object.action
```

Examples:

```text
audio.download.completed
transcript.completed
audio_timestamps.completed
image_selection.approved
sutta.sealed
```

Prefer explicit events over vague ones:

```text
Good: transcript.completed
Bad: step.done
```

