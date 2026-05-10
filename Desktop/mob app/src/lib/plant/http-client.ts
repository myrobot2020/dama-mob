import type {
  Artifact,
  Job,
  PlantClient,
  PlantEvent,
  WavesSnapshot,
} from "./types";

/**
 * Real HTTP client for the Dama tickerplant.
 * Polls /api/pipeline/status and maps it to the Plant protocol.
 */
export class HttpPlantClient implements PlantClient {
  private eventHandlers = new Set<(e: PlantEvent) => void>();
  private wavesHandlers = new Set<(w: WavesSnapshot) => void>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: WavesSnapshot | null = null;
  private lastJobs: Map<string, Job> = new Map();

  constructor() {
    this.startPolling();
  }

  private startPolling() {
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 2000);
  }

  private async poll() {
    try {
      const resp = await fetch("/api/pipeline/status");
      if (!resp.ok) return;
      const data = await resp.json();

      const snapshot = this.mapToSnapshot(data);
      this.lastSnapshot = snapshot;
      this.wavesHandlers.forEach((h) => h(snapshot));

      // Check for changes to emit events
      const jobs = this.mapToJobs(data);
      for (const job of jobs) {
        const prev = this.lastJobs.get(job.id);
        if (!prev || prev.status !== job.status) {
          this.emitSyntheticEvent(job);
        }
        this.lastJobs.set(job.id, job);
      }
    } catch (e) {
      console.error("Plant poll failed", e);
    }
  }

  private mapToSnapshot(data: any): WavesSnapshot {
    // Basic mapping from /api/pipeline/status to WavesSnapshot
    return {
      wave1: Array.from({ length: 8 }, (_, i) => ({ index: i, busy: false })), // No real worker mapping yet
      wave2: {
        locked: data.resources?.gpu > 50, // Heuristic
        vram_loaded: true,
        queue_depth: data.queues?.queued || 0,
      },
      wave3: {
        pipeline: {},
        ready_to_seal: 0,
      },
      throughput_per_hour: data.queues?.completed || 0,
      errors_last_hour: data.queues?.failed || 0,
    };
  }

  private mapToJobs(data: any): Job[] {
    return (data.sources || []).map((s: any) => ({
      id: s.sutta_id || s.suttaHint,
      sutta_id: s.sutta_id || s.suttaHint,
      title: s.title || s.suttaHint,
      source: "youtube",
      status: s.status,
      current_wave: this.statusToWave(s.status),
      started_at: s.started_at ? new Date(s.started_at).getTime() : Date.now(),
      updated_at: s.updated_at ? new Date(s.updated_at).getTime() : Date.now(),
    }));
  }

  private statusToWave(status: string): 1 | 2 | 3 | 0 {
    const s = status.toLowerCase();
    if (s === "queued" || s === "running") return 1;
    if (s === "completed" || s === "sealed") return 3;
    return 0;
  }

  private emitSyntheticEvent(job: Job) {
    const event: PlantEvent = {
      id: `syn_${Date.now()}_${job.id}`,
      ts: Date.now(),
      verb: this.statusToVerb(job.status),
      job_id: job.id,
      sutta_id: job.sutta_id,
      wave: job.current_wave,
    };
    this.eventHandlers.forEach((h) => h(event));
  }

  private statusToVerb(status: string): any {
    const s = status.toLowerCase();
    if (s === "running") return "wave1.download.started";
    if (s === "completed") return "seal.uploaded";
    return "discovery.published";
  }

  subscribeEvents(handler: (e: PlantEvent) => void) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  subscribeWaves(handler: (w: WavesSnapshot) => void) {
    this.wavesHandlers.add(handler);
    return () => this.wavesHandlers.delete(handler);
  }

  async getRecentEvents(limit = 200) {
    // We don't have a real event history endpoint yet, so we just return empty or cached
    return [];
  }

  async getWaves() {
    return this.lastSnapshot || this.mapToSnapshot({});
  }

  async getJobs() {
    const resp = await fetch("/api/pipeline/status");
    const data = await resp.json();
    return this.mapToJobs(data);
  }

  async getJob(id: string) {
    const resp = await fetch(`/api/pipeline/status?sutta_id=${id}`);
    if (!resp.ok) return null;
    const s = await resp.json();
    const job: Job = {
      id: s.sutta_id || s.suttaHint,
      sutta_id: s.sutta_id || s.suttaHint,
      title: s.title || s.suttaHint,
      source: "youtube",
      status: s.status,
      current_wave: this.statusToWave(s.status),
      started_at: s.started_at ? new Date(s.started_at).getTime() : Date.now(),
      updated_at: s.updated_at ? new Date(s.updated_at).getTime() : Date.now(),
    };
    return { job, artifacts: [], events: [] };
  }

  async getArtifacts(filter?: any) {
    // We can fetch artifacts from some other endpoint if available
    return [];
  }

  controls = {
    setSpeed: () => {},
    spawnSutta: () => {},
    spawnUrl: async (url: string) => {
      await fetch("/api/pipeline/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sutta_id: url }), // This might need to be different for new URLs
      });
    },
    failNextGen: () => {},
    getSpeed: () => 1,
  };
}
