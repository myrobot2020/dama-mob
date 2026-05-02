# Data Plant Runbook

This is the operating guide for the local data plant.

## V1 Operating Boundary

```text
Run locally.
Process Book 1 and Book 2.
Seal completed suttas to GCS.
Do not require cloud workers yet.
```

## Current Repo Commands From Old Docs

Existing docs mention:

```text
npm install
python -m uv sync
npm run dev
npm run test
npm run build
npm run verify
npm run pipe2
npm run pipe2:tally
```

Existing pipeline stages mention:

```text
npm run pipe2:download
npm run pipe2:identification
npm run pipe2:segmentation
npm run pipe2:linking
npm run pipe2:keys
npm run pipe2:names
npm run pipe2:cleaning
npm run pipe2:validation
npm run pipe2:tally
```

Docs2 changes the mental model, not necessarily all commands immediately. Existing scripts can be wrapped behind event-shaped stages.

## Normal Local Run

Future ideal:

```text
1. Start local event bus / job table.
2. Start dashboard.
3. Start subscribers.
4. Enqueue Book 1 or Book 2 sources.
5. Workers process async.
6. Review image/timestamp/match issues.
7. Validation emits sutta.ready_to_seal.
8. Seal subscriber uploads complete sutta to GCS.
9. Dashboard marks sutta sealed.
```

## Pilot Scope

Start with:

```text
AN Book 1
AN Book 2
local-only pipeline
per-sutta seal to GCS
image selector local
audio timestamps explicit
```

## Stage Checklist

For each sutta:

```text
source normalized
audio/video downloaded
transcript created
sutta ID matched
segments created
audio timestamps aligned
MCQ generated
vocab generated
technique generated
images approved and matched
all artifacts validated
sealed to GCS
```

## Pause And Resume

Pause should stop new work from starting, not corrupt running jobs.

```text
pipeline.paused
  -> workers finish current safe unit
  -> no new jobs claimed
```

Resume:

```text
pipeline.resumed
  -> workers claim queued jobs again
```

## Retry

Retry should publish an event:

```text
job.retried
```

Retry should use idempotency keys so duplicate artifacts are not created accidentally.

## Review

Send to review when:

```text
sutta match confidence is low
audio timestamp confidence is low
image selection is missing
artifact schema fails
generation references no source segment
duplicate or weird content is detected
```

Review output should become an event:

```text
artifact.overridden
image_selection.approved
image_selection.rejected
```

## Seal

Seal only after validation.

Seal writes:

```text
GCS artifact files
manifest.json
local sealed status
sutta.sealed event
```

Upload manifest last.

## Failure Handling

| Failure | Action |
|---|---|
| Download failed | Retry if network; otherwise fix source |
| Transcript failed | Retry; inspect audio if repeated |
| Sutta match ambiguous | Human review |
| Timestamp low confidence | Human review |
| Generated artifact invalid | Regenerate or edit |
| Image missing | Use image selector |
| Validation failed | Fix artifact/schema |
| GCS upload failed | Retry seal |

## Done Definition For A Sutta

A sutta is done when:

```text
all required artifacts exist
validation passes
GCS manifest exists
checksums verify
sutta.sealed event exists
dashboard shows sealed
rebuild can load it
```

## Done Definition For Book 1/2 Pilot

```text
all target suttas have source status
all processable suttas are sealed
failures are explicit and reviewed
book manifest exists
rebuild report passes
dashboard accurately shows progress
```

