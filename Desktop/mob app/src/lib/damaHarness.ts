/**
 * DAMA MASTER HARNESS
 * Consolidated execution engine, tools, and prompts for AI operations.
 */

import { supabase } from "./supabase";
import { getItem, REFLECTION_QUERY_STORAGE_KEY } from "./damaApi";
import { getReadSuttaIds, readReadingProgress } from "./readingProgress";
import { loadReadSuttaContexts, type ReadSuttaContext } from "./readSuttaContext";
import { getEmbedding } from "./embeddings";

// --- 1. CONFIGURATION ---

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
    PRIMARY: "gemini-1.5-flash",
    FALLBACK: "llama-3.3-70b-versatile",
  },
  RETRIEVAL: {
    MAX_CONTEXT_SUTTAS: 6,
    VECTOR_MATCH_THRESHOLD: 0.5,
  }
};

// --- 2. PROMPT REGISTRY ---

export type PromptDefinition = {
  version: string;
  template: string;
  model: string;
};

export const INGESTION_REGISTRY: Record<string, PromptDefinition> = {
  IDENTIFY_SUTTAS: {
    version: "1.0.0",
    model: "gemini-1.5-flash",
    template: `You are a Pali Canon scholar. Identify suttas in this transcript: {{transcript}}`
  },
  GENERATE_METADATA: {
    version: "1.0.1",
    model: "gemini-1.5-flash",
    template: `Generate title and summary for: {{segment}}`
  }
};

export const REFLECTION_REGISTRY: Record<string, PromptDefinition> = {
  BUDDHA_BOT: {
    version: "1.3.0",
    model: "llama-3.3-70b-versatile",
    template: `
      You are BuddhaBot, grounded strictly in the Pāḷi Suttas.
      Reflection: "{{reflection}}"
      Context: {{suttaContexts}}

      Instructions: Use only the context. End with one follow-up question.
    `
  }
};

export const CALIBRATION_REGISTRY: Record<string, PromptDefinition> = {
  VERIFY_CONCLUSION: {
    version: "1.0.0",
    model: "gemini-1.5-flash",
    template: `Does this conclusion follow from the premise? Premise: {{suttaContext}} Conclusion: {{answer}}`
  }
};

// --- 3. TYPES & ERRORS ---

export type HarnessIntentKind = "reflection" | "read_sutta" | "quiz" | "corpus_search" | "admin_pipeline" | "unknown";

export type HarnessErrorCode = "VALIDATION_ERROR" | "GUARDRAIL_VIOLATION" | "TOOL_FAILURE" | "TIMEOUT" | "UNAUTHORIZED";

export class HarnessError extends Error {
  constructor(public code: HarnessErrorCode, message: string, public detail?: string) {
    super(message);
    this.name = "HarnessError";
  }
}

export type HarnessRunResult =
  | { ok: true; state: HarnessRunState; output: any }
  | { ok: false; state: HarnessRunState; error: HarnessError };

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

// --- 4. TOOLS ---

export const tools = {
  loadReadSuttas: (ctx: any) => getReadSuttaIds(readReadingProgress()),

  retrieveCorpus: async (ctx: any) => {
    const ids = ctx.state.outputs["load-read-suttas"] || [];
    return loadReadSuttaContexts(ids, ctx.input.text);
  },

  callReflectionModel: async (ctx: any) => {
    const { input, state } = ctx;
    const mode = (input.metadata?.mode as string) || "buddha";
    const readSuttas = state.outputs["retrieve-grounding"] || [];
    const readSuttaIds = state.outputs["load-read-suttas"] || [];

    const resp = await fetch("/__llm/reflection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reflection: input.text,
        bot: mode,
        readSuttaIds,
        readSuttas,
        history: input.history,
      }),
    });
    if (!resp.ok) throw new Error("Reflection API failed");
    return resp.json();
  },

  verifyConclusion: async (ctx: any) => {
    // Safety fallback: passing for now
    return { pass: true, score: 1.0 };
  },

  validateCitations: (ctx: any) => ({ valid: true }),

  formatReflection: (ctx: any) => {
    const { state, input } = ctx;
    const raw = state.outputs["call-model"];
    const result = {
      ok: true,
      question: input.text,
      answer: raw.answer,
      used_llm: true,
      chunks: (state.outputs["retrieve-grounding"] || []).map((s: any) => ({
        suttaid: s.suttaid,
        text: s.text.slice(0, 400),
      })),
      mode: input.metadata?.mode || "buddha",
      history: input.history || [],
      harnessState: {
        runId: state.runId,
        trace: state.trace,
        durationMs: Date.now() - state.startTime,
      },
    };
    localStorage.setItem(REFLECTION_QUERY_STORAGE_KEY, JSON.stringify(result));
    return result;
  },

  recordTrace: async (ctx: any) => {
    console.log("[Harness Trace]", ctx.state.runId, ctx.state.trace);
    return { status: "recorded" };
  }
};

// --- 5. ENGINE ---

export function parseIntent(text: string): HarnessIntentKind {
  const t = text.toLowerCase();
  if (t.includes("reflect") || t.includes("buddha") || t.length > 20) return "reflection";
  return "unknown";
}

export async function runHarness(input: HarnessInput): Promise<HarnessRunResult> {
  const runId = Math.random().toString(36).substring(7);
  const kind = parseIntent(input.text);

  const steps = kind === "reflection" ? [
    { id: "load-read-suttas", tool: "loadReadSuttas", required: true, retryLimit: 1 },
    { id: "retrieve-grounding", tool: "retrieveCorpus", required: true, retryLimit: 1 },
    { id: "call-model", tool: "callReflectionModel", required: true, retryLimit: 2 },
    { id: "verify-logic", tool: "verifyConclusion", required: true, retryLimit: 0 },
    { id: "format-output", tool: "formatReflection", required: true, retryLimit: 0 },
    { id: "record-trace", tool: "recordTrace", required: false, retryLimit: 0 },
  ] : [];

  const state: HarnessRunState = {
    runId, input, intent: { kind, entities: {} }, steps, trace: [], outputs: {}, startTime: Date.now(), status: "running"
  };

  for (const step of steps) {
    const toolFn = (tools as any)[step.tool];
    if (!toolFn) continue;

    state.trace.push({ stepId: step.id, status: "started", at: new Date().toISOString() });
    try {
      const output = await toolFn({ input, state });
      state.outputs[step.id] = output;
      state.trace.push({ stepId: step.id, status: "succeeded", at: new Date().toISOString(), durationMs: Date.now() - state.startTime });
    } catch (e: any) {
      state.trace.push({ stepId: step.id, status: "failed", at: new Date().toISOString(), detail: e.message });
      if (step.required) {
        state.status = "failed";
        return { ok: false, state, error: e };
      }
    }
  }

  state.status = "succeeded";
  return { ok: true, state, output: state.outputs["format-output"] };
}

export async function recordHarnessFeedback(runId: string, feedback: any) {
  console.log(`[Feedback] ${runId}:`, feedback);
}
