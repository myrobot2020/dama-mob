# Build

Purpose: rebuild, verify, and deploy the app end to end. This doc stitches together:

- `ARCHITECTURE.md` for stack, services, env vars, testing, and deployment shape.
- `DATABASE.md` for primary, secondary, and tertiary data.
- `SCREENS.md` for the Book of Ones user flow.
- `AI.md` for the reflection/harness layer.

## End-To-End Build Order

| Order | Stage | Command / action | Success check | Reference |
|---:|---|---|---|---|
| 1 | Install Node dependencies | `npm install` | `node_modules/` exists and install exits cleanly | `ARCHITECTURE.md` |
| 2 | Install Python pipeline dependencies | `python -m uv sync` | `.venv/` and `uv.lock` environment are usable | `ARCHITECTURE.md` |
| 3 | Create local env | Copy `.env.example` to `.env.local` and fill values as needed | App has corpus/audio/Supabase/model config for the target mode | `ARCHITECTURE.md` |
| 4 | Build or refresh primary data | Run the needed `npm run pipe2:*` stages | Corpus JSON/audio/mappings are present and valid | `DATABASE.md` |
| 5 | Validate data | `npm run pipe2:tally` | Tally exits cleanly | `DATABASE.md` |
| 6 | Run app locally | `npm run dev` | App opens at `http://localhost:8080` | `ARCHITECTURE.md`, `SCREENS.md` |
| 7 | Verify Book of Ones | Open `AN 1.18.13`, browse Book One, tree, practice, quiz | Core screen flow works on mobile width | `SCREENS.md` |
| 8 | Verify AI reflection | Configure `OPENAI_API_KEY`, then test reflection flow | Reflection returns grounded answer or clear config error | `AI.md` |
| 9 | Run unit tests | `npm run test` | Vitest exits cleanly | `ARCHITECTURE.md` |
| 10 | Run E2E tests | `npm run test:e2e` | Playwright exits cleanly | `ARCHITECTURE.md` |
| 11 | Run full verification | `npm run verify` | Build and tally pass | `ARCHITECTURE.md`, `DATABASE.md` |
| 12 | Production build | `CI_GCP=1 npm run build` | `.output/server/index.mjs` exists | `ARCHITECTURE.md` |
| 13 | Deploy | Push to `main` or trigger Cloud Build using `deploy/cloudbuild.yaml` | Cloud Run service deploys successfully | `ARCHITECTURE.md` |
| 14 | Smoke production | Test home, Book One sutta, audio, auth/profile, tree, reflection | Production behaves like local verified app | All docs |

## Local Modes

| Mode | Env setup | What it uses |
|---|---|---|
| Fully local corpus | Leave `VITE_DAMA_CORPUS_GCS_BASE` unset | Local `data/validated-json/` through Vite middleware |
| Production-like corpus | Set `VITE_DAMA_CORPUS_GCS_BASE` | Public GCS corpus bucket |
| Fully local audio | Leave `VITE_DAMA_AUD_PUBLIC_BASE` unset | Local `/dama-aud/` middleware path |
| Production-like audio | Set `VITE_DAMA_AUD_PUBLIC_BASE` | Public GCS audio bucket |
| No auth demo | Leave Supabase vars empty | App should still render local-only flows |
| Auth/sync mode | Set Supabase URL/key | Supabase auth, profile, progress sync |
| Reflection off | Leave model API keys empty | Reflection should show a clear configuration error |
| Reflection on | Set server-only `OPENAI_API_KEY` | Server-side OpenAI reflection |

## Core Commands

| Goal | Command |
|---|---|
| Start dev server | `npm run dev` |
| Build frontend/server | `npm run build` |
| Production-style Cloud Run build | `CI_GCP=1 npm run build` |
| Unit tests | `npm run test` |
| E2E tests | `npm run test:e2e` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Full verify | `npm run verify` |
| Full data pipeline | `npm run pipe2` |
| Pipeline tally only | `npm run pipe2:tally` |

## Data Pipeline Order

| Order | Stage | Command |
|---:|---|---|
| 1 | Download | `npm run pipe2:download` |
| 2 | Identification | `npm run pipe2:identification` |
| 3 | Segmentation | `npm run pipe2:segmentation` |
| 4 | Linking | `npm run pipe2:linking` |
| 5 | Keys | `npm run pipe2:keys` |
| 6 | Names | `npm run pipe2:names` |
| 7 | Cleaning | `npm run pipe2:cleaning` |
| 8 | Validation | `npm run pipe2:validation` |
| 9 | Tally | `npm run pipe2:tally` |
| 10 | Full pipeline | `npm run pipe2` |

## Production Deployment Checklist

| Check | Expected |
|---|---|
| Cloud project | GCP project is selected and required APIs are enabled |
| Artifact Registry | Docker repo exists in `asia-south1` |
| Cloud Run | Service name is `dama-mob` |
| Cloud Build | Trigger points to `deploy/cloudbuild.yaml` |
| GCS JSON | Corpus bucket is public-readable or otherwise reachable by browser |
| GCS audio | Audio bucket has correct CORS and public base URL |
| Supabase | Auth redirects and SQL schema/RLS are applied |
| Secrets | `OPENAI_API_KEY` is in Secret Manager, not in client env |
| Build substitutions | GCS bases and Supabase browser vars are set in Cloud Build trigger |
| Smoke test | Production URL passes home, sutta, audio, tree, auth, reflection checks |

## Unsupervised Agent Rules

| Rule | Reason |
|---|---|
| Read `ARCHITECTURE.md`, `DATABASE.md`, `SCREENS.md`, and `AI.md` before major rebuild work | Prevents guessing across stack, data, UI, and AI layers |
| Never put server secrets in `VITE_*` variables | `VITE_*` is public browser config |
| Run tests before deploy | Avoids shipping broken core flows |
| Run tally before corpus/audio deploy | Prevents stale or missing content |
| Keep generated/rebuildable data separate from source data | Makes the app recoverable |
| Stop on auth, data-loss, or production-secret ambiguity | Those failures need explicit human confirmation |

