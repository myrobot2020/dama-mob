# Plant adapter

The dashboard talks to your tickerplant through a single typed interface
(`PlantClient` in `types.ts`). The client is selected at runtime via
`VITE_PLANT_MODE`:

- `mock` (default) — in-memory simulator. Realistic event flow, useful for
  designing and stress-testing the UI without the real plant running.
- `http` — calls your local plant over REST + WebSocket. Not yet implemented;
  add `http-client.ts` matching the `PlantClient` interface and wire it in
  `client.ts`.

## Wire protocol (target for the real plant)

```
GET  /events?since=<cursor>&limit=200       -> PlantEvent[]
WS   /ws/events                              -> PlantEvent stream (push)
GET  /jobs?status=&wave=                     -> Job[]
GET  /jobs/:id                               -> { job, artifacts, events }
GET  /artifacts?hash_prefix=&model=          -> Artifact[]   (sealed = HDB)
GET  /waves                                  -> WavesSnapshot
```

All shapes are exported from `types.ts`. Event verbs match the diagram:

```
discovery.published
wave1.download.started | wave1.download.done | wave1.extract.done | wave1.segment.done
wave2.gpu.lock.acquired | wave2.gpu.lock.released
wave2.gen.done | wave2.translate.done | wave2.dub.done
wave3.match.done | wave3.weave.done | wave3.validate.done | wave3.validate.failed
seal.uploaded | rebuild.done
```
