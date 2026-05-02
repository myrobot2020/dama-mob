# DAMA Docs

This folder contains the core rebuild documentation for the app.

## Core Doc Set

| Doc | Role |
|---|---|
| `BUILD.md` | End-to-end build, verify, and deploy sequence |
| `ARCHITECTURE.md` | Stack, services, runtime boundaries, env vars, testing, security |
| `DATABASE.md` | Primary, secondary, and tertiary data layers |
| `SCREENS.md` | Book of Ones screen flow and UI behavior |
| `AI.md` | AI harness, model behavior, grounding, safety, tracing |
| `SCALE.md` | Rate limits, quotas, caching, cost controls, global readiness |
| `PM.md` | Dynamic timeline, estimates, blockers, confidence, and critical path |

## Reading Order

| Order | Read | Why |
|---:|---|---|
| 1 | `BUILD.md` | Shows the full rebuild path |
| 2 | `ARCHITECTURE.md` | Explains the stack and services |
| 3 | `DATABASE.md` | Explains what data exists and how it is classified |
| 4 | `SCREENS.md` | Explains the Book of Ones product flow |
| 5 | `AI.md` | Explains the reflection/harness layer |
| 6 | `SCALE.md` | Explains limits, quotas, caching, and scale controls |
| 7 | `PM.md` | Tracks time, status, blockers, and delivery risk |

## Maintenance Rule

When implementation changes, update the smallest matching doc:

| Change type | Update |
|---|---|
| Stack, service, env, deployment, testing | `ARCHITECTURE.md` |
| Data class, ownership, sync, generated data | `DATABASE.md` |
| Screen, route, user flow, UI state | `SCREENS.md` |
| Model, harness, AI safety, reflection behavior | `AI.md` |
| Rate limit, quota, cache, cost, scale concern | `SCALE.md` |
| Build order, command, verification path | `BUILD.md` |
| Estimate, blocker, timeline, critical path | `PM.md` |
