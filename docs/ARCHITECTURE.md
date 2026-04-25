# Architecture

This app is a mobile-focused TanStack/Vite application for reading and reflecting on Nikaya suttas.

## App Surfaces

- `src/routes/` contains the route screens. The filename usually matches the URL, for example `tree.tsx`, `sutta.$suttaId.tsx`, `profile.tsx`, and the reflection routes.
- `src/components/` contains shared UI and app components such as the bottom nav, corpus navigation, audio player, and screen header.
- `src/components/ui/` contains reusable design-system primitives.
- `src/lib/` contains app rules and integrations: corpus loading, leaf state, reading/audio progress, Supabase, sutta ordering, and small storage helpers.
- `src/data/` contains small local data modules for specific flows.

## Corpus Data

The app loads corpus summaries through `getItems()` and individual suttas through `getItem()` in `src/lib/damaApi.ts`.

In local development, Vite middleware can serve files from `data/validated-json/` through `/__dama_corpus__/`. In production, Cloud Build injects `VITE_DAMA_CORPUS_GCS_BASE`, and the app reads the global `nikaya/index.json` plus per-sutta JSON from GCS.

Audio URLs are resolved in `getCorpusAudSrc()`. Production uses `VITE_DAMA_AUD_PUBLIC_BASE`.

## Progress Storage

Client progress is intentionally lightweight:

- `src/lib/leaves.ts` stores Tree/quiz leaf state under `dama:leaves`.
- `src/lib/readingProgress.ts` stores reading progress.
- `src/lib/audioListenProgress.ts` stores listen progress.
- `src/lib/uxLog.ts` stores local UX events before sync.

These stores are browser-local and should not contain secrets.

## Tree Flow

The Tree page reads the corpus index and renders one leaf per sutta in the selected book. Saved leaf progress only changes the state/color of those corpus-generated leaves.

The pure selection and overlay rules live in `src/lib/treeLeaves.ts`; `src/routes/tree.tsx` wires those helpers into the screen.

## Auth And Sync

Supabase browser configuration is read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are public client values. Data access must be protected by Supabase Row Level Security policies.

The client is created in `src/lib/supabase.ts`. Auth routes and profile/progress hooks should handle Supabase being absent in local/demo environments.

## Reflection LLM

OpenAI reflection calls are server-side through `src/server/openaiReflection.ts`.

Production stores `OPENAI_API_KEY` in Secret Manager and mounts it on Cloud Run. Do not commit server API keys or pass them as Vite variables.

## Deployment

Cloud Run deployment is defined in `deploy/cloudbuild.yaml` and `deploy/Dockerfile`.

The Cloud Build trigger should point to `deploy/cloudbuild.yaml`. `deploy/complete-github-trigger.ps1` can repair the trigger path and sync Supabase build substitutions.

## Review Checklist

- Keep deploy config, Tree behavior, and UI interaction changes in separate commits.
- Do not commit `.env.local`, `.output/`, temp screenshots, generated exports, or telemetry scratch files.
- Run `npm run test` and a production-style `CI_GCP=1 npm run build` before pushing.
