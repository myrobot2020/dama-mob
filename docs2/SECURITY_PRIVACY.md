# Security And Privacy

Security in docs2 covers:

```text
local data plant safety
GCS seal safety
server secrets
Supabase/user data
AI traces
operator dashboard controls
```

## Secrets

| Secret | Rule |
|---|---|
| `OPENAI_API_KEY` | Server-only, never `VITE_*` |
| `GEMINI_API_KEY` | Server-only, never `VITE_*` |
| Cloud credentials | Local/admin only, never committed |
| Supabase anon key | Browser-public, protect with RLS |
| Service account keys | Avoid local key files if possible; never commit |

## Browser-Public Config

Anything beginning with `VITE_` is visible to the browser.

Do not put:

```text
model API keys
service account keys
private bucket credentials
database admin keys
personal secrets
```

in `VITE_*`.

## User Data

Old docs include user data:

```text
auth account
profile
reading progress
audio progress
quiz/leaf state
reflection answers
settings
device identity
UX events
AI harness traces
```

Rules:

```text
RLS protects Supabase user rows
private reflections are private by default
localStorage must not contain secrets
device ID is not authentication
trace payloads must be bounded and redacted
delete/export paths should exist for personal data
```

## Operator Dashboard

Operator dashboard can:

```text
view local files
retry jobs
approve images
override artifacts
seal to GCS
pause/resume pipeline
```

Treat it as admin-only.

Do not expose operator gateway to public users.

## GCS HDB Safety

| Risk | Control |
|---|---|
| Uploading messy WIP | Seal only after validation |
| Half-uploaded sutta | Upload manifest last |
| Mutating sealed truth | Use new run instead |
| Broken public access/CORS | Verify serving projection separately |
| Accidental delete | Avoid destructive sync; keep immutable runs |

## AI Trace Safety

Trace metadata is useful, but can grow sensitive.

Store:

```text
model
prompt version
source IDs
duration
status
error type
input/output hashes
```

Be careful with:

```text
full user reflection text
full raw prompts
private notes
personal identifiers
```

## Confirmation Boundary

Any destructive action should require explicit human confirmation in the operator UI:

```text
delete local artifacts
delete GCS objects
overwrite/supersede sealed runs
publish public serving projection
change cloud permissions
```

## Minimum Security Checks

```text
no server secrets in VITE env
RLS enabled for user-owned Supabase tables
operator routes are not public
GCS seal uses manifest-last behavior
logs do not contain raw secrets
local DB does not store API keys
```

