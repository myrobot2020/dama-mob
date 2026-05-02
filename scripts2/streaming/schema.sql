pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists pipeline_events (
  event_id text primary key,
  event_type text not null,
  occurred_at text not null,
  publisher text not null,
  pipeline_run_id text not null,
  correlation_id text not null,
  idempotency_key text not null unique,
  payload_json text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_pipeline_events_type
  on pipeline_events (event_type);

create index if not exists idx_pipeline_events_correlation
  on pipeline_events (correlation_id);

create index if not exists idx_pipeline_events_run
  on pipeline_events (pipeline_run_id);

create table if not exists jobs (
  job_id text primary key,
  event_id text not null references pipeline_events(event_id),
  worker_type text not null,
  sutta_id text,
  status text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_by text,
  locked_at text,
  started_at text,
  finished_at text,
  error_type text,
  error_message text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(event_id, worker_type)
);

create index if not exists idx_jobs_status
  on jobs (status);

create index if not exists idx_jobs_worker_status
  on jobs (worker_type, status);

create index if not exists idx_jobs_sutta
  on jobs (sutta_id);

create table if not exists stage_status (
  sutta_id text not null,
  stage text not null,
  status text not null,
  latest_event_id text references pipeline_events(event_id),
  artifact_id text,
  error_type text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (sutta_id, stage)
);

create table if not exists artifact_records (
  artifact_id text primary key,
  artifact_type text not null,
  sutta_id text,
  schema_version text not null,
  local_uri text,
  gcs_uri text,
  sha256 text,
  input_hashes_json text not null default '{}',
  created_by text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status text not null
);

create index if not exists idx_artifact_records_sutta_type
  on artifact_records (sutta_id, artifact_type);

create table if not exists review_items (
  review_id text primary key,
  sutta_id text,
  stage text not null,
  artifact_id text,
  severity text not null,
  reason_code text not null,
  message text not null,
  status text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at text,
  resolved_by text
);

create index if not exists idx_review_items_status
  on review_items (status);

create table if not exists worker_checkpoints (
  worker_name text primary key,
  subscription_name text not null,
  last_event_id text,
  last_event_time text,
  status text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists source_records (
  source_id text primary key,
  source_type text not null,
  source_uri text not null,
  dedupe_key text not null unique,
  nikaya text,
  book text,
  sutta_hint text,
  status text not null,
  metadata_json text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists image_candidates (
  panel_id text primary key,
  source_book_id text not null,
  page integer,
  bbox_json text not null default '{}',
  local_path text not null,
  thumbnail_path text,
  sha256 text,
  quality_score real,
  tags_json text not null default '{}',
  status text not null
);

create table if not exists image_selections (
  selection_id text primary key,
  sutta_id text not null,
  panel_id text not null references image_candidates(panel_id),
  source_segment_ids_json text not null default '[]',
  status text not null,
  selection_reason text,
  selected_by text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists sealed_runs (
  seal_id text primary key,
  sutta_id text not null,
  nikaya text not null,
  book text not null,
  run_id text not null,
  gcs_prefix text not null,
  manifest_uri text not null,
  manifest_sha256 text,
  status text not null,
  sealed_at text not null
);

