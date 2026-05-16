// Wire types for the Dama tickerplant. The mock simulator and the future
// HTTP/WS client both speak this protocol exactly.

export type WaveId = 1 | 2 | 3;

export type EventVerb =
  | "discovery.published"
  | "wave1.download.started"
  | "wave1.download.done"
  | "wave1.extract.done"
  | "wave1.segment.done"
  | "wave2.gpu.lock.acquired"
  | "wave2.gpu.lock.released"
  | "wave2.gen.done"
  | "wave2.translate.done"
  | "wave2.dub.done"
  | "wave3.match.done"
  | "wave3.weave.done"
  | "wave3.validate.done"
  | "wave3.validate.failed"
  | "seal.uploaded"
  | "rebuild.done";

export interface PlantEvent {
  id: string;
  ts: number; // epoch ms
  verb: EventVerb;
  job_id: string;
  sutta_id: string;
  wave: WaveId | 0;
  payload?: Record<string, unknown>;
  hash_id?: string;
  model_version?: string;
}

export type JobStatus =
  | "discovered"
  | "wave1"
  | "wave2"
  | "wave3"
  | "sealed"
  | "rebuilt"
  | "failed";

export interface Job {
  id: string;
  sutta_id: string;
  title: string;
  source: "youtube" | "book";
  status: JobStatus;
  current_wave: WaveId | 0;
  started_at: number;
  updated_at: number;
  sealed_at?: number;
  hash_id?: string;
}

export interface Artifact {
  id: string;
  job_id: string;
  sutta_id: string;
  kind:
    | "video"
    | "captions"
    | "panels"
    | "segments"
    | "mcq"
    | "translation"
    | "dub"
    | "weave"
    | "seal";
  hash_id: string;
  model_version?: string;
  size_bytes: number;
  created_at: number;
  golden: boolean;
}

export interface Wave1Slot {
  index: number; // 0..7
  busy: boolean;
  task?: "download" | "extract" | "segment";
  job_id?: string;
  sutta_title?: string;
  started_at?: number;
}

export interface Wave2State {
  locked: boolean;
  job_id?: string;
  sutta_title?: string;
  stage?: "gen" | "translate" | "dub";
  vram_loaded: boolean;
  queue_depth: number;
  started_at?: number;
}

export interface Wave3State {
  pipeline: {
    match?: string;     // sutta title
    weave?: string;
    validate?: string;
    seal?: string;
  };
  ready_to_seal: number;
}

export interface WavesSnapshot {
  wave1: Wave1Slot[];
  wave2: Wave2State;
  wave3: Wave3State;
  throughput_per_hour: number;
  errors_last_hour: number;
}

export interface PlantClient {
  /** Subscribe to live events. Returns unsubscribe. */
  subscribeEvents(handler: (e: PlantEvent) => void): () => void;
  /** Subscribe to live waves snapshot updates. */
  subscribeWaves(handler: (w: WavesSnapshot) => void): () => void;
  /** Recent events (newest first). */
  getRecentEvents(limit?: number): Promise<PlantEvent[]>;
  /** Current waves snapshot. */
  getWaves(): Promise<WavesSnapshot>;
  /** All jobs. */
  getJobs(): Promise<Job[]>;
  /** A single job + its artifacts + its events. */
  getJob(id: string): Promise<{ job: Job; artifacts: Artifact[]; events: PlantEvent[] } | null>;
  /** Sealed artifacts (HDB). */
  getArtifacts(filter?: { hash_prefix?: string; model?: string; sutta_id?: string }): Promise<Artifact[]>;
  /** Mock-only controls (no-ops on http client). */
  controls?: {
    setSpeed(multiplier: number): void;
    spawnSutta(): void;
    spawnUrl(url: string): void;
    failNextGen(): void;
    getSpeed(): number;
  };
}
