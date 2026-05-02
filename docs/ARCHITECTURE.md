# Architecture

Scope: the app architecture outside the data inventory. For data classes and ownership, see `DATABASE.md`. For AI behavior, see `AI.md`. For product screens, see `SCREENS.md`.

## System Stack

| Layer | Technology / service | Version / setting | Purpose |
|---|---|---|---|
| Frontend runtime | React | `19.2.0` | Mobile web UI |
| App framework | TanStack Start | `^1.167.14` | File routes, server functions, app build |
| Router | TanStack Router | `^1.168.0` | Route definitions under `src/routes/` |
| Build tool | Vite | `^7.3.1` | Dev server and production build |
| Styling | Tailwind CSS | `^4.2.1` | App styling through `src/styles.css` |
| UI primitives | Radix UI + local components | package versions in `package.json` | Accessible controls and reusable primitives |
| Icons | Lucide React | `^0.575.0` | App icons |
| TypeScript | TypeScript | `^5.8.3` | Static typing |
| Node runtime | Node.js | `22` in Cloud Build and Docker | Build and Cloud Run server runtime |
| Production server | Nitro node-server | `nitro-nightly` via package alias | Emits `.output/server/index.mjs` for Cloud Run |
| Python pipeline runtime | Python | `>=3.11` | Corpus/audio pipeline scripts |
| Python package runner | uv | lockfile in `uv.lock` | Runs `scripts2` pipeline commands |

## Cloud / External Services

| Service | Current use | Config / identifier | Notes |
|---|---|---|---|
| Google Cloud Run | Hosts production web app | Service `dama-mob`, region `asia-south1` | Deployed from Artifact Registry image |
| Google Cloud Build | CI/CD build and deploy | `deploy/cloudbuild.yaml` | Runs install, tests, build, Docker build, push, deploy |
| Artifact Registry | Stores Docker images | Repo `dama-mob`, region `asia-south1` | Image tagged by short SHA and `latest` |
| Google Cloud Storage | Public corpus and audio hosting | JSON bucket base `https://storage.googleapis.com/damalight-dama-json`; audio bucket base `https://storage.googleapis.com/damalight-dama-aud` | Data details live in `DATABASE.md` |
| Google Secret Manager | Stores server-only model key | Secret substitution `_OPENAI_SECRET=dama-openai-api-key` | Mounted as `OPENAI_API_KEY` in Cloud Run |
| Supabase | Auth and user-owned server tables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser keys are public; protection must come from RLS |
| OpenAI API | Server-side reflection responses | `OPENAI_REFLECTION_MODEL`, default `gpt-4o-mini` | Called only from server-side code |

## Runtime Boundaries

| Boundary | Runs where | Files / entry points | Responsibilities |
|---|---|---|---|
| Browser client | User device | `src/routes`, `src/components`, `src/lib` browser-safe modules | UI, navigation, local state, Supabase browser auth, fetching public corpus/audio |
| TanStack server functions | Server runtime | `src/server/openaiReflection.ts` | Server-only reflection call to OpenAI |
| Vite dev middleware | Local development | `config/vite/*`, `vite.config.ts` | Serves local corpus/audio and development reflection middleware |
| Cloud Run server | Production | `.output/server/index.mjs` copied by `deploy/Dockerfile` | Serves the built app and server functions |
| Python pipeline | Local/operator machine or CI later | `scripts2/*.py` | Download, identify, segment, link, clean, validate, tally, sync |

## Repository Layout

| Path | Role |
|---|---|
| `src/routes/` | Route screens and page-level behavior |
| `src/components/` | Shared app components such as headers, nav, audio player, strips |
| `src/components/ui/` | Reusable UI primitives |
| `src/lib/` | App rules, integrations, storage helpers, ordering, sync logic |
| `src/data/` | Small app-bundled content modules |
| `src/server/` | Server-only functions and external model calls |
| `config/vite/` | Local Vite middleware/plugins |
| `scripts2/` | Corpus/audio pipeline |
| `deploy/` | Cloud Build, Dockerfile, deployment helpers |
| `docs/` | Architecture, database, AI, and screen docs |
| `tests/` and `src/**/__tests__/` | Unit and integration tests |

## Build And Deployment

| Step | Command / file | What happens |
|---:|---|---|
| 1 | `npm install` | Installs Node dependencies |
| 2 | `python -m uv sync` | Installs Python pipeline dependencies |
| 3 | `npm run dev` | Starts local Vite dev server on port `8080` |
| 4 | `npm run test` | Runs Vitest unit tests |
| 5 | `npm run build` | Builds the TanStack/Vite app |
| 6 | `npm run verify` | Runs frontend build plus pipeline tally |
| 7 | `deploy/cloudbuild.yaml` | Cloud Build installs, tests, builds, containers, pushes, deploys |
| 8 | `deploy/Dockerfile` | Runs `.output/server/index.mjs` on Node 22 Alpine |

## Environment Variables

| Variable | Scope | Required | Purpose |
|---|---|---:|---|
| `VITE_DAMA_CORPUS_GCS_BASE` | Browser/public | Production yes | Public base URL for corpus JSON |
| `VITE_DAMA_AUD_PUBLIC_BASE` | Browser/public | Production yes | Public base URL for teacher audio |
| `VITE_SUPABASE_URL` | Browser/public | If auth/sync enabled | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser/public | If auth/sync enabled | Supabase anonymous browser key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser/public | Optional | Newer Supabase publishable key alternative |
| `OPENAI_API_KEY` | Server-only secret | If reflection enabled | OpenAI API key |
| `OPENAI_REFLECTION_MODEL` | Server-only/runtime | Optional | Reflection model, default `gpt-4o-mini` |
| `GEMINI_API_KEY` | Server-only secret | Optional/future | Gemini fallback if implemented |
| `GEMINI_REFLECTION_MODEL` | Server-only/runtime | Optional/future | Gemini model name |
| `CI_GCP` | Build-time | Cloud Build yes | Forces Nitro node-server build for Cloud Run |
| `PORT` | Runtime | Cloud Run yes | App listens on `8080` in Docker |
| `HOST` | Runtime | Docker yes | Set to `0.0.0.0` |

## Testing And Quality

| Area | Tool / command | Target |
|---|---|---|
| Unit tests | `npm run test` / Vitest | App logic, components, hooks |
| E2E tests | `npm run test:e2e` / Playwright | Critical user flows |
| Build verification | `npm run build` | Frontend/server build succeeds |
| Pipeline verification | `npm run pipe2:tally` | Corpus cloud/local counts match expectation |
| Full verification | `npm run verify` | Build plus pipeline tally |
| Linting | `npm run lint` | ESLint checks |
| Formatting | `npm run format` | Prettier formatting |
| Coverage goal | Vitest coverage | Try to reach 85% on core logic/sync/data modules |

## Security Boundaries

| Rule | Why it matters |
|---|---|
| Never expose server API keys through `VITE_*` variables | Vite variables are bundled into browser code |
| Keep OpenAI/Gemini calls server-side | Protects model keys and allows guardrails/tracing |
| Supabase browser keys are public | RLS policies must protect all user-owned rows |
| Local storage must not contain secrets | Browser storage is user/device visible |
| Cloud Run secrets come from Secret Manager | Avoids committing secrets or baking them into images |
| Generated AI text must remain grounded | Prevents the app from presenting unsupported claims as canon |

## Architecture Checklist

| Check | Pass condition |
|---|---|
| Local app boots | `npm run dev` opens on `http://localhost:8080` |
| Production build works | `CI_GCP=1 npm run build` emits `.output/` |
| Cloud deploy config is complete | `deploy/cloudbuild.yaml` has region, service, repo, env, secret |
| Server-only reflection works | `OPENAI_API_KEY` exists only at server/runtime level |
| Auth can be disabled locally | App still renders if Supabase env vars are absent |
| Corpus/audio are externally configurable | GCS bases can be swapped without code changes |
| Tests guard core logic | Routing helpers, progress, leaves, sync, and harness logic are covered |

