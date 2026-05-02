# Data Architecture

This document separates the app data into three practical layers:

- **Primary data**: downloaded or owned source content the app is built from.
- **Secondary data**: user-created or user-owned data.
- **Tertiary data**: generated, derived, cached, indexed, or AI-produced data.

## Primary Data: Download / Source Content

| Order | Data | What it is | Time | Volume | Cost | Failure risks | Build checklist |
|---:|---|---|---|---|---|---|---|
| 1 | Canon text JSON | Sutta text, IDs, titles, nikaya/book structure | Mostly static, batch updates | High file count, medium size | Low storage, medium validation time | Missing suttas, duplicate IDs, broken JSON, bad encoding | Define ID format, download/import source, validate schema, version snapshots |
| 2 | Audio files | Teacher audio per sutta/playlist | Static or slow-changing | Very large | High storage + bandwidth | Missing files, bad paths, CORS, mobile load issues | Standard path convention, upload to cloud, verify streaming, keep manifest |
| 3 | Audio mappings | Text-to-audio timestamps | Batch-generated | Medium | Medium manual QA | Drift, bad start/end times, wrong sutta link | Validate timestamp order, check coverage, flag low confidence |
| 4 | Static app content | Built-in quizzes, prompts, practice content, images | Slow editorial updates | Low to medium | Low | Broken references, stale content, unclear answers | Give stable IDs, link to sutta IDs, test references |
| 5 | Source metadata | Source, license, version, language, translator/teacher info | Static but important | Low | Low | No provenance, legal/credit issues | Store source/version/license with each corpus release |

## Secondary Data: User Data

| Order | Data | What it is | Time | Volume | Cost | Failure risks | Build checklist |
|---:|---|---|---|---|---|---|---|
| 1 | Auth account | User login identity, email, Supabase user ID | Created once, used often | One per user | Low to medium | Signup/login/reset failures | Configure auth, redirects, RLS, smoke test login/reset |
| 2 | Profile | Username, display name, avatar | Created during onboarding | One per user | Low | Duplicate username, incomplete onboarding | Unique username, validation, profile update flow |
| 3 | Reading progress | Opened/read suttas, counts, timestamps | Frequent small writes | Users x suttas | DB writes | Lost offline progress, overwrite conflicts | Local cache, server sync, merge by `updated_at` |
| 4 | Audio progress | Listen fraction per sutta | Frequent during playback | Users x listened suttas | Can get costly if unthrottled | Write spam, progress regression | Throttle writes, clamp 0..1, resume across devices |
| 5 | Quiz/leaf state | Attempts, selected answer, leaf color, review due time | Medium frequency | Users x quizzes | Medium | Local data loss, duplicate attempts, wrong decay timing | Server table, local migration, deterministic review rules |
| 6 | Reflection answers | User-written practice/reflection text | Low to medium | Can become large | Storage + privacy cost | Sensitive data leakage, draft loss | Private by default, autosave, delete/export, strict RLS |
| 7 | Settings | Theme, language, playback/reading prefs | Low frequency | Small | Low | Lost prefs, invalid values | Schema defaults, migration, decide per-user vs per-device |
| 8 | Device identity | Local device ID for sync/logging | Created once per browser/device | Small | Low | Shared-device leakage, reset on clear storage | Random ID, no secrets, reset policy on logout |

## Tertiary Data: Generated / Derived Data

| Order | Data | What it is | Time | Volume | Cost | Failure risks | Build checklist |
|---:|---|---|---|---|---|---|---|
| 1 | Index files | Generated `index.json`, navigation lists, corpus manifests | Rebuilt after corpus changes | Medium | Low | Stale index, missing new files | Generate from source, never hand-edit, tally after build |
| 2 | Search data | Search index, token maps, lookup tables | Rebuilt after text changes | Medium to high | Medium compute/storage | Bad ranking, stale results | Version with corpus, rebuild pipeline, test known queries |
| 3 | Embeddings | Vector data for semantic search | Generated from corpus text | High | API/compute + DB storage | Wrong model version, stale vectors, high cost | Store model/version, batch generation, rebuild only changed suttas |
| 4 | AI outputs | Generated summaries, explanations, hints, answers | On demand or batch | Variable | API/model cost | Hallucination, unsafe interpretation, stale output | Mark generated, store prompt/model/version, review important content |
| 5 | Analytics summaries | Counts, funnels, dashboards, progress aggregates | Periodic | Low to medium | Low to medium | Wrong conclusions from bad events | Generate from raw events, keep reproducible queries |
| 6 | UX event aggregates | Session summaries, feature usage, error rates | Continuous/periodic | Medium | Storage + compute | Over-collection, privacy risk | Batch raw events, redact, aggregate separately |
| 7 | Cache data | Browser cache, API cache, preloaded corpus chunks | Temporary | Variable | Storage/bandwidth | Stale cache, broken offline mode | Cache versioning, clear on corpus version change |
| 8 | Validation reports | Missing files, failed schema rows, tally reports | Per pipeline run | Low | Low | Ignored failures, no repair trail | Save report with run ID, fail build on critical errors |

