# Gateway

The gateway is the read/control layer in front of the data plant.

It lets the app, dashboard, and operators ask one logical question without knowing whether the answer lives in:

```text
local RDB
local event log
local artifact files
GCS HDB manifests
serving DB/indexes
image candidate store
```

## Responsibilities

| Responsibility | Meaning |
|---|---|
| Query routing | Decide which store answers a request |
| Status aggregation | Combine local RDB + event log + artifact records |
| Control commands | Convert operator actions into events |
| Artifact access | Return safe previews/paths |
| Seal visibility | Show GCS HDB state |
| Rebuild visibility | Show replay/rebuild reports |

## Gateway Is Not

The gateway should not:

```text
run heavy pipeline work directly
mutate GCS sealed artifacts
call workers directly
hide validation failures
become the only place business logic exists
```

## Read APIs

Suggested logical reads:

| Query | Reads From |
|---|---|
| `getNikayaProgress(nikaya)` | Local RDB, sealed runs |
| `getBookProgress(nikaya, book)` | Local RDB, sealed runs |
| `getSuttaStatus(sutta_id)` | Stage status, artifact records, event log |
| `getArtifact(artifact_id)` | Artifact records + local/GCS URI |
| `getReviewQueue(filters)` | Review items |
| `getImageCandidates(filters)` | Image candidates |
| `getSealedRuns(scope)` | GCS manifests + local sealed runs |
| `getEventTimeline(correlation_id)` | Pipeline events |
| `getRebuildReport(rebuild_id)` | Rebuild runs |

## Control APIs

Control actions publish events.

| Command | Emits |
|---|---|
| `enqueueSource(source)` | `source.sutta.discovered`, `sutta.queued` |
| `retryJob(job_id)` | `job.retried` |
| `cancelJob(job_id)` | `job.cancelled` |
| `requeueSutta(sutta_id)` | `sutta.requeued` |
| `approveImage(selection)` | `image_selection.approved` |
| `rejectImage(selection)` | `image_selection.rejected` |
| `overrideArtifact(...)` | `artifact.overridden` |
| `pausePipeline()` | `pipeline.paused` |
| `resumePipeline()` | `pipeline.resumed` |

## App Gateway Versus Operator Gateway

| Gateway Area | Audience | Data |
|---|---|---|
| App gateway | End users | Serving DB/indexes, public corpus/audio |
| Operator gateway | You/admin | Local RDB, event log, artifacts, review, seal |

Do not expose local operator controls to public app users.

## Query Routing Example

Question:

```text
Show status for AN1.1
```

Gateway reads:

```text
stage_status where sutta_id = AN1.1
artifact_records where sutta_id = AN1.1
review_items where sutta_id = AN1.1 and status = open
sealed_runs where sutta_id = AN1.1
latest events for correlation_id = sutta:AN1.1
```

## Gateway And Replay

Gateway should expose:

```text
which suttas are sealed
which sealed runs are active
latest rebuild report
rebuild failures
serving index freshness
```

## Security Boundary

Operator gateway may expose local files, review controls, and retry/seal actions. Treat it as admin-only.

Public app gateway should expose only safe serving data.

