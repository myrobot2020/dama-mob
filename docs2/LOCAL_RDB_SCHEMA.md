# Local RDB Schema

The Local RDB is the working database for the local data plant.

It stores current operational state:

```text
events
jobs
stage status
artifact records
review items
worker checkpoints
image candidates
sealed runs
```

It is not the long-term source of truth. GCS HDB is the sealed canonical store.

## Design Rules

| Rule | Meaning |
|---|---|
| Append facts | Events are append-only |
| Keep current state queryable | Dashboard should not parse every artifact file |
| Store pointers, not huge blobs | Large outputs live in local files/GCS |
| Support idempotency | Duplicate event delivery must not duplicate work |
| Support rebuild | Tables can be recreated from event log + artifacts + GCS |
| Make review visible | Low-confidence work becomes review rows |

## Core Tables

| Table | Purpose |
|---|---|
| `pipeline_events` | Append-only event log |
| `jobs` | Work items claimed by subscribers |
| `stage_status` | Current status per sutta/stage |
| `artifact_records` | Metadata and paths for produced artifacts |
| `review_items` | Human review queue |
| `worker_checkpoints` | Subscriber cursors/last processed events |
| `source_records` | Normalized source inputs |
| `image_sources` | Buddha book/image source registry |
| `image_candidates` | Extracted panels and candidate metadata |
| `image_selections` | Human image approvals/rejections |
| `sealed_runs` | Local record of GCS sealed runs |
| `rebuild_runs` | Replay/rebuild reports |

## `pipeline_events`

Append-only tickerplant log.

| Column | Type | Notes |
|---|---|---|
| `event_id` | text primary key | Unique event ID |
| `event_type` | text | Routing key |
| `occurred_at` | timestamp | UTC |
| `publisher` | text | Worker/UI/feed handler |
| `pipeline_run_id` | text | Groups a pipeline run |
| `correlation_id` | text | Usually `sutta:AN1.1` or `image_source:...` |
| `idempotency_key` | text unique | Prevent duplicate facts |
| `payload_json` | json | Event payload |
| `created_at` | timestamp | Insert time |

Indexes:

```text
event_type
occurred_at
correlation_id
pipeline_run_id
idempotency_key
```

## `jobs`

Tracks subscriber work.

| Column | Type | Notes |
|---|---|---|
| `job_id` | text primary key | Unique job |
| `event_id` | text | Event that created job |
| `worker_type` | text | `transcription`, `validation`, etc. |
| `sutta_id` | text nullable | Known when available |
| `status` | text | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `attempt_count` | integer | Retry count |
| `max_attempts` | integer | Retry limit |
| `locked_by` | text nullable | Worker instance |
| `locked_at` | timestamp nullable | Claim time |
| `started_at` | timestamp nullable | Work start |
| `finished_at` | timestamp nullable | Work end |
| `error_type` | text nullable | Structured failure |
| `error_message` | text nullable | Human-readable failure |
| `created_at` | timestamp | Insert time |
| `updated_at` | timestamp | Last state change |

Indexes:

```text
status
worker_type
sutta_id
locked_at
```

## `stage_status`

Current per-sutta state for dashboard.

| Column | Type | Notes |
|---|---|---|
| `sutta_id` | text | Canonical ID |
| `stage` | text | `audio`, `transcript`, `segments`, etc. |
| `status` | text | `not_started`, `queued`, `running`, `completed`, `failed`, `needs_review`, `validated`, `sealed` |
| `latest_event_id` | text | Last event affecting this stage |
| `artifact_id` | text nullable | Current artifact |
| `error_type` | text nullable | Current error |
| `updated_at` | timestamp | Last update |

Primary key:

```text
(sutta_id, stage)
```

## `artifact_records`

Metadata for local and sealed artifacts.

| Column | Type | Notes |
|---|---|---|
| `artifact_id` | text primary key | Stable artifact ID |
| `artifact_type` | text | `transcript`, `segments`, `mcq`, etc. |
| `sutta_id` | text nullable | Known when applicable |
| `schema_version` | text | Artifact schema |
| `local_uri` | text nullable | Local file path/URI |
| `gcs_uri` | text nullable | Set after seal |
| `sha256` | text nullable | Checksum |
| `input_hashes_json` | json | Source hashes |
| `created_by` | text | Worker/UI |
| `created_at` | timestamp | Creation time |
| `status` | text | `draft`, `validated`, `rejected`, `sealed` |

Indexes:

```text
sutta_id
artifact_type
status
sha256
```

## `review_items`

Human review queue.

| Column | Type | Notes |
|---|---|---|
| `review_id` | text primary key | Unique review item |
| `sutta_id` | text nullable | Target sutta |
| `stage` | text | Stage needing review |
| `artifact_id` | text nullable | Related artifact |
| `severity` | text | `info`, `warning`, `blocking` |
| `reason_code` | text | Structured reason |
| `message` | text | Human-readable message |
| `status` | text | `open`, `approved`, `rejected`, `resolved` |
| `created_at` | timestamp | Open time |
| `resolved_at` | timestamp nullable | Close time |
| `resolved_by` | text nullable | Operator |

## `worker_checkpoints`

Tracks subscriber progress through the event log.

| Column | Type | Notes |
|---|---|---|
| `worker_name` | text primary key | Subscriber name |
| `subscription_name` | text | Logical subscription |
| `last_event_id` | text nullable | Last processed event |
| `last_event_time` | timestamp nullable | Last processed event time |
| `status` | text | `active`, `paused`, `failed` |
| `updated_at` | timestamp | Last checkpoint |

This is the local equivalent of "where did this subscriber get to?"

## `source_records`

Normalized sutta source inputs.

| Column | Type | Notes |
|---|---|---|
| `source_id` | text primary key | Example `youtube:abc123` |
| `source_type` | text | `youtube`, `playlist`, `local_file`, `manual` |
| `source_uri` | text | URL/path |
| `dedupe_key` | text unique | Prevent duplicates |
| `nikaya` | text nullable | Hint/known value |
| `book` | text nullable | Hint/known value |
| `sutta_hint` | text nullable | Hint |
| `status` | text | `discovered`, `queued`, `rejected`, `processed` |
| `metadata_json` | json | Extra source metadata |
| `created_at` | timestamp | Insert time |

## `image_candidates`

Extracted Buddha book panels.

| Column | Type | Notes |
|---|---|---|
| `panel_id` | text primary key | Extracted panel |
| `source_book_id` | text | Buddha book source |
| `page` | integer | Page number |
| `bbox_json` | json | Crop box |
| `local_path` | text | Panel path |
| `thumbnail_path` | text | Thumbnail path |
| `sha256` | text | Image checksum |
| `quality_score` | real nullable | Automated score |
| `tags_json` | json | Tags/OCR/notes |
| `status` | text | `candidate`, `rejected`, `approved`, `duplicate` |

## `image_selections`

Human image selections.

| Column | Type | Notes |
|---|---|---|
| `selection_id` | text primary key | Unique selection |
| `sutta_id` | text | Target sutta |
| `panel_id` | text | Approved/rejected panel |
| `source_segment_ids_json` | json | Linked segments |
| `status` | text | `approved`, `rejected`, `uncertain` |
| `selection_reason` | text nullable | Human note |
| `selected_by` | text | Operator |
| `created_at` | timestamp | Selection time |

## `sealed_runs`

Local record of GCS HDB seals.

| Column | Type | Notes |
|---|---|---|
| `seal_id` | text primary key | Seal ID |
| `sutta_id` | text | Canonical sutta |
| `nikaya` | text | Collection |
| `book` | text | Book |
| `run_id` | text | Run number |
| `gcs_prefix` | text | Sealed folder |
| `manifest_uri` | text | GCS manifest |
| `manifest_sha256` | text | Manifest checksum |
| `status` | text | `sealed`, `failed`, `superseded` |
| `sealed_at` | timestamp | Seal time |

## Startup Behavior

On startup:

```text
1. Open local RDB.
2. Read worker checkpoints.
3. Rebuild stage_status if needed from pipeline_events.
4. Verify artifact_records point to existing local files.
5. Resume queued jobs unless pipeline is paused.
6. Dashboard reads local RDB immediately.
```

## Recovery Behavior

If local RDB is corrupted:

```text
1. Preserve local artifact files.
2. Recreate tables.
3. Replay local pipeline_events if available.
4. Re-scan local artifact files.
5. Re-import sealed GCS manifests.
6. Mark uncertain states for review.
```

