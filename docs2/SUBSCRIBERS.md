# Subscriber Contracts

Subscribers are async workers. They listen for events, do one clear job, write artifacts, then publish result events.

The same process can be both subscriber and publisher.

```text
transcription subscriber
  subscribes to audio.download.completed
  writes transcript.json
  publishes transcript.completed or transcript.failed
```

## Worker Rules

| Rule | Meaning |
|---|---|
| Do one stage | A subscriber should have one clear responsibility |
| Use event inputs | Start work from event payload + artifact records |
| Write durable local artifact | Do not keep important work only in memory |
| Publish completion/failure | Every result returns to tickerplant |
| Be idempotent | Same event can be retried safely |
| Do not call next worker directly | Event bus decides who reacts |
| Record model/tool versions | Generation must be traceable |
| Surface review needs | Low-confidence outputs become review items |

## Standard Subscriber Contract

```yaml
name: transcription_subscriber
subscribes_to:
  - audio.download.completed
reads:
  - local audio artifact
writes:
  - transcript.json
publishes:
  success:
    - transcript.completed
  failure:
    - transcript.failed
idempotency_key:
  transcript:{sutta_or_source_id}:{audio_hash}:{transcriber_version}
retry:
  max_attempts: 3
  backoff: exponential
review:
  required_when:
    - transcript_confidence < threshold
```

## Core Subscribers

| Subscriber | Subscribes To | Writes | Publishes |
|---|---|---|---|
| Download | `sutta.queued`, `source.sutta.discovered` | `audio.json`, local audio/video file | `audio.download.completed`, `audio.download.failed` |
| Transcription | `audio.download.completed` | `transcript.json` | `transcript.completed`, `transcript.failed` |
| Sutta match | `transcript.completed` | `sutta_match.json` | `sutta_match.completed`, `sutta_match.failed` |
| Segmentation | `sutta_match.completed`, `transcript.completed` | `segments.json` | `segments.completed`, `segments.failed` |
| Audio timestamp | `segments.completed` | `audio_timestamps.json` | `audio_timestamps.completed`, `audio_timestamps.failed` |
| Generation | `segments.completed`, optional `audio_timestamps.completed` | `mcq.json`, `vocab.json`, `technique.json` | `mcq.generated`, `vocab.generated`, `technique.generated`, `generation.failed` |
| Image extraction | `image_source.discovered` | panel crops, panel metadata | `image_panels.extracted`, `image_candidates.updated` |
| Image match | `image_selection.approved` plus sutta context | `images.json` | `images.matched`, `images.failed` |
| Validation | artifact completion events | validation report | `artifact.validated`, `artifact.rejected`, `sutta.ready_to_seal` |
| Seal | `sutta.ready_to_seal` | GCS objects, seal manifest | `sutta.sealed`, `sutta.seal.failed` |

## Dependency Rules

Workers are async, but data dependencies are strict.

| Stage | Must Exist First |
|---|---|
| Download | Source event |
| Transcription | Audio file |
| Sutta match | Transcript |
| Segmentation | Transcript and/or sutta match |
| Audio timestamps | Segments and audio |
| MCQ/vocab/technique | Segments |
| Image match | Approved image and target sutta |
| Validation | Required artifacts |
| Seal | Validation pass |

## Failure Events

Failures are normal data.

Failure payload:

```json
{
  "sutta_id": "AN1.1",
  "stage": "transcription",
  "error_type": "transcriber_timeout",
  "message": "Transcription exceeded timeout",
  "attempt": 2,
  "can_retry": true,
  "artifact_uri": null
}
```

## Retry Policy

| Failure Type | Retry? | Notes |
|---|---:|---|
| Network timeout | Yes | Safe automatic retry |
| Missing source file | No | Needs operator/source fix |
| Low confidence match | No automatic | Send to review |
| Schema validation error | No automatic | Fix artifact or code |
| GCS upload timeout | Yes | Check idempotency before retry |
| Duplicate event | No work | Return existing artifact |

## Local Multiprocess Evolution

Start simple:

```text
one process, all subscribers available
```

Then:

```text
one local event log + job table
separate worker processes by stage
```

Later:

```text
same event contracts
real Pub/Sub or Cloud Tasks
cloud workers
```

