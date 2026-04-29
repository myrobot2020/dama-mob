# DAMA AI Harness Inferred Build

This file records the assumptions I can infer from the repo so the AI harness can move without waiting on more product discovery.

## Inferred Product Shape

- Product: DAMA, a mobile-first Pali Canon reading, audio, quiz, tree-progress, and reflection app.
- Primary AI use case: grounded end-of-day reflection over suttas the user has marked as read.
- Secondary AI use cases: corpus search, quiz generation/review, progress insight, translation/data pipeline support.
- Main users: individual learners using the mobile web app.
- Canonical knowledge: `data/validated-json`, generated `nikaya/index.json`, GCS corpus bucket, local quiz modules, and read-sutta context loaded from app progress.
- Non-canonical knowledge: general Buddhist claims not present in supplied excerpts, generated content without source ids, and user-entered secrets.

## Inferred Inputs And Outputs

- Inputs: `/reflect` textarea, sutta/quiz/tree/profile UI triggers, API requests, `scripts2` pipeline commands, scheduled cloud checks later.
- Output formats: mobile UI text for reflection, typed JSON for API/tool results, localStorage/Supabase writes for progress, CLI exit status for pipeline work.
- Required reflection grounding: at least one marked-read sutta id and loaded excerpt.
- Expected reflection output: short title, concise insights, practical practice, one follow-up question, and source sutta ids where relevant.

## Inferred Tools

- Corpus tools: `getItems`, `getItem`, `loadReadSuttaContexts`, GCS-backed corpus files.
- Model tools: OpenAI Responses API and Gemini generateContent through server/dev middleware.
- Storage tools: localStorage stores, Supabase auth/profile/progress tables.
- Ops tools: `npm run test`, `npm run test:e2e`, `npm run build`, `npm run verify`, `npm run pipe2:*`.
- Cloud tools: Cloud Run, Cloud Build, GCS JSON/audio buckets, Supabase.

## Inferred Safety Rules

- Do not expose API keys through Vite/client variables.
- Do not accept prompt text that includes secrets.
- Do not answer reflection as scripture unless exact text is present in the supplied corpus excerpts.
- Do not use unmarked or unloaded suttas as grounding for personalized reflection.
- Require human approval before destructive production/database/cloud actions.
- Keep local progress stores free of secrets.

## Build Order For This Repo

1. Keep a pure TypeScript harness core in `src/lib/aiHarness.ts`: input validation, intent parsing, guardrails, deterministic planning, execution, retry, tracing, and the DAMA 37-component blueprint.
2. Wrap existing reflection middleware with the harness tool registry: load read suttas, retrieve context, call configured model, parse/format output.
3. Add structured eval scenarios for reflection quality, refusal behavior, and grounding correctness.
4. Add telemetry sinks for trace events and provider metadata.
5. Add vector retrieval only after the current corpus/read-context selector is stable.
6. Add human approval UI for admin, sync, and pipeline operations.
7. Promote long-running ingestion/evaluation jobs into queue-backed cloud tasks when local scripts become too slow.

## Current Implementation Status

- Added v1 core harness: `src/lib/aiHarness.ts`.
- Added unit tests for parsing, planning, guardrails, retries, missing tools, and the 37-component blueprint.
- Existing app already covers model provider calls, corpus loading, read-sutta context selection, local progress, Supabase sync hooks, and Cloud Run deployment config.

## Next Integration Target

The next code step should be to route `/__llm/reflection` through `runHarness` while preserving the current OpenAI/Gemini fallback behavior. That will make the reflection path observable and reusable without changing the user-facing screen.
