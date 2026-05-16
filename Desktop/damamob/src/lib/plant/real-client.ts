import type {
  Artifact,
  Job,
  PlantClient,
  PlantEvent,
  WavesSnapshot,
} from "./types";

export class RealPlantClient implements PlantClient {
  private eventBus = new EventTarget();
  private wavesBus = new EventTarget();
  private lastTs = 0;
  private currentEvents: PlantEvent[] = [];

  constructor() {
    this.poll();
  }

  private async poll() {
    try {
      const resp = await fetch("/events.json?t=" + Date.now());
      if (resp.ok) {
        const events: PlantEvent[] = await resp.json();
        this.currentEvents = events;
        const newEvents = events.filter(e => e.ts > this.lastTs);
        for (const e of newEvents) {
          this.eventBus.dispatchEvent(new CustomEvent("e", { detail: e }));
          this.lastTs = Math.max(this.lastTs, e.ts);
        }
        if (newEvents.length > 0) {
            this.wavesBus.dispatchEvent(new CustomEvent("w"));
        }
      }
    } catch (e) {
      // Fail silently
    }
    setTimeout(() => this.poll(), 1000);
  }

  subscribeEvents(handler: (e: PlantEvent) => void) {
    const fn = (ev: Event) => handler((ev as CustomEvent<PlantEvent>).detail);
    this.eventBus.addEventListener("e", fn);
    return () => this.eventBus.removeEventListener("e", fn);
  }

  subscribeWaves(handler: (w: WavesSnapshot) => void) {
    const fn = () => handler(this.getWavesSync());
    this.wavesBus.addEventListener("w", fn);
    // Initial update
    setTimeout(() => handler(this.getWavesSync()), 0);
    return () => this.wavesBus.removeEventListener("w", fn);
  }

  async getRecentEvents(limit = 200) {
    return this.currentEvents.slice(-limit).reverse();
  }

  private getWavesSync(): WavesSnapshot {
    const lastEvent = this.currentEvents[this.currentEvents.length - 1];
    const isIngesting = lastEvent && !lastEvent.verb.includes("done") && !lastEvent.verb.includes("sealed");

    return {
      wave1: Array.from({ length: 8 }, (_, i) => ({
        index: i,
        busy: isIngesting && i === 0,
        task: isIngesting && i === 0 ? "download" : undefined,
        sutta_title: isIngesting && i === 0 ? lastEvent.job_id : undefined
      })),
      wave2: { locked: false, vram_loaded: false, queue_depth: 0 },
      wave3: { pipeline: {}, ready_to_seal: 0 },
      throughput_per_hour: this.currentEvents.filter(e => e.verb === "seal.uploaded").length,
      errors_last_hour: 0
    };
  }

  async getWaves() {
      return this.getWavesSync();
  }

  async getJobs(): Promise<Job[]> { return []; }
  async getJob(id: string) { return null; }

  async getArtifacts(filter?: { hash_prefix?: string; model?: string; sutta_id?: string }) {
    try {
      const resp = await fetch("/hdb.json?t=" + Date.now());
      if (resp.ok) {
        const artifacts: Artifact[] = await resp.json();
        return artifacts
          .filter((a) => !filter?.hash_prefix || a.hash_id.startsWith(filter.hash_prefix))
          .filter((a) => !filter?.model || a.model_version === filter.model)
          .filter((a) => !filter?.sutta_id || a.sutta_id === filter.sutta_id)
          .sort((a, b) => b.created_at - a.created_at);
      }
    } catch (e) {}
    return [];
  }

  controls = {
    setSpeed: () => {},
    getSpeed: () => 1,
    spawnSutta: () => {},
    failNextGen: () => {},
    spawnUrl: async (url: string) => {
      try {
        await fetch("http://localhost:8088/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, slug: "url1" })
        });
      } catch (e) {
        console.error("Failed to trigger python ingest:", e);
      }
    }
  };
}
