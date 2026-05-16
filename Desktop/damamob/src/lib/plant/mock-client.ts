import type {
  Artifact,
  Job,
  PlantClient,
  PlantEvent,
  Wave1Slot,
  Wave2State,
  Wave3State,
  WavesSnapshot,
} from "./types";

// Realistic simulator for the Dama tickerplant.
// Emits events that flow through Wave 1 (parallel CPU, 8 grunts),
// Wave 2 (sequential GPU lock), Wave 3 (weaver + seal).

const SUTTA_TITLES = [
  "Mūlapariyāya Sutta",
  "Sabbāsava Sutta",
  "Dhammadāyāda Sutta",
  "Bhayabherava Sutta",
  "Anaṅgaṇa Sutta",
  "Ākaṅkheyya Sutta",
  "Vatthūpama Sutta",
  "Sallekha Sutta",
  "Sammādiṭṭhi Sutta",
  "Satipaṭṭhāna Sutta",
  "Cūḷahatthipadopama Sutta",
  "Mahāhatthipadopama Sutta",
  "Ratha-vinīta Sutta",
  "Nivāpa Sutta",
  "Ariyapariyesanā Sutta",
];

const MODEL_VERSIONS = ["llama3.1:8b@v3", "qwen2.5:7b@v2", "gemma2:9b@v1"];

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${(++idCounter).toString(36).padStart(4, "0")}`;
const hashId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

interface InternalJob extends Job {
  // Wave-1 tracking
  cpuTasksDone: { download: boolean; extract: boolean; segment: boolean };
  // Wave-2 tracking
  gpuStagesDone: { gen: boolean; translate: boolean; dub: boolean };
  // Wave-3 tracking
  weaverDone: { match: boolean; weave: boolean; validate: boolean };
  // Failure intent
  failNextGen?: boolean;
}

export class MockPlantClient implements PlantClient {
  private events: PlantEvent[] = [];
  private jobs = new Map<string, InternalJob>();
  private artifacts: Artifact[] = [];
  private wave1: Wave1Slot[] = Array.from({ length: 8 }, (_, i) => ({ index: i, busy: false }));
  private wave2: Wave2State = { locked: false, vram_loaded: false, queue_depth: 0 };
  private wave3: Wave3State = { pipeline: {}, ready_to_seal: 0 };
  private recentSeals: number[] = []; // ts ms
  private recentErrors: number[] = [];

  private eventBus = new EventTarget();
  private wavesBus = new EventTarget();
  private speed = 1; // multiplier
  private failNextGen = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Simulator is inactive by default.
  }

  controls = {
    setSpeed: (m: number) => {
      this.speed = Math.max(0.25, Math.min(8, m));
      this.restartTimer();
    },
    getSpeed: () => this.speed,
    spawnSutta: () => this.spawnSutta(),
    spawnUrl: (url: string) => this.spawnSutta(false, url),
    failNextGen: () => {
      this.failNextGen = true;
    },
  };

  subscribeEvents(handler: (e: PlantEvent) => void) {
    const fn = (ev: Event) => handler((ev as CustomEvent<PlantEvent>).detail);
    this.eventBus.addEventListener("e", fn);
    return () => this.eventBus.removeEventListener("e", fn);
  }

  subscribeWaves(handler: (w: WavesSnapshot) => void) {
    const fn = () => handler(this.snapshot());
    this.wavesBus.addEventListener("w", fn);
    return () => this.wavesBus.removeEventListener("w", fn);
  }

  async getRecentEvents(limit = 200) {
    return this.events.slice(-limit).reverse();
  }
  async getWaves() {
    return this.snapshot();
  }
  async getJobs() {
    return Array.from(this.jobs.values()).map((j) => this.publicJob(j));
  }
  async getJob(id: string) {
    const j = this.jobs.get(id);
    if (!j) return null;
    return {
      job: this.publicJob(j),
      artifacts: this.artifacts.filter((a) => a.job_id === id),
      events: this.events.filter((e) => e.job_id === id),
    };
  }
  async getArtifacts(filter?: { hash_prefix?: string; model?: string; sutta_id?: string }) {
    return this.artifacts
      .filter((a) => a.kind === "seal")
      .filter((a) => !filter?.hash_prefix || a.hash_id.startsWith(filter.hash_prefix))
      .filter((a) => !filter?.model || a.model_version === filter.model)
      .filter((a) => !filter?.sutta_id || a.sutta_id === filter.sutta_id)
      .sort((a, b) => b.created_at - a.created_at);
  }

  // ---- internals ----

  private snapshot(): WavesSnapshot {
    const cutoff = Date.now() - 60 * 60 * 1000;
    this.recentSeals = this.recentSeals.filter((t) => t > cutoff);
    this.recentErrors = this.recentErrors.filter((t) => t > cutoff);
    return {
      wave1: this.wave1.map((s) => ({ ...s })),
      wave2: { ...this.wave2 },
      wave3: { pipeline: { ...this.wave3.pipeline }, ready_to_seal: this.wave3.ready_to_seal },
      throughput_per_hour: this.recentSeals.length,
      errors_last_hour: this.recentErrors.length,
    };
  }

  private publicJob(j: InternalJob): Job {
    const { cpuTasksDone, gpuStagesDone, weaverDone, failNextGen, ...pub } = j;
    return pub;
  }

  private emit(verb: PlantEvent["verb"], job: InternalJob, payload?: Record<string, unknown>, extra?: Partial<PlantEvent>) {
    const e: PlantEvent = {
      id: nextId("evt"),
      ts: Date.now(),
      verb,
      job_id: job.id,
      sutta_id: job.sutta_id,
      wave: extra?.wave ?? this.waveForVerb(verb),
      payload,
      ...extra,
    };
    this.events.push(e);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
    job.updated_at = e.ts;
    this.eventBus.dispatchEvent(new CustomEvent("e", { detail: e }));
    this.wavesBus.dispatchEvent(new CustomEvent("w"));
  }

  private waveForVerb(v: PlantEvent["verb"]): PlantEvent["wave"] {
    if (v.startsWith("wave1")) return 1;
    if (v.startsWith("wave2")) return 2;
    if (v.startsWith("wave3")) return 3;
    return 0;
  }

  private addArtifact(job: InternalJob, kind: Artifact["kind"], model?: string) {
    const a: Artifact = {
      id: nextId("art"),
      job_id: job.id,
      sutta_id: job.sutta_id,
      kind,
      hash_id: hashId(),
      model_version: model,
      size_bytes: 1024 * (50 + Math.floor(Math.random() * 8000)),
      created_at: Date.now(),
      golden: kind === "seal",
    };
    this.artifacts.push(a);
    return a;
  }

  spawnSutta(seed = false, url?: string) {
    const id = nextId("job");
    const sutta_id = nextId("sut");
    const title = url ? (url.split('/').pop() || pick(SUTTA_TITLES)) : pick(SUTTA_TITLES);
    const job: InternalJob = {
      id,
      sutta_id,
      title,
      source: url ? "youtube" : (Math.random() < 0.7 ? "youtube" : "book"),
      status: "discovered",
      current_wave: 0,
      started_at: Date.now(),
      updated_at: Date.now(),
      cpuTasksDone: { download: false, extract: false, segment: false },
      gpuStagesDone: { gen: false, translate: false, dub: false },
      weaverDone: { match: false, weave: false, validate: false },
      failNextGen: this.failNextGen ? (this.failNextGen = false, true) : false,
    };
    this.jobs.set(id, job);
    this.emit("discovery.published", job, { source: job.source, title: job.title }, { wave: 0 });
    if (seed) {
      // Move some forward a bit to populate the board on first paint
      job.status = "wave1";
      job.current_wave = 1;
    }
  }

  private start() {
    this.restartTimer();
  }

  private restartTimer() {
    if (this.timer) clearInterval(this.timer);
    const interval = Math.max(120, 700 / this.speed);
    this.timer = setInterval(() => this.tick(), interval);
  }

  private tick() {
    // Random spawn disabled to stop auto-filling the dashboard.
    // if (Math.random() < 0.06 * this.speed) this.spawnSutta();

    // Wave 1: parallel — assign idle slots to discovered/in-progress jobs
    for (const job of this.jobs.values()) {
      if (job.status !== "discovered" && job.status !== "wave1") continue;
      job.status = "wave1";
      job.current_wave = 1;

      const tasks: Array<keyof InternalJob["cpuTasksDone"]> = ["download", "extract", "segment"];
      for (const t of tasks) {
        if (job.cpuTasksDone[t]) continue;
        // is there already a slot working on this job+task?
        const already = this.wave1.some((s) => s.busy && s.job_id === job.id && s.task === t);
        if (already) continue;
        // segment must follow download
        if (t === "segment" && !job.cpuTasksDone.download) continue;
        const free = this.wave1.find((s) => !s.busy);
        if (!free) break;
        free.busy = true;
        free.task = t;
        free.job_id = job.id;
        free.sutta_title = job.title;
        free.started_at = Date.now();
        if (t === "download") this.emit("wave1.download.started", job, { thread: free.index });
      }
    }

    // Wave 1 completion: each busy slot has chance to finish
    for (const slot of this.wave1) {
      if (!slot.busy || !slot.job_id || !slot.task) continue;
      const elapsed = Date.now() - (slot.started_at ?? Date.now());
      const minMs = slot.task === "download" ? 1500 : 600;
      if (elapsed < minMs / this.speed) continue;
      if (Math.random() > 0.35 * this.speed) continue;

      const job = this.jobs.get(slot.job_id)!;
      const task = slot.task;
      job.cpuTasksDone[task] = true;
      this.addArtifact(
        job,
        task === "download" ? "video" : task === "extract" ? "panels" : "segments",
      );
      this.emit(
        task === "download" ? "wave1.download.done" : task === "extract" ? "wave1.extract.done" : "wave1.segment.done",
        job,
        { thread: slot.index },
      );
      slot.busy = false;
      slot.task = undefined;
      slot.job_id = undefined;
      slot.sutta_title = undefined;
      slot.started_at = undefined;

      // If all CPU tasks done → ready for Wave 2
      if (job.cpuTasksDone.download && job.cpuTasksDone.extract && job.cpuTasksDone.segment) {
        if (job.status === "wave1") {
          job.status = "wave2";
          job.current_wave = 2;
          this.wave2.queue_depth++;
        }
      }
    }

    // Wave 2: sequential GPU lock
    if (!this.wave2.locked) {
      const next = Array.from(this.jobs.values()).find(
        (j) => j.status === "wave2" && !j.gpuStagesDone.gen,
      );
      if (next) {
        this.wave2.locked = true;
        this.wave2.vram_loaded = true;
        this.wave2.job_id = next.id;
        this.wave2.sutta_title = next.title;
        this.wave2.stage = "gen";
        this.wave2.started_at = Date.now();
        this.wave2.queue_depth = Math.max(0, this.wave2.queue_depth - 1);
        this.emit("wave2.gpu.lock.acquired", next, { stage: "gen" });
      }
    } else if (this.wave2.job_id) {
      const job = this.jobs.get(this.wave2.job_id);
      if (job) {
        const elapsed = Date.now() - (this.wave2.started_at ?? Date.now());
        const minMs = 1400;
        if (elapsed > minMs / this.speed && Math.random() < 0.4 * this.speed) {
          const stage = this.wave2.stage!;
          const model = pick(MODEL_VERSIONS);
          if (stage === "gen") {
            if (job.failNextGen) {
              job.status = "failed";
              this.recentErrors.push(Date.now());
              this.emit("wave3.validate.failed", job, { stage: "gen", reason: "model_refused" });
              this.releaseGpu(job);
            } else {
              job.gpuStagesDone.gen = true;
              this.addArtifact(job, "mcq", model);
              this.emit("wave2.gen.done", job, { model }, { model_version: model });
              this.wave2.stage = "translate";
              this.wave2.started_at = Date.now();
            }
          } else if (stage === "translate") {
            job.gpuStagesDone.translate = true;
            this.addArtifact(job, "translation", model);
            this.emit("wave2.translate.done", job, { model }, { model_version: model });
            this.wave2.stage = "dub";
            this.wave2.started_at = Date.now();
          } else if (stage === "dub") {
            job.gpuStagesDone.dub = true;
            this.addArtifact(job, "dub", model);
            this.emit("wave2.dub.done", job, { model }, { model_version: model });
            // Done with GPU
            this.releaseGpu(job);
            job.status = "wave3";
            job.current_wave = 3;
          }
        }
      }
    }

    // Wave 3
    for (const job of this.jobs.values()) {
      if (job.status !== "wave3") continue;
      if (!job.weaverDone.match) {
        if (!this.wave3.pipeline.match) {
          this.wave3.pipeline.match = job.title;
          setTimeout(() => {
            job.weaverDone.match = true;
            this.addArtifact(job, "weave");
            this.emit("wave3.match.done", job);
            this.wave3.pipeline.match = undefined;
          }, 600 / this.speed);
        }
      } else if (!job.weaverDone.weave) {
        if (!this.wave3.pipeline.weave) {
          this.wave3.pipeline.weave = job.title;
          setTimeout(() => {
            job.weaverDone.weave = true;
            this.emit("wave3.weave.done", job);
            this.wave3.pipeline.weave = undefined;
          }, 700 / this.speed);
        }
      } else if (!job.weaverDone.validate) {
        if (!this.wave3.pipeline.validate) {
          this.wave3.pipeline.validate = job.title;
          setTimeout(() => {
            job.weaverDone.validate = true;
            this.emit("wave3.validate.done", job);
            this.wave3.pipeline.validate = undefined;
            this.wave3.ready_to_seal++;
          }, 500 / this.speed);
        }
      } else {
        // Seal
        if (!this.wave3.pipeline.seal) {
          this.wave3.pipeline.seal = job.title;
          setTimeout(() => {
            const sealArt = this.addArtifact(job, "seal", pick(MODEL_VERSIONS));
            job.status = "sealed";
            job.sealed_at = Date.now();
            job.hash_id = sealArt.hash_id;
            this.recentSeals.push(Date.now());
            this.emit("seal.uploaded", job, { hash_id: sealArt.hash_id }, { hash_id: sealArt.hash_id, model_version: sealArt.model_version });
            this.emit("rebuild.done", job);
            this.wave3.pipeline.seal = undefined;
            this.wave3.ready_to_seal = Math.max(0, this.wave3.ready_to_seal - 1);
          }, 400 / this.speed);
        }
      }
    }

    this.wavesBus.dispatchEvent(new CustomEvent("w"));
  }

  private releaseGpu(job: InternalJob) {
    this.emit("wave2.gpu.lock.released", job);
    this.wave2.locked = false;
    this.wave2.vram_loaded = false;
    this.wave2.job_id = undefined;
    this.wave2.sutta_title = undefined;
    this.wave2.stage = undefined;
    this.wave2.started_at = undefined;
  }
}
