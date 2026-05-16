/**
 * DAMA PIPELINE 2.0 (MASTER HARNESS & UI)
 * Consolidated from dama5, dama4, and Master Harness (damaHarness.ts).
 *
 * Features:
 * - Standalone Harness Engine (Intent Parsing, Step Execution, Tracing)
 * - Integrated RAG & Data Logic (Local JSON + API Fallback)
 * - Citation Linkification & Markdown Rendering
 * - Multi-pane UI (Chat, Reference, Conversations, Plant Tape/Lanes)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearch, useNavigate, Link } from '@tanstack/react-router';
import {
  Send, Plus, ChevronLeft, ChevronRight, Volume2, Pause, Square,
  RotateCcw, MessageSquare, BookOpen, Info, ExternalLink,
  ShieldCheck, Terminal, Settings, Database, Activity, Moon, Sun, Play,
  Cpu, Cog, Layers3, AlertTriangle, Edit, RefreshCcw, ImageIcon, X, Check, Search, Globe
} from 'lucide-react';

import { usePlantTape, useWaves, useArtifacts } from '@/lib/plant/hooks';
import { getPlantClient } from '@/lib/plant/client';
import type { EventVerb, PlantEvent } from '@/lib/plant/types';
import { GlobalHealthPanel } from '@/components/GlobalHealthPanel';

// --- 1. CONFIGURATION & TYPES ---

export const HARNESS_CONFIG = {
  DEFAULT_STEP_TIMEOUT_MS: 45_000,
  REFLECTION_TOTAL_TIMEOUT_MS: 60_000,
  RETRIES: {
    CRITICAL_AI_CALL: 2,
    DATA_LOAD: 1,
    OPTIONAL_TRACE: 0,
    MIN_DELAY_MS: 500,
  },
  MODELS: {
    PRIMARY: "gpt-4o-mini",
    FALLBACK: "gemini-1.5-flash",
  },
  RETRIEVAL: {
    MAX_CONTEXT_SUTTAS: 6,
    VECTOR_MATCH_THRESHOLD: 0.5,
  }
};

export type HarnessIntentKind = "reflection" | "read_sutta" | "quiz" | "corpus_search" | "admin_pipeline" | "manga_mapping" | "unknown";
export type HarnessErrorCode = "VALIDATION_ERROR" | "GUARDRAIL_VIOLATION" | "TOOL_FAILURE" | "TIMEOUT" | "UNAUTHORIZED";

export class HarnessError extends Error {
  constructor(public code: HarnessErrorCode, message: string, public detail?: string) {
    super(message);
    this.name = "HarnessError";
  }
}

export type HarnessMessage = { role: "user" | "assistant" | "system"; content: string; };
export type HarnessInput = {
  channel: "ui" | "api" | "cli";
  text: string;
  metadata?: Record<string, unknown>;
  isAdmin?: boolean;
  history?: HarnessMessage[];
};

export type HarnessTraceEvent = {
  stepId: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  at: string;
  detail?: string;
  durationMs?: number;
};

export type HarnessRunState = {
  runId: string;
  input: HarnessInput;
  intent: { kind: HarnessIntentKind; entities: any };
  steps: { id: string; tool: string; required: boolean; retryLimit: number }[];
  trace: HarnessTraceEvent[];
  outputs: Record<string, any>;
  startTime: number;
  status: "running" | "succeeded" | "failed";
};

// --- 2. DAMA RAG & UTILS (From damaRag.ts & dama5/ui_linkify.js) ---

export function normalizeSuttaCiteRef(raw: string): string {
  const t0 = String(raw || "").trim().replace(/\s+/g, " ");
  // Match cAN, pAN, or just the Nikaya code
  let m = t0.match(/^(c|p)?(AN|SN|MN|DN|KN)\s*(\d+(?:\.\d+)*)\s*$/i);
  if (m) {
    const prefix = m[1]?.toLowerCase() === 'c' ? 'c' : '';
    const nikaya = m[2].toUpperCase();
    const id = m[3];
    return prefix + nikaya + " " + id;
  }
  return t0;
}

export function partitionIntoParagraphs(raw: string): { start: number; end: number }[] {
  if (raw == null || raw.length === 0) return [{ start: 0, end: 0 }];
  if (/\n\n/.test(raw)) {
    const r = [];
    let start = 0;
    const re = /\n\n+/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      r.push({ start: start, end: m.index });
      start = m.index + m[0].length;
    }
    r.push({ start: start, end: raw.length });
    return r;
  }
  const sents: { start: number; end: number }[] = [];
  const re = /[\s\S]*?[.!?](?:\s+|$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    sents.push({ start: m.index, end: m.index + m[0].length });
  }
  if (sents.length === 0) return [{ start: 0, end: raw.length }];

  const lastEnd = sents[sents.length - 1].end;
  if (lastEnd < raw.length) {
    sents.push({ start: lastEnd, end: raw.length });
  }
  const ranges: { start: number; end: number }[] = [];
  let gStart = sents[0].start;
  let gEnd = sents[0].end;
  let sentCount = 1;
  for (let i = 1; i < sents.length; i++) {
    const next = sents[i];
    const candEnd = next.end;
    const candLen = candEnd - gStart;
    const segStart = raw.slice(next.start, Math.min(next.start + 48, next.end));
    const breakStem = /Monks,\s+I know not|I know not of any other single thing/i.test(segStart);
    if (sentCount >= 4 || candLen > 450 || (sentCount >= 2 && breakStem)) {
      ranges.push({ start: gStart, end: gEnd });
      gStart = next.start;
      gEnd = next.end;
      sentCount = 1;
    } else {
      gEnd = candEnd;
      sentCount++;
    }
  }
  ranges.push({ start: gStart, end: gEnd });
  return ranges;
}

export function findLooseRange(raw: string, needle: string): { start: number; end: number } | null {
  const r = String(raw || "");
  let n0 = String(needle || "").trim();
  if (!r || !n0) return null;
  let idx = r.indexOf(n0);
  if (idx >= 0) return { start: idx, end: idx + n0.length };
  n0 = n0.replace(/^[([]?\s*(?:c|p)?AN\s*\d+(?:\.\d+)*\s*[)\]]?\s*/i, "");
  n0 = n0.replace(/\s*[([]?\s*(?:c|p)?AN\s*\d+(?:\.\d+)*\s*[)\]]?\s*$/i, "");
  n0 = n0.trim();
  if (!n0) return null;
  idx = r.indexOf(n0);
  if (idx >= 0) return { start: idx, end: idx + n0.length };
  const n = n0.replace(/\s+/g, " ").trim();
  const toks = n.split(" ").filter(Boolean).slice(0, 25);
  if (toks.length < 3) return null;
  const escTok = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pat = toks.map(escTok).join("\\s+");
  try {
    const re = new RegExp(pat, "i");
    const m = re.exec(r);
    if (m && m.index != null) return { start: m.index, end: m.index + m[0].length };
  } catch (e) {}
  return null;
}

export function extractDocBodyFromChunkText(kind: "sutta" | "commentary", text: string): string {
  const t = String(text || "");
  const k = kind.toLowerCase();
  if (k === "commentary") {
    const i = t.indexOf("TEACHER COMMENTARY:\n");
    if (i >= 0) return t.slice(i + "TEACHER COMMENTARY:\n".length).trim();
    const j = t.indexOf("TEACHER COMMENTARY:");
    if (j >= 0) return t.slice(j + "TEACHER COMMENTARY:".length).trim();
    return t.trim();
  }
  const i = t.indexOf("SUTTA:\n");
  if (i >= 0) return t.slice(i + "SUTTA:\n".length).trim();
  const j = t.indexOf("SUTTA:");
  if (j >= 0) return t.slice(j + "SUTTA:".length).trim();
  return t.trim();
}

// --- 3. DATA FETCHING (Local JSON / Validated JSON) ---

export function relativeJsonPathForSuttaId(suttaid: string): string | null {
  const t = suttaid.trim();
  if (!t) return null;
  const od = /^(SN|DN|MN|KN)\s+(\d+)\.([\w.-]+)$/i.exec(t);
  if (od) {
    const nk = od[1].toLowerCase() as "sn" | "dn" | "mn" | "kn";
    const bookSeg = od[2];
    const tail = `${od[2]}.${od[3]}`;
    return `${nk}/${nk}${bookSeg}/suttas/${tail}.json`;
  }
  const core = t.replace(/^AN\s+/i, "");
  const head = (core.split(".")[0] ?? "").trim();
  const book = parseInt(head, 10);
  if (!Number.isFinite(book) || book < 1 || book > 11) return null;
  return `an/an${book}/${core}.json`;
}

export async function fetchStandaloneItem(suttaid: string): Promise<any> {
  // 1. Try real API first (Sealed product from disk)
  try {
    const resp = await fetch(`/api/suttas/${encodeURIComponent(suttaid)}`);
    if (resp.ok) return resp.json();
  } catch (e) {}

  // 2. Handle mock IDs from the simulator/harness with "Real" structure
  if (suttaid.startsWith("sut_") || suttaid.startsWith("job_")) {
    return {
      suttaid: suttaid,
      sutta_name_en: "Simulated Sutta Content",
      sutta: `This is a simulated sutta text for ${suttaid}.\n\nIn a production environment with a connected corpus, this would contain the full Pali/English text from the Sutta Pitaka.`,
      commentary: `Teacher commentary placeholder for ${suttaid}.`,
      quiz: {
        suttaId: suttaid,
        quote: "Simulated quote for testing...",
        options: [
          { id: "1", title: "Option A", body: "Correct simulated answer" },
          { id: "2", title: "Option B", body: "Incorrect simulated answer" }
        ],
        goldOptionId: "1",
        teacherSummary: "Mock summary for the simulator."
      },
      valid: true
    };
  }

  const rel = relativeJsonPathForSuttaId(suttaid);
  if (!rel) throw new Error(`Cannot resolve path for: ${suttaid}`);

  const url = `/__dama_corpus__/${encodeURI(rel)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Corpus file not found: ${suttaid}`);
  return resp.json();
}

// --- 4. ENGINE TOOLS ---

export const tools = {
  loadReadSuttas: async (ctx: any) => {
    // Mocking progress for standalone
    return ["AN 1.1", "AN 1.2", "AN 2.1"];
  },

  retrieveCorpus: async (ctx: any) => {
    const question = ctx.input.text;
    const ids = ctx.state.outputs["load-read-suttas"] || [];
    // Basic search simulation
    const loaded = await Promise.all(ids.map((id: string) => fetchStandaloneItem(id).catch(() => null)));
    return loaded.filter(Boolean).map(item => ({
      suttaid: item.suttaid,
      title: item.sutta_name_en || item.title || item.suttaid,
      text: (item.sutta || "").slice(0, 1000)
    }));
  },

  callReflectionModel: async (ctx: any) => {
    const { input, state } = ctx;
    const resp = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: input.text,
        book: "all",
        use_llm: true,
        k: 6,
      }),
    });
    if (!resp.ok) throw new Error("API failed");
    return resp.json();
  },

  loadMangaMapping: async (ctx: any) => {
    const resp = await fetch("/api/images/sutta-panel-mapping");
    if (!resp.ok) throw new Error("Failed to load manga mapping");
    return resp.json();
  },

  fetchPipelineStatus: async (ctx: any) => {
    const resp = await fetch("/api/pipeline/status");
    if (!resp.ok) throw new Error("Failed to fetch pipeline status");
    return resp.json();
  },

  formatOutput: (ctx: any) => {
    const { state, input } = ctx;
    const raw = state.outputs["call-model"];
    return {
      ok: true,
      question: input.text,
      answer: raw?.answer || "",
      chunks: raw?.chunks || [],
      harnessState: {
        runId: state.runId,
        trace: state.trace,
        durationMs: Date.now() - state.startTime,
      },
    };
  }
};

// --- 5. RUN HARNESS ---

export async function runStandaloneHarness(input: HarnessInput): Promise<any> {
  const runId = Math.random().toString(36).substring(7);
  const text = input.text.toLowerCase();

  let kind: HarnessIntentKind = "reflection";
  if (text.includes("manga") || text.includes("mapping")) kind = "manga_mapping";
  else if (text.includes("pipeline") || text.includes("status")) kind = "admin_pipeline";

  const steps = [];
  if (kind === "manga_mapping") {
    steps.push({ id: "load-mapping", tool: "loadMangaMapping", required: true, retryLimit: 1 });
  } else if (kind === "admin_pipeline") {
    steps.push({ id: "fetch-status", tool: "fetchPipelineStatus", required: true, retryLimit: 1 });
  } else {
    steps.push({ id: "load-suttas", tool: "loadReadSuttas", required: true, retryLimit: 1 });
    steps.push({ id: "retrieve", tool: "retrieveCorpus", required: true, retryLimit: 1 });
    steps.push({ id: "call-model", tool: "callReflectionModel", required: true, retryLimit: 2 });
  }
  steps.push({ id: "format", tool: "formatOutput", required: true, retryLimit: 0 });

  const state: HarnessRunState = {
    runId, input, intent: { kind, entities: {} }, steps, trace: [], outputs: {}, startTime: Date.now(), status: "running"
  };

  for (const step of steps) {
    const toolFn = (tools as any)[step.tool];
    state.trace.push({ stepId: step.id, status: "started", at: new Date().toISOString() });
    try {
      const output = await toolFn({ input, state });
      state.outputs[step.id] = output;
      state.trace.push({ stepId: step.id, status: "succeeded", at: new Date().toISOString(), durationMs: Date.now() - state.startTime });
    } catch (e: any) {
      state.trace.push({ stepId: step.id, status: "failed", at: new Date().toISOString(), detail: e.message });
      if (step.required) {
        state.status = "failed";
        return { ok: false, state, error: e.message };
      }
    }
  }

  state.status = "succeeded";
  return { ok: true, state, output: state.outputs["format"] };
}

// --- 6. PLANT TAPE COMPONENTS ---

const VERB_COLOR: Record<string, string> = {
  discovery: "text-muted-foreground",
  wave1: "text-wave-cpu",
  wave2: "text-wave-gpu",
  wave3: "text-wave-weaver",
  seal: "text-primary",
  rebuild: "text-wave-seal",
};

function colorForVerb(v: EventVerb) {
  const head = v.split(".")[0];
  return VERB_COLOR[head] ?? "text-foreground";
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function PlantTapeView({ onReplay, onImageSelector }: { onReplay?: (id: string) => void; onImageSelector?: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [waveFilter, setWaveFilter] = useState<string>("all");
  const [urlInput, setUrlInput] = useState("");
  const [isSpawning, setIsSpawning] = useState(false);

  const events = usePlantTape(paused);
  const [plantControls, setPlantControls] = useState<any>(null);

  useEffect(() => {
    setPlantControls(getPlantClient().controls);
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (waveFilter !== "all" && String(e.wave) !== waveFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        (e.verb || "").includes(q) ||
        (e.sutta_id || "").toLowerCase().includes(q) ||
        (e.job_id || "").toLowerCase().includes(q)
      );
    });
  }, [events, filter, waveFilter]);

  const handleSpawn = async () => {
    if (!urlInput.trim() || isSpawning) return;
    const url = urlInput.trim();
    setIsSpawning(true);
    console.log("[PlantTape] Spawning URL:", url);

    if (!plantControls) {
      alert("Plant controls not ready. Check VITE_PLANT_MODE.");
      setIsSpawning(false);
      return;
    }

    try {
      await plantControls.spawnUrl(url);
      console.log("[PlantTape] Spawn request sent for:", url);
      setUrlInput(""); // Only clear on success grunt
    } catch (e: any) {
      console.error("[PlantTape] Spawn failed:", e);
      alert("Spawn failed: " + e.message);
    } finally {
      setIsSpawning(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Clear all pipeline history and current tape?")) return;
    try {
      await plantControls?.clear();
      // Local state will refresh via hooks or we can force reload
      window.location.reload();
    } catch (e: any) {
      alert("Clear failed: " + e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 overflow-hidden">
      <div className="flex justify-between items-end px-2">
        <div>
          <h1 className="text-3xl font-serif text-slate-800">Live Tape</h1>
          <p className="text-xs text-slate-400 mt-1">Ordered event log from Feed Handlers and Lanes.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-4">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSpawn()}
              placeholder="Paste URL to begin..."
              className="h-8 w-64 rounded-md border border-indigo-200 bg-indigo-50/30 px-3 font-sans text-xs text-indigo-900 placeholder:text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
            <button
              onClick={handleSpawn}
              disabled={isSpawning}
              className="h-8 px-3 bg-indigo-600 text-white rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-500 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSpawning ? (
                <RefreshCcw size={12} className="animate-spin" />
              ) : (
                <Plus size={12} strokeWidth={3} />
              )}
              {isSpawning ? "Wait..." : "Begin"}



            </button>
            <button
              onClick={handleClear}
              className="h-8 px-3 border border-rose-200 text-rose-600 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-rose-50 transition-colors shadow-sm flex items-center gap-1.5"
              title="Clear all history"
            >
              <RotateCcw size={12} />
              Clear
            </button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter verb / sutta / job"
            className="h-8 w-56 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 placeholder:text-slate-400"
          />
          <select
            value={waveFilter}
            onChange={(e) => setWaveFilter(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs"
          >
            <option value="all">all lanes</option>
            <option value="0">discovery</option>
            <option value="1">lane 1</option>
            <option value="2">lane 2</option>
            <option value="3">lane 3</option>
          </select>
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 font-mono text-xs hover:bg-slate-50 transition-colors shadow-sm"
          >
            {paused ? (
              <>
                <Pause size={12} strokeWidth={2} /> resume
              </>
            ) : (
              <>
                <Pause size={12} strokeWidth={2} /> pause
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 border border-slate-200 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="grid grid-cols-[140px_80px_1fr_140px_100px_100px] border-b border-slate-100 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/50">
          <span>Time</span>
          <span>Lane</span>
          <span>Verb</span>
          <span>Sutta</span>
          <span>Job</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {events.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                <Play size={32} fill="currentColor" />
              </div>
              <h3 className="text-xl font-serif text-slate-800 mb-2">Plant Idle</h3>
              <p className="text-sm text-slate-400 max-w-xs mb-8">
                The tickerplant is ready. Paste a URL or sutta ID above to begin the extraction pipeline.
              </p>
              <div className="flex gap-2 w-full max-w-sm">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSpawn()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 h-10 rounded-xl border border-indigo-200 bg-white px-4 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
                />
                <button
                  onClick={handleSpawn}
                  disabled={isSpawning}
                  className="h-10 px-6 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {isSpawning && <RefreshCcw size={16} className="animate-spin" />}
                  {isSpawning ? "Spawning..." : "Begin"}
                </button>
              </div>
            </div>
          )}
          {filtered.map((e, i) => (
            <div
              key={e.id}
              className={`grid grid-cols-[140px_80px_1fr_140px_100px_100px] items-center px-4 py-2 font-mono text-xs hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-[#fcfbf7]' : ''}`}
            >
              <span className="text-slate-300">{fmtTime(e.ts)}</span>
              <span className="text-slate-400 font-bold">{e.wave === 0 ? "—" : `L${e.wave}`}</span>
              <span className={`font-semibold ${colorForVerb(e.verb)}`}>{e.verb}</span>
              <span className="text-slate-600 truncate">{e.sutta_id}</span>
              <span className="text-slate-400 truncate">{e.job_id}</span>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => onReplay?.(e.sutta_id)}
                  title="Replay Pipeline"
                  className="p-1 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                >
                  <RefreshCcw size={12} />
                </button>
                <button
                  onClick={() => onImageSelector?.(e.sutta_id)}
                  title="Image Selector"
                  className="p-1 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                >
                  <ImageIcon size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- 7. WAVES VIEW ---

function elapsed(ts?: number) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function PlantLanesView() {
  const w = useWaves();
  if (!w) return <div className="p-8 font-mono text-sm text-slate-300">loading…</div>;

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 overflow-hidden">
      <div className="flex justify-between items-end px-2">
        <div>
          <h1 className="text-3xl font-serif text-slate-800">Processing Lanes</h1>
          <p className="text-xs text-slate-400 mt-1">Real-time status of hardware resource tracks.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="throughput / hr" value={w.throughput_per_hour} icon={Activity} />
        <Stat
          label="GPU"
          value={w.wave2.locked ? "busy" : "idle"}
          icon={Cog}
          tone={w.wave2.locked ? "gpu" : undefined}
        />
        <Stat label="ready to seal" value={w.wave3.ready_to_seal} icon={Layers3} />
        <Stat
          label="errors / hr"
          value={w.errors_last_hour}
          icon={AlertTriangle}
          tone={w.errors_last_hour > 0 ? "err" : undefined}
        />
      </div>

      <div className="flex-1 grid grid-cols-1 gap-6 overflow-hidden lg:grid-cols-3">
        {/* Lane 1 */}
        <div className="border border-slate-200 bg-white rounded-xl shadow-sm p-4 flex flex-col">
          <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-serif text-lg text-slate-800">Lane 1</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Parallel CPU · Extraction</p>
            </div>
            <Cpu className="h-5 w-5 text-wave-cpu" strokeWidth={1.5} />
          </header>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              {w.wave1.map((s) => (
                <div
                  key={s.index}
                  className={`rounded-lg border p-2 transition-colors ${
                    s.busy
                      ? "border-wave-cpu/40 bg-wave-cpu/5"
                      : "border-dashed border-slate-100 bg-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-slate-400">
                    <span>#{s.index}</span>
                    {s.busy && <span className="text-wave-cpu font-bold">{s.task}</span>}
                  </div>
                  <div className="mt-1 truncate font-serif text-xs text-slate-700 font-medium">
                    {s.busy ? s.sutta_title : <span className="text-slate-300">idle</span>}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-slate-400">
                    {s.busy ? elapsed(s.started_at) : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lane 2 */}
        <div className="border border-slate-200 bg-white rounded-xl shadow-sm p-4 flex flex-col">
          <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-serif text-lg text-slate-800">Lane 2</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Sequential GPU · AI Generation</p>
            </div>
            <Cog
              className={`h-5 w-5 ${w.wave2.locked ? "text-wave-gpu" : "text-slate-300"}`}
              strokeWidth={1.5}
            />
          </header>

          <div
            className={`rounded-xl border p-4 ${
              w.wave2.locked ? "border-wave-gpu/40 bg-wave-gpu/5 shadow-inner" : "border-dashed border-slate-100"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
              <span className="text-slate-400">gpu lock</span>
              <span className={w.wave2.vram_loaded ? "text-wave-gpu font-bold" : "text-slate-300"}>
                vram {w.wave2.vram_loaded ? "loaded" : "cold"}
              </span>
            </div>
            <div className="mt-3 font-serif text-xl text-slate-800">
              {w.wave2.sutta_title ?? <span className="text-slate-300 font-normal italic">no holder</span>}
            </div>
            <div className="mt-4 flex items-center gap-2">
              {(["gen", "translate", "dub"] as const).map((stage) => {
                const active = w.wave2.stage === stage;
                return (
                  <span
                    key={stage}
                    className={`flex-1 rounded border px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      active
                        ? "border-wave-gpu bg-wave-gpu/10 text-wave-gpu font-bold"
                        : "border-slate-100 text-slate-300 bg-slate-50/50"
                    }`}
                  >
                    {stage}
                  </span>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 font-mono text-[10px] text-slate-400 flex justify-between">
              <span>elapsed {elapsed(w.wave2.started_at)}</span>
              <span>queue depth {w.wave2.queue_depth}</span>
            </div>
          </div>
        </div>

        {/* Lane 3 */}
        <div className="border border-slate-200 bg-white rounded-xl shadow-sm p-4 flex flex-col">
          <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-serif text-lg text-slate-800">Lane 3</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Assembly · Seal/Validate</p>
            </div>
            <Layers3 className="h-5 w-5 text-wave-weaver" strokeWidth={1.5} />
          </header>

          <div className="space-y-3">
            {(["match", "weave", "validate", "seal"] as const).map((stage) => {
              const sutta = (w.wave3.pipeline as any)[stage];
              const active = !!sutta;
              return (
                <div
                  key={stage}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    active
                      ? "border-wave-weaver/40 bg-wave-weaver/5"
                      : "border-dashed border-slate-100"
                  }`}
                >
                  <span className="w-20 font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    {stage}
                  </span>
                  <span className="flex-1 truncate font-serif text-sm text-slate-700 font-medium">
                    {sutta ?? <span className="text-slate-200">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-auto pt-4 font-mono text-[10px] text-slate-400 flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-wave-weaver animate-pulse" />
            ready to seal · {w.wave3.ready_to_seal} items
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: any;
  tone?: "gpu" | "err";
}) {
  const color =
    tone === "gpu"
      ? "text-wave-gpu"
      : tone === "err"
        ? "text-status-err"
        : "text-slate-800";
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold">
        <span>{label}</span>
        <Icon className={`h-4 w-4 ${tone ? color : 'text-slate-300'}`} strokeWidth={1.5} />
      </div>
      <div className={`mt-2 font-serif text-3xl ${color}`}>{value}</div>
    </div>
  );
}

// --- 7.5 HDB VIEW ---

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function PlantHdbView({
  onRef,
  onReplay,
  onEdit,
  onImageSelector,
}: {
  onRef: (id: string, kind: 'sutta' | 'commentary') => void;
  onReplay: (id: string) => void;
  onEdit: (id: string) => void;
  onImageSelector: (id: string) => void;
}) {
  const [hashPrefix, setHashPrefix] = useState("");
  const [model, setModel] = useState("");
  const arts = useArtifacts({
    hash_prefix: hashPrefix || undefined,
    model: model || undefined,
  });

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 overflow-hidden">
      <div className="flex justify-between items-end px-2">
        <div>
          <h1 className="text-3xl font-serif text-slate-800">GCS HDB</h1>
          <p className="text-xs text-slate-400 mt-1">
            Sealed artifacts indexed by Hash-ID (content hash + model version).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={hashPrefix}
            onChange={(e) => setHashPrefix(e.target.value)}
            placeholder="hash prefix"
            className="h-8 w-40 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 placeholder:text-slate-400"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model version"
            className="h-8 w-44 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 border border-slate-200 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_100px_80px_160px] border-b border-slate-100 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/50">
          <span>hash-id</span>
          <span>sutta</span>
          <span>model</span>
          <span>sealed</span>
          <span className="text-right">size</span>
          <span className="text-center">actions</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {arts.length === 0 && (
            <div className="px-3 py-12 text-center font-mono text-xs text-slate-300">
              no sealed artifacts yet — let the plant cook a lane through.
            </div>
          )}
          {arts.map((a, i) => (
            <div
              key={a.id}
              className={`grid grid-cols-[1fr_1fr_1fr_100px_80px_160px] items-center px-4 py-2 font-mono text-xs hover:bg-indigo-50/50 transition-colors border-b border-slate-50 last:border-0 text-left w-full ${
                i % 2 === 1 ? "bg-[#fcfbf7]" : ""
              }`}
            >
              <button onClick={() => onRef(a.sutta_id, 'sutta')} className="truncate text-indigo-600 font-bold hover:underline">
                {a.hash_id}
              </button>
              <span className="truncate text-slate-600">{a.sutta_id}</span>
              <span className="truncate text-slate-400">{a.model_version ?? "—"}</span>
              <span className="text-slate-400">{fmtAgo(a.created_at)}</span>
              <span className="text-right text-slate-400">{fmtSize(a.size_bytes)}</span>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => onEdit(a.sutta_id)}
                  title="Edit JSON"
                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => onReplay(a.sutta_id)}
                  title="Replay Pipeline"
                  className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                >
                  <RefreshCcw size={14} />
                </button>
                <button
                  onClick={() => onImageSelector(a.sutta_id)}
                  title="Image Selector"
                  className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                >
                  <ImageIcon size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ text, onRef }: { text: string; onRef: (ref: string, kind: 'sutta' | 'commentary') => void }) {
  if (!text) return null;
  // Match AN 1.1, SN 2.2, etc. (including optional c/p prefix)
  const parts = text.split(/((?:c|p)?(?:AN|SN|MN|DN|KN)\s+\d+(?:\.\d+)*)/i);
  return (
    <>
      {parts.map((part, i) => {
        const isRef = /^(?:c|p)?(?:AN|SN|MN|DN|KN)\s+\d+(?:\.\d+)*$/i.test(part);
        if (isRef) {
          return (
            <button
              key={i}
              onClick={() => onRef(part, part.toLowerCase().startsWith('c') ? 'commentary' : 'sutta')}
              className="text-indigo-600 font-bold hover:underline underline-offset-2"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// --- 8. STANDALONE UI COMPONENT ---

export function DamaStandaloneRunner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as any;
  const initialView = searchParams.view;

  const [view, setView] = useState<"chat" | "tape" | "lanes" | "hdb" | "monitoring">(
    initialView === 'tape' ? 'tape' : initialView === 'lanes' ? 'lanes' : initialView === 'hdb' ? 'hdb' : initialView === 'monitoring' ? 'monitoring' : 'chat'
  );

  useEffect(() => {
    if (initialView && initialView !== view) {
      setView(initialView);
    }
  }, [initialView]);

  const handleSetView = (v: typeof view) => {
    setView(v);
    navigate({ search: (prev: any) => ({ ...prev, view: v }) });
  };

  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [spawnUrl, setSpawnUrl] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [activeRef, setActiveRef] = useState<any>(null);
  const [trace, setTrace] = useState<HarnessTraceEvent[]>([]);

  const [editingSutta, setEditingSutta] = useState<{ id: string; draft: string } | null>(null);
  const [imageSelectorSuttaId, setImageSelectorSuttaId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [plantControls, setPlantControls] = useState<any>(null);
  const [simSpeed, setSimSpeed] = useState(1);

  useEffect(() => {
    if (!mounted) return;
    const pc = getPlantClient().controls;
    setPlantControls(pc);
    if (pc) setSimSpeed(pc.getSpeed());
  }, [mounted]);

  const handleReplay = async (suttaId: string) => {
    if (!window.confirm(`Reset and replay pipeline for ${suttaId}?`)) return;
    try {
      // If we have real plant controls (HTTP mode), use them
      if (plantControls?.spawnUrl) {
        await plantControls.spawnUrl(suttaId);
        setMessages(prev => [...prev, { role: "system", text: `Triggered replay for ${suttaId}` }]);
      } else {
        // Mock mode doesn't really have replay, but we can simulate a message
        setMessages(prev => [...prev, { role: "system", text: `Replay requested for ${suttaId} (Simulation only)` }]);
      }
    } catch (e: any) {
      alert("Replay failed: " + e.message);
    }
  };

  const handleEdit = async (suttaId: string) => {
    try {
      setEditingSutta({ id: suttaId, draft: "Loading..." });
      const item = await fetchStandaloneItem(suttaId);
      setEditingSutta({ id: suttaId, draft: JSON.stringify(item, null, 2) });
    } catch (e: any) {
      alert("Load failed: " + e.message);
      setEditingSutta(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSutta) return;
    setIsSaving(true);
    try {
      const data = JSON.parse(editingSutta.draft);
      const resp = await fetch(`/api/suttas/${encodeURIComponent(editingSutta.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error("Save failed on server");
      alert("Sutta updated successfully.");
      setEditingSutta(null);
    } catch (e: any) {
      alert("Save failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isBusy) return;
    const text = inputText;
    setInputText("");
    setIsBusy(true);

    setMessages(prev => [...prev, { role: "user", text }]);

    try {
      const result = await runStandaloneHarness({ channel: "ui", text });
      if (result.ok) {
        let answer = result.output.answer;
        if (result.state.intent.kind === "manga_mapping") {
           const mapping = result.state.outputs["load-mapping"];
           const keys = Object.keys(mapping);
           answer = `Found ${keys.length} manga-sutta mappings. Top 5:\n` +
             keys.slice(0, 5).map(k => `- ${k}: ${mapping[k].possible_sutta_names.join(", ")}`).join("\n");
        } else if (result.state.intent.kind === "admin_pipeline") {
           const status = result.state.outputs["fetch-status"];
           const sources = status.sources || [];
           answer = `Pipeline Status: ${sources.length} sources tracked.\n` +
             sources.slice(0, 5).map((s: any) => `- ${s.sutta_id || s.suttaHint}: ${s.status}`).join("\n");
        }

        setMessages(prev => [...prev, {
          role: "assistant",
          text: answer || "No answer generated.",
          chunks: result.output.chunks,
          durationMs: result.output.harnessState.durationMs
        }]);
        setTrace(result.state.trace);
      } else {
        setMessages(prev => [...prev, { role: "assistant", text: "Error: " + result.error, isError: true }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", text: "System Failure: " + e.message, isError: true }]);
    } finally {
      setIsBusy(false);
    }
  };

  const openRef = async (ref: string, kind: "sutta" | "commentary") => {
    try {
      const item = await fetchStandaloneItem(normalizeSuttaCiteRef(ref).replace(/^(c|p)/, ""));
      setActiveRef({ item, kind });
    } catch (e) {
      console.error("Ref load failed", e);
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f1e8] text-slate-400 font-mono text-xs">
        Initializing Harness...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f5f1e8] text-slate-900 font-sans">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-[#fcfbf7] flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 text-slate-400 text-sm hover:text-slate-600 transition-colors">
            <ChevronLeft size={18} />
            <div className="flex items-center gap-2">
              <span className="font-medium">DAMA</span>
              <span className="opacity-30">/</span>
            </div>
          </Link>
          <span className="text-slate-800 font-bold text-sm">{view === 'chat' ? 'Harness' : 'Plant'}</span>

          <nav className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => handleSetView("chat")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${view === 'chat' ? 'bg-[#e8e2d4] text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Harness
            </button>
            <button
              onClick={() => handleSetView("tape")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${view === 'tape' ? 'bg-[#e8e2d4] text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Tape
            </button>
            <button
              onClick={() => handleSetView("lanes")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${view === 'lanes' ? 'bg-[#e8e2d4] text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Lanes
            </button>
            <button
              onClick={() => handleSetView("hdb")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${view === 'hdb' ? 'bg-[#e8e2d4] text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              HDB
            </button>
            <button
              onClick={() => handleSetView("monitoring")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${view === 'monitoring' ? 'bg-[#e8e2d4] text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Monitoring
            </button>
          </nav>
        </div>

      </header>

      <main className="flex-1 flex overflow-hidden p-3 gap-3">
        {view === 'tape' ? (
          <PlantTapeView onReplay={handleReplay} onImageSelector={setImageSelectorSuttaId} />
        ) : view === 'lanes' ? (
          <PlantLanesView />
        ) : view === 'monitoring' ? (
          <div className="flex-1 overflow-y-auto p-4"><GlobalHealthPanel /></div>
        ) : view === 'hdb' ? (
          <PlantHdbView onRef={openRef} onReplay={handleReplay} onEdit={handleEdit} onImageSelector={setImageSelectorSuttaId} />
        ) : (
          <>
            {/* Left: Engine Trace */}
            <aside className="w-64 flex flex-col gap-3">
               <div className="flex-1 border border-slate-200 bg-white rounded-xl flex flex-col overflow-hidden shadow-sm">
                 <div className="p-2 border-b border-slate-100 flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                   <Terminal size={12} /> Execution Trace
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-2">
                   {trace.length === 0 && <div className="text-slate-300">Idle... awaiting input</div>}
                   {trace.map((t, i) => (
                     <div key={i} className={`p-1.5 rounded border ${t.status === 'succeeded' ? 'border-emerald-100 bg-emerald-50/50 text-emerald-600' : 'border-slate-50 bg-slate-50/30 text-slate-400'}`}>
                       <div className="flex justify-between">
                         <span className="font-bold">{t.stepId}</span>
                         <span>{t.durationMs}ms</span>
                       </div>
                       <div className="opacity-60 text-[9px]">{t.status} @ {new Date(t.at).toLocaleTimeString()}</div>
                     </div>
                   ))}
                 </div>
               </div>
            </aside>

            {/* Center: Chat */}
            <section className="flex-1 flex flex-col gap-3 min-w-[400px]">
              <div className="flex-1 border border-slate-200 bg-white rounded-2xl flex flex-col overflow-hidden shadow-sm">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl border ${m.role === 'user' ? 'bg-indigo-50 border-indigo-100 text-indigo-900' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">
                          <MessageContent text={m.text} onRef={openRef} />
                        </div>
                        {m.durationMs && <div className="mt-2 text-[9px] text-slate-400">{m.durationMs}ms latency</div>}
                      </div>
                    </div>
                  ))}
                  {isBusy && <div className="text-xs text-slate-400 animate-pulse">Harness running steps...</div>}
                </div>

                <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                      placeholder="Query the Dhamma Harness..."
                      className="flex-1 bg-white border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500/30 resize-none shadow-sm"
                      rows={1}
                    />
                    <button
                      onClick={handleSend}
                      disabled={isBusy}
                      className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Right: Reference */}
            <section className="w-[450px] flex flex-col gap-3">
              <div className="flex-1 border border-slate-200 bg-white rounded-2xl flex flex-col overflow-hidden shadow-sm">
                <div className="p-3 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grounding Reference</span>
                  {activeRef && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{activeRef.item.suttaid}</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {!activeRef ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-300 gap-3">
                      <BookOpen size={48} strokeWidth={1} />
                      <div className="text-xs">No active reference.<br/>Click a citation in the chat to ground.</div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       <div>
                         <div className="text-[10px] font-black text-slate-400 mb-2 tracking-tighter uppercase">SUTTA CANON</div>
                         <div className="text-sm text-slate-800 leading-relaxed font-serif">
                           {activeRef.item.sutta}
                         </div>
                       </div>
                       <div className="h-px bg-slate-100" />
                       <div>
                         <div className="text-[10px] font-black text-slate-400 mb-2 tracking-tighter uppercase">TEACHER COMMENTARY</div>
                         <div className="text-sm text-slate-600 leading-relaxed italic">
                           {activeRef.item.commentary || activeRef.item.commentry || "No commentary available."}
                         </div>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer / Status */}
      <footer className="h-8 border-t border-white/5 bg-black/20 flex items-center px-4 justify-between text-[10px] text-slate-500">
        <div className="flex gap-4">
          <span>OLLAMA: READY</span>
          <span>VALDIATED JSON: CONNECTED</span>
        </div>
        <div>V1.5.0-MASTER</div>
      </footer>

      {/* JSON Editor Modal */}
      {editingSutta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <Edit size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Edit Sutta JSON</h3>
                  <p className="text-[10px] text-slate-400 font-mono">{editingSutta.id}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingSutta(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </header>
            <main className="flex-1 p-4 bg-slate-900">
              <textarea
                value={editingSutta.draft}
                onChange={(e) => setEditingSutta({ ...editingSutta, draft: e.target.value })}
                spellCheck={false}
                className="w-full h-full bg-transparent text-emerald-400 font-mono text-xs outline-none resize-none leading-relaxed"
              />
            </main>
            <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                onClick={() => setEditingSutta(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCcw size={14} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Save Changes
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Image Selector Modal */}
      {imageSelectorSuttaId && (
        <ImageSelectorModal
          suttaId={imageSelectorSuttaId}
          onClose={() => setImageSelectorSuttaId(null)}
        />
      )}
    </div>
  );
}

function ImageSelectorModal({ suttaId, onClose }: { suttaId: string; onClose: () => void }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [candRes, mapRes] = await Promise.all([
          fetch("/api/images/candidates?t=" + Date.now()),
          fetch("/api/images/sutta-panel-mapping")
        ]);

        if (!candRes.ok) throw new Error("Failed to fetch candidates");
        const candData = await candRes.json();
        const allCandidates = candData.candidates || [];
        const panelMappings = mapRes.ok ? await mapRes.json() : {};

        const sidUpper = suttaId.toUpperCase().trim();
        const filtered = allCandidates.filter((c: any) => {
          const mapping = panelMappings[c.panel_id];
          const inMapping = mapping && (
            mapping.mapping?.toUpperCase().includes(sidUpper) ||
            mapping.possible_sutta_names?.some((name: string) => name.toUpperCase().includes(sidUpper))
          );
          if (inMapping) return true;
          return c.tags.proposals?.some((p: any) => p.sutta_id?.toUpperCase() === sidUpper);
        });

        filtered.sort((a: any, b: any) => {
          const aScore = a.tags.proposals?.find((p: any) => p.sutta_id?.toUpperCase() === sidUpper)?.score || 0;
          const bScore = b.tags.proposals?.find((p: any) => p.sutta_id?.toUpperCase() === sidUpper)?.score || 0;
          return parseFloat(bScore) - parseFloat(aScore);
        });

        setCandidates(filtered.slice(0, 10));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [suttaId]);

  const handleSelect = async (panel: any) => {
    setSaving(panel.panel_id);
    try {
      const proposal = panel.tags.proposals?.find((p: any) => p.sutta_id?.toUpperCase() === suttaId.toUpperCase());
      const res = await fetch("/api/images/selection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sutta_id: suttaId,
          panel_id: panel.panel_id,
          image_url: panel.imageUrl,
          selection_reason: proposal?.reason || panel.tags.caption || "Manual selection",
          selection_word: proposal?.canonical_word || "",
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      alert("Selection approved!");
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <ImageIcon size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Image Selector</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{suttaId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-400" />
          </button>
        </header>

        <main className="flex-1 overflow-x-auto p-8 bg-slate-50/30">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
              <RefreshCcw size={32} className="animate-spin" />
              <span className="font-mono text-xs uppercase tracking-widest">Scanning Panels...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex items-center justify-center text-rose-500 font-bold">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-4">
               <Search size={48} strokeWidth={1} />
               <div className="text-sm">No specific panel matches found for this sutta.</div>
            </div>
          ) : (
            <div className="flex gap-6 pb-4">
              {candidates.map((c) => {
                const proposal = c.tags.proposals?.find((p: any) => p.sutta_id?.toUpperCase() === suttaId.toUpperCase());
                return (
                  <div key={c.panel_id} className="min-w-[320px] max-w-[320px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
                    <div className="aspect-[4/3] bg-slate-100 relative group">
                      <img src={c.imageUrl} className="w-full h-full object-cover" />
                      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-2 py-1 rounded-lg">
                         SCORE {proposal?.score || 'N/A'}
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <div className="text-xs font-black text-slate-400 uppercase tracking-tighter truncate">{c.panel_id}</div>
                      <div className="text-sm text-slate-600 line-clamp-3 italic leading-relaxed">
                        {proposal?.reason || c.tags.caption || c.tags.modern || "No description available."}
                      </div>
                      <div className="mt-auto pt-4 border-t border-slate-50">
                        <button
                          onClick={() => handleSelect(c)}
                          disabled={!!saving}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          {saving === c.panel_id ? <RefreshCcw size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
        <footer className="px-8 py-4 bg-slate-50/80 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
           Top 10 AI-Ranked Panel Candidates for Grounding
        </footer>
      </div>
    </div>
  );
}

export default DamaStandaloneRunner;
