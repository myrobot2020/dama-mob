# Config And Environment

This doc collects configuration needed by the app, local data plant, GCS seal, AI generation, and deployment.

## Existing App Environment

Old docs identify these current variables:

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_DAMA_CORPUS_GCS_BASE` | Browser/public | Public base URL for corpus JSON |
| `VITE_DAMA_AUD_PUBLIC_BASE` | Browser/public | Public base URL for teacher audio |
| `VITE_SUPABASE_URL` | Browser/public | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser/public | Supabase anonymous key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser/public optional | Newer Supabase publishable key |
| `OPENAI_API_KEY` | Server-only secret | OpenAI model calls |
| `OPENAI_REFLECTION_MODEL` | Server/runtime | Reflection model |
| `GEMINI_API_KEY` | Server-only secret | Gemini fallback/future |
| `GEMINI_REFLECTION_MODEL` | Server/runtime | Gemini model |
| `CI_GCP` | Build-time | Cloud Run build behavior |
| `PORT` | Runtime | Cloud Run/server port |
| `HOST` | Runtime | Usually `0.0.0.0` in Docker |

## Data Plant Configuration

Suggested local variables:

| Variable | Scope | Purpose |
|---|---|---|
| `DAMA_WORK_DIR` | Local | Root for local artifacts |
| `DAMA_LOCAL_RDB` | Local | SQLite/Postgres connection/path |
| `DAMA_EVENT_LOG_DIR` | Local | Local append-only event logs if file-backed |
| `DAMA_IMAGE_WORK_DIR` | Local | Buddha book pages/panels/thumbnails |
| `DAMA_PIPELINE_CONCURRENCY` | Local | Default worker concurrency |
| `DAMA_PIPELINE_PAUSED` | Local | Optional startup pause flag |
| `DAMA_GCS_HDB_PREFIX` | Local/server | GCS sealed HDB prefix |
| `DAMA_GCS_SERVING_PREFIX` | Local/server | App serving projection prefix |
| `DAMA_GCS_AUDIO_PREFIX` | Local/server | Audio object prefix |

## Existing Bucket Context

Old docs reference:

```text
JSON:  gs://damalight-dama-json
Audio: gs://damalight-dama-aud
```

Docs2 recommends logical prefixes:

```text
gs://damalight-dama-json/hdb/
gs://damalight-dama-json/serving/
gs://damalight-dama-aud/audio/
```

## Local Modes

| Mode | Config |
|---|---|
| Fully local pipeline | `DAMA_WORK_DIR` + local RDB only |
| Local pipeline with GCS seal | Add `DAMA_GCS_HDB_PREFIX` |
| App using local corpus | Leave `VITE_DAMA_CORPUS_GCS_BASE` unset |
| App using GCS corpus | Set `VITE_DAMA_CORPUS_GCS_BASE` |
| App using local audio | Leave `VITE_DAMA_AUD_PUBLIC_BASE` unset |
| App using GCS audio | Set `VITE_DAMA_AUD_PUBLIC_BASE` |
| No auth | Leave Supabase vars unset |
| Auth/sync | Set Supabase browser vars |

## Secrets Rule

Never put server secrets in `VITE_*` variables.

```text
VITE_* = browser-visible
OPENAI_API_KEY / GEMINI_API_KEY = server-only
```

## Config Validation

Startup should validate:

```text
work directories exist or can be created
local RDB is reachable
GCS HDB prefix is configured before seal
server-only model keys are not exposed to browser config
public app bases are URLs if set
```

