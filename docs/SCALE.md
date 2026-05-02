# Scale

Purpose: make the app safe, affordable, and reliable as usage grows worldwide.

## Scaling Principles

| Principle | Rule |
|---|---|
| Static first | Corpus JSON, index files, images, and audio should be served from object storage/CDN, not the app server |
| User data only in DB | Supabase should store auth, profiles, progress, settings, traces, and user-created content |
| AI is gated | Reflection and generated content must have per-user/per-device limits |
| Writes are batched | Progress, audio, UX events, and traces should avoid write-per-click behavior |
| Degrade gracefully | If AI, sync, or analytics fails, reading must still work |
| Cache aggressively | Static corpus/audio can be cached by version |
| Keep secrets server-side | No model/API secrets in browser variables |

## Rate Limits

| Area | Suggested limit | Key | Action when exceeded |
|---|---:|---|---|
| Reflection AI | 10-30 requests/user/day | `user_id` or `device_id` | Show daily limit message |
| Anonymous reflection | 3-5 requests/device/day | `device_id` + IP | Ask user to sign in |
| Quiz generation | Admin/manual only at first | Admin user | Disable public generation |
| Vector search | 30-100 searches/user/day | `user_id` or `device_id` | Fall back to keyword/read context |
| UX events | Batch every 10-30 events or 30-60 sec | Device/session | Drop low-priority events |
| Reading progress | Debounce 2-10 sec | User+sutta | Merge locally, sync later |
| Audio progress | Throttle 10-30 sec | User+sutta | Store latest local position |
| Auth signup | Supabase/email provider limits | IP/email | CAPTCHA or email verification |
| Password reset | Supabase/email provider limits | Email/IP | Cooldown message |

## Cloud Run Scaling

| Setting | Starting value | Reason |
|---|---:|---|
| Region | `asia-south1` | Current deployment region |
| Min instances | `0` or `1` | `0` saves cost, `1` reduces cold starts |
| Max instances | `5-20` initially | Prevents runaway cost |
| Concurrency | `40-80` | Mostly lightweight server work |
| CPU | `1` | Enough for app server |
| Memory | `512Mi-1Gi` | Adjust after observing |
| Timeout | `60s` | AI calls may take time, but should not hang |
| Server port | `8080` | Existing Docker/Cloud Run config |

## Caching

| Asset | Cache strategy | Notes |
|---|---|---|
| Corpus index | Versioned URL or short TTL | Rebuild after corpus changes |
| Sutta JSON | Long cache if content-addressed/versioned | Clear/version on corpus release |
| Audio files | Long cache | Audio is large and mostly immutable |
| Images | Long cache | App assets are build-hashed |
| AI responses | Usually no shared cache | User-specific and sensitive |
| Vector results | Optional short cache | Cache by query hash/model/corpus version |
| UX events | Local queue | Upload batched |

## Cost Controls

| Cost source | Control |
|---|---|
| OpenAI/Gemini | Daily per-user limits, max tokens, request timeout |
| Embeddings | Generate only changed corpus chunks |
| Supabase writes | Batch/debounce progress and events |
| GCS audio egress | Cache/CDN, compressed formats, avoid autoplay |
| Cloud Run | Max instances, min instances based on traffic |
| Logs/traces | Sampling, retention policy, payload size caps |
| Vector DB | Limit match count, index properly, avoid huge chunks |

## Database Scaling

| Table / data | Scaling rule |
|---|---|
| `profiles` | One row per user, indexed by username |
| `reading_progress` | Primary key `(user_id, sutta_id)` |
| `audio_listen_progress` | Primary key `(user_id, sutta_id)`, throttle writes |
| `ux_events` | Append-only, batch insert, retention policy |
| `harness_traces` | Cap payload size, retention policy |
| `sutta_embeddings` | Index with pgvector, version by model/corpus |
| Reflections | Private rows, strict RLS, delete/export path |

## AI Scaling

| Concern | Rule |
|---|---|
| Token budget | Keep prompts short; include only needed sutta excerpts |
| Timeout | Abort model calls around 45-60 sec |
| Retry | Retry only safe transient failures, max 1-2 times |
| Model fallback | Use cheaper model first; fallback only if configured |
| Grounding | Only answer from retrieved/read context |
| Tracing | Store metadata and sources, not giant raw prompts forever |
| Abuse | Per-user/device limits and server-side validation |

## Vector DB Scaling

| Concern | Rule |
|---|---|
| Chunk size | Keep chunks small enough for precise retrieval |
| Metadata | Store `sutta_id`, nikaya, book, segment, corpus version, model |
| Query limit | Return top 5-20 matches |
| Refresh | Re-embed only changed chunks |
| Index | Use pgvector index |
| Cost | Batch embedding jobs; never embed on every page load |
| Safety | Retrieved chunks must include source IDs |

## Monitoring

| Signal | Watch for |
|---|---|
| Cloud Run latency | Cold starts, slow server functions |
| Cloud Run errors | 5xx, timeout, memory |
| AI errors | Rate limits, timeout, empty responses |
| Supabase errors | RLS failures, write spikes |
| GCS errors | 404 audio/JSON, CORS |
| UX events | High failure/drop rate |
| Cost | OpenAI, Supabase, Cloud Run, GCS egress |
| Vector search | Low relevance, slow queries |

## Graceful Degradation

| If this fails | App should |
|---|---|
| AI model | Show reflection unavailable, keep reading working |
| Supabase | Use local-only progress and retry later |
| UX logging | Drop analytics silently |
| Audio | Show text and audio unavailable message |
| Corpus index | Show error and retry/browse fallback |
| Individual sutta JSON | Show clear missing sutta error |
| Vector DB | Fall back to read-sutta context or keyword search |

## Launch Thresholds

| Area | Must be true before worldwide launch |
|---|---|
| Reading | Corpus pages load fast on mobile |
| Audio | Audio streams reliably and does not block text |
| Auth | Signup/login/reset work |
| Sync | Progress survives reload and second device |
| AI | Rate limited and server-key safe |
| Cost | Daily AI/event/audio costs are bounded |
| Monitoring | Errors and quota failures are visible |
| Recovery | App can run with AI/sync temporarily degraded |

