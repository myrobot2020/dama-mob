# DAMA Architecture Status

Estimated completion is based on the current repository shape as of 2026-04-30. Percentages are directional: they measure whether the layer has usable product code, tests, operational wiring, and production readiness.

Overall architecture completion: **52.3%**

| # | Layer | % Done | Status | Evidence / Notes |
|---:|---|---:|---|---|
| 1 | Input / Command Layer | 75% | Mostly built | Mobile routes exist for reflection, sutta pages, quiz/tree/profile; pipeline commands are in `package.json`. |
| 2 | Output Layer | 60% | Partial | Reflection and quiz UI output exist; harness has `formatReflection`, but not a full mobile response contract for all intents. |
| 3 | Intent Parser | 70% | Working v1 | `parseHarnessIntent` covers reflection, quiz, read, sync, search, pipeline, and ingestion with regex rules. |
| 4 | Tool Layer | 65% | Partial registry | Harness tool types and several executors exist in `src/lib/harnessTools.ts`; some tools are placeholders. |
| 5 | Tool Router | 70% | Working v1 | `planHarnessSteps` maps intents to deterministic tool sequences. |
| 6 | Execution Engine | 55% | Partial | `runHarness` has sequential execution and retries; explicit timeout controls are still missing. |
| 7 | Error Handler | 50% | Basic | Returns user-safe `HarnessRunResult` errors, but no centralized message taxonomy yet. |
| 8 | State Manager (Short-term) | 70% | Working v1 | `HarnessRunState` tracks input, intent, steps, trace, outputs, and timing. |
| 9 | Logging & Tracing | 55% | Partial | Trace events exist and can sync to Supabase; production dashboards and retention policy are not built. |
| 10 | Planner (Rule-based) | 75% | Mostly built | Deterministic plans exist for standard intents. |
| 11 | Orchestrator (Control Loop) | 65% | Working v1 | `runHarness` connects validation, parser, guardrails, planner, and tools. |
| 12 | Validation Layer | 60% | Partial | Input text and channel checks exist; broader payload/schema validation is incomplete. |
| 13 | Guardrails | 45% | Basic | Secret/destructive-action checks exist; richer policy enforcement and approval integration are not done. |
| 14 | Prompt Builder / Context Assembler | 70% | Mostly built | Read-sutta context loading and reflection prompt paths exist. |
| 15 | Model Layer (LLM) | 65% | Partial | Server-side OpenAI reflection exists; Gemini/dev middleware is referenced; provider abstraction is not complete. |
| 16 | Output Parser | 55% | Partial | OpenAI response text extraction exists; structured normalization across all model outputs is incomplete. |
| 17 | Feedback / Evaluation Loop | 35% | Early | Retries exist; scoring, groundedness evaluation, and quality feedback loop are not implemented. |
| 18 | Knowledge Base | 80% | Strong | `data/validated-json`, GCS corpus design, local index/data, and docs are present. |
| 19 | Ingestion / Indexing Pipeline | 80% | Strong | `scripts2` contains download, segment, link, validate, sync, index, and tally scripts. |
| 20 | Retrieval Layer | 65% | Partial | Direct corpus and read-context retrieval exist; ranking/search is still limited. |
| 21 | Vector Memory | 30% | Scaffolded | pgvector schema, embedding helper, and vector tool slot exist; indexing/backfill and safe server-side embedding flow need work. |
| 22 | Structured Memory | 70% | Mostly built | Local progress, leaves, profiles, audio/reading progress, and UX logs exist. |
| 23 | Long-term Memory | 60% | Partial | Supabase sync hooks/schema exist; full continuity/history model is incomplete. |
| 24 | Agent Communication Protocol | 45% | Basic | Harness input/result envelope exists; multi-agent protocol is not formalized. |
| 25 | Planner (LLM / Hybrid) | 10% | Future | Only comments/deferred notes exist. |
| 26 | Checkpointing Layer | 20% | Early | State/trace shape could support resume, but no persistence/resume engine yet. |
| 27 | Confidence / Calibration Layer | 30% | Early | Intent confidence exists; answer groundedness/calibration scoring is not built. |
| 28 | Simulation / Testing Layer | 60% | Partial | Vitest, Playwright, Python tests, and harness scenario tests exist; coverage target and scenario breadth need expansion. |
| 29 | Human-in-the-loop Interface | 20% | Early | Guardrail errors mention approval; no approval UI/workflow yet. |
| 30 | Monitoring & Metrics | 30% | Early | Trace schema captures duration/status; no metrics dashboard, cost tracking, or alerting. |
| 31 | Configuration Layer | 70% | Mostly built | Env variables, GCS bases, Supabase, model config, Vite config, and examples exist. |
| 32 | Security Layer | 55% | Partial | Server-side reflection key pattern and Supabase RLS docs exist; embedding helper currently expects a Vite OpenAI key and should move server-side. |
| 33 | Versioning Layer | 25% | Early | Git/docs/env exist; prompt/model/dataset version registry is missing. |
| 34 | Distributed Orchestration Layer | 5% | Future | No queue/cloud task orchestration found. |
| 35 | Cloud Infrastructure Layer | 75% | Mostly built | Cloud Run, Cloud Build, Dockerfile, GCS docs, and production URL are documented. |
| 36 | CI/CD + Release Layer | 60% | Partial | Build/test/e2e scripts and Cloud Build trigger config exist; automated coverage gates/releases need hardening. |
| 37 | Model Adaptation Pipeline | 5% | Future | No fine-tuning/eval training loop yet; trace data can become the seed. |

## Highest-impact next work

1. Move embeddings behind a server-side endpoint so `OPENAI_API_KEY` is never exposed through Vite.
2. Route the reflection flow through `runHarness` so layers 3-17 are exercised in the real UI.
3. Add a coverage command and enforce the 85% target in CI.
4. Backfill pgvector embeddings for `data/validated-json` and test `match_suttas`.
5. Add a human-approval screen for admin pipeline/cloud actions.
