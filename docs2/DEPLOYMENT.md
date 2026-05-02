# Deployment

Deployment has two separate concerns:

```text
1. App deployment.
2. Data plant output deployment.
```

The local data plant does not need to run in cloud for the Book 1/2 pilot.

## Existing App Deployment Context

Old docs describe:

| Service | Current Role |
|---|---|
| Google Cloud Run | Hosts production web app |
| Google Cloud Build | Builds/deploys app from repo |
| Artifact Registry | Stores Docker images |
| Google Cloud Storage | Public corpus/audio hosting |
| Google Secret Manager | Stores server-only model key |
| Supabase | Auth and user-owned tables |

Existing production service:

```text
service: dama-mob
region: asia-south1
port: 8080
```

## App Deployment Checklist

```text
npm install
python -m uv sync
npm run test
npm run build
npm run verify
CI_GCP=1 npm run build
Cloud Build deploys Cloud Run
production smoke test
```

Smoke test:

```text
home loads
Book One sutta loads
audio path works
tree/practice/quiz flow works
auth/profile works if enabled
reflection returns grounded answer or config-safe error
```

## Data Plant Output Deployment

Data plant output deploys by seal:

```text
validation passes
seal subscriber uploads to GCS HDB
manifest written last
checksums verified
sutta.sealed event emitted
serving projection rebuilt/published
```

## GCS Deployment Boundary

Do not upload WIP artifacts to HDB.

Use separate logical areas:

```text
hdb/       sealed canonical data
serving/   app-readable projection
audio/     public/controlled audio assets
```

## Production Serving Projection

The app should not need to read every HDB detail directly.

Preferred flow:

```text
GCS HDB sealed artifacts
  -> rebuild serving projection
  -> publish serving/index JSON
  -> app reads serving/index JSON
```

## Secrets

Use Secret Manager or equivalent for:

```text
OPENAI_API_KEY
GEMINI_API_KEY
service credentials if needed
```

Never commit secrets.

Never pass server secrets through browser-public build variables.

## When Cloud Workers Become Needed

Move data plant workers to cloud only when local processing is too slow or needs automation.

Migration path:

```text
local job table/event log
  -> Pub/Sub topics/subscriptions
  -> Cloud Run workers
  -> managed DB for job/event state
```

Keep event names and artifact contracts unchanged.

