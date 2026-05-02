# PM

Purpose: dynamic project-management dashboard for rebuilding, testing, and shipping the app. This doc focuses on time, order, blockers, confidence, and progress.

Last updated: 2026-04-30

## Dynamic Status Legend

| Status | Meaning |
|---|---|
| `Not started` | No active work yet |
| `Ready` | Can start now |
| `In progress` | Currently being worked |
| `Blocked` | Waiting on data, access, decision, or failing dependency |
| `At risk` | Moving, but estimate/confidence is weak |
| `Done` | Meets done criteria |

## Rebuild Timeline

| Order | Phase | Status | Estimate | Actual | Confidence | Depends on | Can parallelize | Blockers | Done when |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | Local setup | Ready | 0.5 day | TBD | High | Repo access | No | None known | `npm install`, `python -m uv sync`, and `npm run dev` work |
| 2 | Architecture/doc alignment | Done | 0.5-1 day | TBD | High | Existing repo | Yes | None known | `ARCHITECTURE.md`, `DATABASE.md`, `SCREENS.md`, `AI.md`, `BUILD.md`, `PM.md` exist |
| 3 | Primary data rebuild | Ready | 2-7 days | TBD | Medium | Corpus/audio source access | Partly | Missing source/audio uncertainty | Corpus JSON/audio/mappings validate and tally passes |
| 4 | App shell rebuild | Ready | 1-3 days | TBD | High | Local setup | Yes | None known | Routes, layout, nav, styling, and core app shell run locally |
| 5 | Book of Ones screens | Ready | 2-5 days | TBD | High | App shell, corpus index | Yes | Corpus completeness | Home, browse, reader, practice, tree, quiz flow work |
| 6 | Auth/profile/sync | Ready | 1-3 days | TBD | Medium | Supabase project/schema | Yes | Supabase env/RLS access | Login, profile, reading/audio sync work |
| 7 | AI reflection/harness | Ready | 1-4 days | TBD | Medium | Server model key, read-context loading | Yes | Model key/config | Reflection returns grounded answer or clear refusal/config state |
| 8 | Tests and coverage | Ready | 2-6 days | TBD | Medium | Core flows implemented | Partly | Fragile UI/e2e paths | Unit/e2e pass; coverage approaches 85% for core logic |
| 9 | Production deployment | Ready | 0.5-2 days | TBD | Medium | GCP, Supabase, secrets, GCS | No | Cloud access/secrets | Cloud Build deploys Cloud Run successfully |
| 10 | Production smoke | Ready | 0.5-1 day | TBD | High | Deployment | No | Production config issues | Home, Book One, audio, auth/profile, tree, reflection pass |

## Critical Path

| Order | Critical item | Why it blocks | Time risk |
|---:|---|---|---|
| 1 | Local setup | Nothing can be verified until install/dev works | Low |
| 2 | Primary data validity | Screens depend on corpus index and sutta JSON | Medium-high |
| 3 | Book of Ones flow | This is the core product slice currently documented | Medium |
| 4 | Supabase/Auth config | Sync and profile need real project config | Medium |
| 5 | Cloud deployment config | Production depends on GCP trigger, secrets, and env substitutions | Medium |
| 6 | Production smoke | Final proof that local assumptions match deployed runtime | Medium |

## Weekly Plan

| Week | Goal | Target output | Risk buffer |
|---:|---|---|---|
| Week 1 | Rebuild local app and primary Book of Ones flow | Local app running, Book One reader/practice/tree working | 1-2 days for corpus/audio issues |
| Week 2 | Add sync, AI, tests, and production deployment | Auth/profile/progress sync, reflection, tests, Cloud Run deploy | 2-3 days for Supabase/GCP/secrets |
| Week 3 | Hardening if needed | Coverage improvement, missing data repair, mobile polish, smoke fixes | Use only if Week 1/2 risks materialize |

## Time Buckets

| Bucket | Best case | Normal case | Risk case | Main reason time grows |
|---|---:|---:|---:|---|
| Local rebuild | 0.5 day | 1 day | 2 days | Dependency/version mismatch |
| Data rebuild | 2 days | 4 days | 7+ days | Missing audio, bad mappings, source inconsistencies |
| Book One UI | 2 days | 3-4 days | 5+ days | Mobile layout and state edge cases |
| Auth/sync | 1 day | 2 days | 4+ days | RLS, merge rules, auth redirect issues |
| AI reflection | 1 day | 2 days | 4+ days | Grounding, model errors, tracing |
| Testing | 2 days | 4 days | 6+ days | E2E fragility, coverage gaps |
| Deployment | 0.5 day | 1 day | 2+ days | GCP permissions, secrets, bucket CORS |

## Live Blocker Log

| Date | Blocker | Owner | Impact | Next action | Status |
|---|---|---|---|---|---|
| 2026-04-30 | None recorded | TBD | None | Keep updating this table during rebuild | Ready |

## Decision Log

| Date | Decision | Reason | Impact |
|---|---|---|---|
| 2026-04-30 | Use five core docs: `BUILD`, `ARCHITECTURE`, `DATABASE`, `SCREENS`, `AI` | Avoid doc bloat while preserving rebuild clarity | `BUILD.md` becomes the stitching doc |
| 2026-04-30 | Add `PM.md` as dynamic time dashboard | User cares most about timing and execution visibility | Update estimates/status as work changes |

## Update Rules

| Trigger | What to update |
|---|---|
| After finishing a phase | Set status to `Done`, fill actual time, adjust downstream estimates |
| After a failed test/build/deploy | Add blocker, mark affected phase `Blocked` or `At risk` |
| After discovering missing data/access | Add blocker and raise risk buffer |
| After scope changes | Update estimates and weekly plan |
| Before production deploy | Confirm all critical-path rows are `Done` or explicitly accepted |

