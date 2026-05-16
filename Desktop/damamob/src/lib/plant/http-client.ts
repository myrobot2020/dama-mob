import type {
  Artifact,
  Job,
  PlantClient,
  PlantEvent,
  WavesSnapshot,
  WaveId,
  JobStatus,
} from "./types";

/**
 * Real HTTP client for the Dama tickerplant.
 * Polls /api/pipeline/status and maps it to the Plant protocol.
 * This client now uses the "Real" status from the local streaming DB.
 */
export class HttpPlantClient implements PlantClient {
  private eventHandlers = new Set<(e: PlantEvent) => void>();
  private wavesHandlers = new Set<(w: WavesSnapshot) => void>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: WavesSnapshot | null = null;
  private lastJobs: Map<string, Job> = new Map();
  private lastStages: Map<string, string> = new Map();

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

      const jobs = this.mapToJobs(data);
      for (const job of jobs) {
        // Find the active stage in the real pipeline stages grunt
        const source = (data.sources || []).find((s: any) => s.suttaHint === job.id);
        const activeStage = source?.stages?.find((st: any) => st.status === "running" || st.status === "queued")?.stage || "none";

        const prevJob = this.lastJobs.get(job.id);
        const prevStage = this.lastStages.get(job.id);

        if (!prevJob || prevJob.status !== job.status || prevStage !== activeStage) {
          this.emitSyntheticEvent(job, activeStage);
        }

        this.lastJobs.set(job.id, job);
        this.lastStages.set(job.id, activeStage);
      }
    } catch (e) {
      console.error("Plant poll failed", e);
    }
  }

  private mapToSnapshot(data: any): WavesSnapshot {
    const sources = data.sources || [];

    // Wave 1: CPU-heavy stages grunt
    const wave1Stages = ["download", "panel_extraction", "transcription", "sutta_match", "segmentation", "audio_timestamps"];
    const wave1Busy = sources.filter((s: any) =>
      s.stages?.some((st: any) => wave1Stages.includes(st.stage) && (st.status === "running" || st.status === "queued"))
    ).slice(0, 8);

    // Wave 2: GPU-heavy stages grunt
    const wave2Stages = ["generation", "keys", "names", "translation", "dubbing"];
    const wave2Active = sources.find((s: any) =>
      s.stages?.some((st: any) => wave2Stages.includes(st.stage) && st.status === "running")
    );

    // Wave 3: Weaver/Seal stages grunt
    const wave3Active = sources.find((s: any) =>
      s.stages?.some((st: any) => ["validation", "seal", "gcs_upload"].includes(st.stage) && st.status === "running")
    );

    return {
      wave1: Array.from({ length: 8 }, (_, i) => {
        const s = wave1Busy[i];
        const activeSt = s?.stages?.find((st: any) => wave1Stages.includes(st.stage) && (st.status === "running" || st.status === "queued"));
        return {
          index: i,
          busy: !!s,
          job_id: s?.suttaHint,
          sutta_title: s?.title || s?.suttaHint,
          task: activeSt?.stage as any,
          started_at: activeSt?.updated_at ? new Date(activeSt.updated_at).getTime() : undefined,
        };
      }),
      wave2: {
        locked: !!wave2Active,
        job_id: wave2Active?.suttaHint,
        sutta_title: wave2Active?.title || wave2Active?.suttaHint,
        stage: wave2Active?.stages?.find((st: any) => wave2Stages.includes(st.stage) && st.status === "running")?.stage as any,
        vram_loaded: !!wave2Active,
        queue_depth: data.queues?.queued || 0,
        started_at: wave2Active?.updated_at ? new Date(wave2Active.updated_at).getTime() : undefined,
      },
      wave3: {
        pipeline: {
          seal: wave3Active?.stages?.find((st: any) => st.stage === "seal")?.status === "running" ? wave3Active?.title : undefined,
          validate: wave3Active?.stages?.find((st: any) => st.stage === "validation")?.status === "running" ? wave3Active?.title : undefined,
        },
        ready_to_seal: data.queues?.sealed || 0,
      },
      throughput_per_hour: data.queues?.completed || 0,
      errors_last_hour: data.queues?.failed || 0,
    };
  }

  private mapToJobs(data: any): Job[] {
    return (data.sources || []).map((s: any) => ({
      id: s.suttaHint,
      sutta_id: s.suttaHint,
      title: s.title || s.suttaHint,
      source: "youtube",
      status: this.mapStatus(s.status),
      current_wave: this.statusToWave(s),
      started_at: s.started_at ? new Date(s.started_at).getTime() : Date.now(),
      updated_at: s.updated_at ? new Date(s.updated_at).getTime() : Date.now(),
    }));
  }

  private mapStatus(status: string): JobStatus {
    const s = status.toLowerCase();
    if (s === "discovered" || s === "queued") return "discovered";
    if (s === "running") return "wave1";
    if (s === "completed" || s === "sealed" || s === "uploaded") return "sealed";
    if (s === "failed") return "failed";
    return "discovered";
  }

  private statusToWave(source: any): WaveId | 0 {
    const activeStage = source.stages?.find((st: any) => st.status === "running")?.stage;
    if (!activeStage) return 0;

    if (["download", "panel_extraction", "transcription", "sutta_match", "segmentation", "audio_timestamps"].includes(activeStage)) return 1;
    if (["generation", "keys", "names", "translation", "dubbing"].includes(activeStage)) return 2;
    if (["validation", "seal", "gcs_upload"].includes(activeStage)) return 3;

    return 0;
  }

  private emitSyntheticEvent(job: Job, stage: string) {
    const event: PlantEvent = {
      id: `syn_${Date.now()}_${job.id}_${stage}`,
      ts: Date.now(),
      verb: this.stageToVerb(stage, job.status),
      job_id: job.id,
      sutta_id: job.sutta_id,
      wave: job.current_wave,
    };
    this.eventHandlers.forEach((h) => h(event));
  }

  private stageToVerb(stage: string, status: JobStatus): any {
    if (status === "failed") return "wave3.validate.failed";
    if (status === "sealed") return "seal.uploaded";

    const s = stage.toLowerCase();
    if (s.includes("download")) return "wave1.download.started";
    if (s.includes("extract")) return "wave1.extract.done";
    if (s.includes("transcript")) return "transcript.completed";
    if (s.includes("gen")) return "wave2.gen.done";
    if (s.includes("translate")) return "wave2.translate.done";
    if (s.includes("dub")) return "wave2.dub.done";

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
    try {
      const resp = await fetch(`/api/pipeline/events?limit=${limit}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.events || []).map((e: any) => ({
        id: e.id,
        ts: new Date(e.occurred_at).getTime(),
        verb: e.event_type as any,
        job_id: e.job_id || "none",
        sutta_id: e.sutta_id || "none",
        wave: 0, // Events don't strictly have waves in DB grunt
      }));
    } catch (e) {
      return [];
    }
  }

  async getWaves() {
    if (this.lastSnapshot) return this.lastSnapshot;
    const resp = await fetch("/api/pipeline/status");
    if (!resp.ok) throw new Error("Status fetch fail");
    const data = await resp.json();
    return this.mapToSnapshot(data);
  }

  async getJobs() {
    const resp = await fetch("/api/pipeline/status");
    if (!resp.ok) return [];
    const data = await resp.json();
    return this.mapToJobs(data);
  }

  async getJob(id: string) {
    const resp = await fetch("/api/pipeline/status");
    if (!resp.ok) return null;
    const data = await resp.json();
    const s = (data.sources || []).find((src: any) => src.suttaHint === id || src.sourceId === id);
    if (!s) return null;
    const job = this.mapToJobs({ sources: [s] })[0];
    const artifacts: Artifact[] = (s.artifacts || []).map((a: any) => ({
      id: a.uri,
      job_id: job.id,
      sutta_id: job.sutta_id,
      kind: a.type,
      hash_id: a.uri.split('/').pop() || 'unknown',
      size_bytes: 0,
      created_at: new Date(a.at).getTime(),
      golden: a.type === 'validation',
    }));
    return { job, artifacts, events: [] };
  }

  async getArtifacts(filter?: any) {
    try {
      const resp = await fetch("/api/pipeline/status");
      if (!resp.ok) return [];
      const data = await resp.json();
      const allArts: Artifact[] = [];
      (data.sources || []).forEach((s: any) => {
        (s.artifacts || []).forEach((a: any) => {
          if (filter?.sutta_id && s.suttaHint !== filter.sutta_id) return;
          allArts.push({
            id: a.uri,
            job_id: s.sourceId,
            sutta_id: s.suttaHint,
            kind: a.type,
            hash_id: a.uri.split('/').pop() || 'unknown',
            size_bytes: 0,
            created_at: new Date(a.at).getTime(),
            golden: a.type === 'validation',
          });
        });
      });
      return allArts.filter(a => a.kind === 'validation'); // HDB view mostly wants sealed items grunt
    } catch (e) {
      return [];
    }
  }

  controls = {
    setSpeed: () => {},
    spawnSutta: () => {},
    spawnUrl: async (url: string) => {
      console.log("[HttpPlantClient] Spawning URL:", url);
      const resp = await fetch("/api/pipeline/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sutta_id: url }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error("[HttpPlantClient] Spawn failed:", resp.status, text);
        throw new Error(`Server returned ${resp.status}: ${text}`);
      }
      return resp.json();
    },
    clear: async () => {
      console.log("[HttpPlantClient] Clearing pipeline...");
      const resp = await fetch("/api/pipeline/clear", { method: "POST" });
      if (!resp.ok) throw new Error("Clear failed");
    },
    failNextGen: () => {},
    getSpeed: () => 1,
  };
}
