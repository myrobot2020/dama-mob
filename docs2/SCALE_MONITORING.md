# Scale And Monitoring

Docs2 has two scale domains:

```text
1. App scale: readers, auth, sync, audio, AI reflection.
2. Data plant scale: local pipeline throughput, workers, artifacts, GCS seal.
```

## Scaling Principles

| Principle | Rule |
|---|---|
| Static first | Public corpus/audio/images should be served from object storage/CDN |
| Local first for pipeline | Book 1/2 processing stays local until seal |
| Async workers | Workers communicate through events |
| Bounded concurrency | Limit expensive stages |
| Seal per sutta | Do not wait for whole-book batch |
| Immutable HDB | New run instead of mutating sealed runs |
| Dashboard visible | Failures and queues must be visible |

## Suggested Local Worker Limits

| Worker | Starting Limit | Reason |
|---|---:|---|
| Download | 1-2 | Avoid network/file chaos |
| Transcription | 1-2 | Expensive CPU/API step |
| Sutta match | 2-4 | Usually lighter |
| Segmentation | 2-4 | Text processing |
| Audio timestamps | 1-2 | Needs quality review |
| Generation | 1-4 | Model/API cost |
| Image extraction | 1 | CPU/storage heavy |
| Validation | 2-4 | Fast schema/reference checks |
| Seal to GCS | 1 | Avoid partial/upload confusion |

## Backpressure

Backpressure means workers stop claiming new jobs when downstream is overloaded.

Examples:

```text
too many open review items -> pause generation
too many unsealed validated suttas -> slow validation
GCS seal failing -> stop new seals
disk space low -> pause downloads and image extraction
```

## Monitoring Signals

| Signal | Watch For |
|---|---|
| Queue depth by stage | Bottlenecks |
| Job failure rate | Bad source, bad worker, bad schema |
| Retry count | Flaky stage |
| Review backlog | Human bottleneck |
| Artifact disk usage | Local storage pressure |
| GCS upload errors | Credential/CORS/network/prefix issue |
| Seal count | Actual completed output |
| Rebuild failures | HDB integrity issue |
| AI cost/latency | Generation runaway |

## App Scale From Old Docs

Old scale rules still matter:

```text
Supabase writes should be batched/debounced.
Audio progress should be throttled.
UX events should be batched.
AI should be rate-limited.
Static corpus/audio should be cached.
Cloud Run max instances should prevent runaway cost.
```

## Rate Limits

| Area | Starting Rule |
|---|---|
| Reflection AI | Daily per-user/device limit |
| Anonymous reflection | Very low daily device limit |
| Public generation | Disabled; admin/manual only |
| UX events | Batch and sample |
| Reading progress | Debounce |
| Audio progress | Throttle |
| Pipeline generation | Limit concurrent model jobs |
| GCS seal | Single seal worker initially |

## Cost Controls

| Cost Source | Control |
|---|---|
| AI generation | Batch, cap tokens, store model/prompt version |
| Transcription | Avoid duplicate audio; use hashes |
| GCS storage | Seal clean artifacts; avoid WIP upload |
| GCS egress | Cache public serving assets |
| Supabase writes | Debounce/batch user progress |
| Logs/traces | Retention and payload caps |

## Graceful Degradation

| Failure | System Behavior |
|---|---|
| AI model down | Keep reading/pipeline review available |
| Supabase down | App uses local-only progress |
| GCS seal down | Keep local validated artifacts and retry later |
| Dashboard down | Workers can continue, logs remain |
| Image selector pending | Sutta remains unsealed or seals without image only if policy allows |
| Rebuild fails | Do not publish new serving projection |

## Future Cloud Scale

Only after local contracts stabilize:

```text
local event bus -> Pub/Sub
local workers -> Cloud Run jobs/workers
local RDB -> managed DB
local artifacts -> controlled cloud work bucket
GCS HDB remains sealed canonical store
```

