import type { Artifact, Job, PlantClient, PlantEvent, WavesSnapshot } from "./types";

export class HttpPlantClient implements PlantClient {
  private baseUrl = "/pipeline-status-api";
  private eventHandlers = new Set<(e: PlantEvent) => void>();
  private waveHandlers = new Set<(w: WavesSnapshot) => void>();
  private pollInterval: number | null = null;
  private lastSnapshot: any = null;

  constructor() {
    this.startPolling();
  }

  private startPolling() {
    this.pollInterval = window.setInterval(async () => {
      try {
        const snap = await this.getSnapshot();
        this.lastSnapshot = snap;

        const waves = this.mapSnapshotToWaves(snap);
        this.waveHandlers.forEach((h) => h(waves));

        // Note: Real events would need a separate endpoint or be in the snapshot.
        // For now, we derive them or keep it empty if not available.
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);
  }

  private async getSnapshot() {
    const res = await fetch(this.baseUrl);
    return res.json();
  }

  private mapSnapshotToWaves(snap: any): WavesSnapshot {
    const resources = snap.resources || {};
    const sources = snap.sources || [];

    // Wave 1: Show suttas that are currently in 'discovered' status (ingesting/downloading)
    const activeIngests = sources.filter((s: any) => s.status === "discovered");

    return {
      wave1: Array.from({ length: 8 }, (_, idx) => {
        const source = activeIngests[idx];
        return {
          index: idx,
          busy: !!source,
          task: source ? "ingest" : undefined,
          job_id: source?.sourceId,
          sutta_title: source?.title || source?.suttaHint,
          started_at: source ? Date.now() - 5000 : undefined, // Approximation
        };
      }),
      wave2: {
        locked: resources.gpu?.available && resources.gpu?.used > 500, // Real GPU memory usage
        vram_loaded: resources.gpu?.available,
        queue_depth: snap.queues?.queued || 0,
        sutta_title: sources.find((s: any) => s.status === "running")?.title,
        stage: "gen",
      },
      wave3: {
        pipeline: {
          validate: sources.find((s: any) => s.status === "validating")?.title,
          seal: sources.find((s: any) => s.status === "sealing")?.title,
        },
        ready_to_seal: snap.queues?.sealed || 0,
      },
      throughput_per_hour: snap.stages_global?.seal || 0,
      errors_last_hour: snap.queues?.failed || 0,
    };
  }

  subscribeEvents(handler: (e: PlantEvent) => void) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  subscribeWaves(handler: (w: WavesSnapshot) => void) {
    this.waveHandlers.add(handler);
    return () => this.waveHandlers.delete(handler);
  }

  async getRecentEvents(limit = 200): Promise<PlantEvent[]> {
    try {
      const res = await fetch(`/pipeline-events-api?limit=${limit}`);
      const data = await res.json();
      return (data || []).map((e: any) => ({
        ...e,
        ts: new Date(e.ts).getTime()
      }));
    } catch (e) {
      console.error("Failed to fetch events", e);
      return [];
    }
  }

  async getWaves(): Promise<WavesSnapshot> {
    const snap = await this.getSnapshot();
    return this.mapSnapshotToWaves(snap);
  }

  async getJobs(): Promise<Job[]> {
    const snap = await this.getSnapshot();
    return (snap.sources || []).map((s: any) => ({
      id: s.sourceId,
      sutta_id: s.suttaHint,
      title: s.title,
      status: s.status,
      current_wave: 0,
    }));
  }

  async getJob(id: string) {
    const snap = await this.getSnapshot();
    // In our simplified '01' world, 'jobId' might actually be the suttaId or sourceId
    const source = (snap.sources || []).find((s: any) => s.sourceId === id || s.suttaHint === id);

    if (!source) return null;

    return {
      job: {
        id: source.sourceId,
        sutta_id: source.suttaHint,
        title: source.title,
        status: source.status,
        current_wave: 0,
        source: "youtube",
        started_at: Date.now(), // Fallback
        updated_at: Date.now(),
      },
      artifacts: (source.artifacts || []).map((a: any) => ({
        id: a.uri,
        job_id: id,
        sutta_id: source.suttaHint,
        kind: a.type,
        hash_id: a.uri.split('/').pop() || "unknown",
        size_bytes: 0,
        created_at: new Date(a.at).getTime(),
        golden: a.type === "final_json"
      })),
      events: [] // We'd need to extend status.py to get sutta-specific events
    };
  }

  async getArtifacts(filter?: { hash_prefix?: string; model?: string; sutta_id?: string }) {
    const snap = await this.getSnapshot();
    const artifacts: Artifact[] = [];

    (snap.sources || []).forEach((source: any) => {
      (source.artifacts || []).forEach((art: any) => {
        if (filter?.sutta_id && source.suttaHint !== filter.sutta_id) return;
        if (filter?.hash_prefix && !art.uri.includes(filter.hash_prefix)) return;

        artifacts.push({
          id: art.uri,
          job_id: source.sourceId, // Use sourceId as the 'job link'
          sutta_id: source.suttaHint,
          kind: art.type,
          hash_id: art.uri.split('/').pop() || "unknown",
          size_bytes: 0,
          created_at: new Date(art.at).getTime(),
          golden: art.type === "final_json"
        });
      });
    });

    return artifacts.sort((a, b) => b.created_at - a.created_at);
  }

  async ingest(url: string) {
    const res = await fetch(`/work-api/ingest?url=${encodeURIComponent(url)}`, {
      method: "POST",
    });
    return res.json();
  }

  async clearAll() {
    const res = await fetch(`/work-api/clear-all`, {
      method: "POST",
    });
    return res.json();
  }
}
