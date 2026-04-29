export type HarnessIntentKind =
  | "reflection"
  | "read_sutta"
  | "quiz"
  | "profile_sync"
  | "corpus_search"
  | "admin_pipeline"
  | "unknown";

export type HarnessToolName =
  | "loadReadSuttas"
  | "retrieveCorpus"
  | "callReflectionModel"
  | "formatReflection"
  | "syncProgress"
  | "runPipelineCheck";

export type HarnessInput = {
  channel: "ui" | "api" | "cli" | "scheduled";
  text: string;
  userId?: string;
  readSuttaIds?: string[];
  metadata?: Record<string, unknown>;
};

export type HarnessIntent = {
  kind: HarnessIntentKind;
  confidence: number;
  entities: {
    suttaIds: string[];
    wantsSync: boolean;
  };
};

export type HarnessStep = {
  id: string;
  tool: HarnessToolName;
  required: boolean;
  retryLimit: number;
};

export type HarnessTraceEvent = {
  stepId: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  at: string;
  detail?: string;
};

export type HarnessRunState = {
  input: HarnessInput;
  intent: HarnessIntent;
  steps: HarnessStep[];
  trace: HarnessTraceEvent[];
  outputs: Record<string, unknown>;
};

export type HarnessToolContext = {
  input: HarnessInput;
  intent: HarnessIntent;
  state: HarnessRunState;
};

export type HarnessTool = (ctx: HarnessToolContext) => Promise<unknown> | unknown;

export type HarnessRunResult =
  | { ok: true; state: HarnessRunState; output: unknown }
  | { ok: false; state: HarnessRunState; error: string };

export type HarnessComponentStatus = {
  step: number;
  component: string;
  category: string;
  inferredForDama: string;
  v1Implementation: string;
};

const SUTTA_ID_PATTERN = /\b(?:AN|SN|DN|MN|KN)?\s*\d+(?:\.\d+){1,3}\b/gi;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function extractSuttaIds(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(SUTTA_ID_PATTERN)) {
    const normalized = match[0].trim().replace(/\s+/g, " ").toUpperCase();
    seen.add(normalized);
  }
  return Array.from(seen);
}

export function validateHarnessInput(input: HarnessInput): string[] {
  const errors: string[] = [];
  if (!input.text || !input.text.trim()) errors.push("Input text is required.");
  if (input.text.length > 10_000) errors.push("Input text must be 10,000 characters or fewer.");
  if (!["ui", "api", "cli", "scheduled"].includes(input.channel)) {
    errors.push("Input channel is not supported.");
  }
  return errors;
}

export function parseHarnessIntent(input: HarnessInput): HarnessIntent {
  const text = normalizeText(input.text).toLowerCase();
  const suttaIds = extractSuttaIds(input.text);
  const wantsSync = /\b(sync|backup|cloud|supabase|save progress)\b/i.test(input.text);

  if (/\b(reflect|reflection|mind|goodwill|answer|buddha bot|buddhabot)\b/.test(text)) {
    return { kind: "reflection", confidence: 0.84, entities: { suttaIds, wantsSync } };
  }
  if (/\b(quiz|question|mcq|leaf|review)\b/.test(text)) {
    return { kind: "quiz", confidence: 0.78, entities: { suttaIds, wantsSync } };
  }
  if (/\b(read|open|show|sutta|nikaya|canon)\b/.test(text) || suttaIds.length > 0) {
    return { kind: "read_sutta", confidence: 0.75, entities: { suttaIds, wantsSync } };
  }
  if (wantsSync) {
    return { kind: "profile_sync", confidence: 0.72, entities: { suttaIds, wantsSync } };
  }
  if (/\b(search|find|retrieve|where)\b/.test(text)) {
    return { kind: "corpus_search", confidence: 0.68, entities: { suttaIds, wantsSync } };
  }
  if (/\b(pipeline|deploy|tally|validate|gcs|cloud run)\b/.test(text)) {
    return { kind: "admin_pipeline", confidence: 0.7, entities: { suttaIds, wantsSync } };
  }
  return { kind: "unknown", confidence: 0.2, entities: { suttaIds, wantsSync } };
}

export function applyHarnessGuardrails(input: HarnessInput, intent: HarnessIntent): string[] {
  const errors: string[] = [];
  const text = input.text.toLowerCase();
  if (/\b(delete all|drop table|wipe|reset production)\b/.test(text)) {
    errors.push("Destructive production actions require explicit human approval.");
  }
  if (intent.kind === "reflection" && (input.readSuttaIds ?? []).length === 0) {
    errors.push("Reflection answers need at least one marked-read sutta for grounding.");
  }
  if (/\b(api[_ -]?key|password|secret)\b/.test(text)) {
    errors.push("Secrets must not be placed in prompts or client-visible metadata.");
  }
  return errors;
}

export function planHarnessSteps(intent: HarnessIntent): HarnessStep[] {
  switch (intent.kind) {
    case "reflection":
      return [
        { id: "load-read-suttas", tool: "loadReadSuttas", required: true, retryLimit: 1 },
        { id: "retrieve-grounding", tool: "retrieveCorpus", required: true, retryLimit: 1 },
        { id: "call-model", tool: "callReflectionModel", required: true, retryLimit: 2 },
        { id: "format-output", tool: "formatReflection", required: true, retryLimit: 0 },
      ];
    case "profile_sync":
      return [{ id: "sync-progress", tool: "syncProgress", required: true, retryLimit: 2 }];
    case "admin_pipeline":
      return [{ id: "pipeline-check", tool: "runPipelineCheck", required: true, retryLimit: 0 }];
    case "read_sutta":
    case "corpus_search":
    case "quiz":
      return [{ id: "retrieve-corpus", tool: "retrieveCorpus", required: true, retryLimit: 1 }];
    case "unknown":
      return [];
  }
}

function trace(stepId: string, status: HarnessTraceEvent["status"], detail?: string) {
  return { stepId, status, at: new Date().toISOString(), detail };
}

export async function runHarness(input: HarnessInput, tools: Partial<Record<HarnessToolName, HarnessTool>>): Promise<HarnessRunResult> {
  const inputErrors = validateHarnessInput(input);
  const intent = parseHarnessIntent(input);
  const guardrailErrors = applyHarnessGuardrails(input, intent);
  const steps = planHarnessSteps(intent);
  const state: HarnessRunState = { input, intent, steps, trace: [], outputs: {} };

  const initialErrors = [...inputErrors, ...guardrailErrors];
  if (initialErrors.length > 0) {
    return { ok: false, state, error: initialErrors.join(" ") };
  }

  let lastOutput: unknown = null;
  for (const step of steps) {
    const tool = tools[step.tool];
    if (!tool) {
      const msg = `Missing tool: ${step.tool}.`;
      state.trace.push(trace(step.id, step.required ? "failed" : "skipped", msg));
      if (step.required) return { ok: false, state, error: msg };
      continue;
    }

    let attempt = 0;
    while (attempt <= step.retryLimit) {
      state.trace.push(trace(step.id, "started", `attempt ${attempt + 1}`));
      try {
        lastOutput = await tool({ input, intent, state });
        state.outputs[step.id] = lastOutput;
        state.trace.push(trace(step.id, "succeeded"));
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        state.trace.push(trace(step.id, "failed", msg));
        if (attempt >= step.retryLimit) return { ok: false, state, error: msg };
        attempt += 1;
      }
    }
  }

  return { ok: true, state, output: lastOutput };
}

export function buildDamaHarnessBlueprint(): HarnessComponentStatus[] {
  const rows: Array<[string, string, string, string]> = [
    ["Input / Command Layer", "Input", "Reflection UI, sutta pages, quiz flow, profile sync, CLI pipeline commands", "HarnessInput with ui/api/cli/scheduled channels"],
    ["Output Layer", "Input", "Mobile-friendly reflection answer, quiz state, sync status, JSON for APIs", "formatReflection tool slot"],
    ["Intent Parser", "Input", "Detect reflection, reading, quiz, sync, corpus search, pipeline tasks", "parseHarnessIntent"],
    ["Tool Layer", "Execution", "Corpus loader, read-context loader, LLM call, Supabase sync, pipeline checks", "Typed HarnessTool registry"],
    ["Tool Router", "Execution", "Map intent steps to local tools", "planHarnessSteps"],
    ["Execution Engine", "Execution", "Run steps with retries and timeouts at tool boundary", "runHarness retry loop"],
    ["Error Handler", "Execution", "Return user-safe failure messages", "HarnessRunResult errors"],
    ["State Manager (Short-term)", "Memory", "Carry current input, intent, steps, trace, step outputs", "HarnessRunState"],
    ["Logging & Tracing", "Memory", "Audit each step and attempt", "HarnessTraceEvent"],
    ["Planner (rule-based)", "Planning", "Deterministic v1 plan for each intent", "planHarnessSteps"],
    ["Orchestrator (Control Loop)", "Planning", "Connect parser, guardrails, planner, tools", "runHarness"],
    ["Validation Layer", "Safety", "Required input, length limits, channel limits", "validateHarnessInput"],
    ["Guardrails", "Safety", "No secrets in prompts, no unapproved destructive actions, require grounding", "applyHarnessGuardrails"],
    ["Prompt Builder / Context Assembler", "Model", "Use marked-read suttas and corpus excerpts", "Existing reflection middleware prompt builder"],
    ["Model Layer (LLM)", "Model", "OpenAI/Gemini reflection provider", "Existing /__llm/reflection path"],
    ["Output Parser", "Model", "Normalize provider output text", "Existing getOutputText/getGeminiText"],
    ["Feedback / Evaluation Loop", "Control", "Retry model/tool calls and later score answer quality", "Retry loop now; eval hooks next"],
    ["Knowledge Base", "Data", "data/validated-json plus GCS corpus", "Existing corpus pipeline"],
    ["Ingestion / Indexing Pipeline", "Data", "scripts2 pipeline validation, sync, index generation", "Existing npm pipe2 commands"],
    ["Retrieval Layer", "Data", "Read-sutta context selector and corpus APIs", "Existing readSuttaContext + retrieveCorpus tool slot"],
    ["Vector Memory", "Data", "Semantic search over corpus", "Not implemented; candidate pgvector/Supabase"],
    ["Structured Memory", "Data", "Profiles, reading/audio progress, leaves, UX logs", "Existing localStorage + Supabase schema"],
    ["Long-term Memory", "Data", "User history and progress continuity", "Existing Supabase sync hooks"],
    ["Agent Communication Protocol", "Agents", "Single-agent v1; message envelope later", "HarnessInput/HarnessRunResult envelope"],
    ["Planner (LLM / hybrid)", "Agents", "Advanced planning after deterministic core is stable", "Deferred"],
    ["Checkpointing Layer", "Agents", "Save/resume long workflows", "Trace/state shape ready"],
    ["Confidence / Calibration Layer", "Agents", "Intent confidence and future groundedness scores", "Intent confidence now"],
    ["Simulation / Testing Layer", "Agents", "Vitest/Playwright plus harness scenario tests", "Unit tests for pure harness"],
    ["Human-in-the-loop Interface", "Agents", "Approval for destructive/admin/cloud actions", "Guardrail errors now; UI later"],
    ["Monitoring & Metrics", "Ops", "Latency, success, cost, provider", "Trace shape now; production metrics later"],
    ["Configuration Layer", "Ops", "Env model/provider, corpus bases, Supabase, GCS", "Existing env variables"],
    ["Security Layer", "Ops", "Server-only API keys, Supabase RLS, no prompt secrets", "Existing server-side key pattern + guardrails"],
    ["Versioning Layer", "Ops", "Prompts, model, dataset, pipeline index", "Docs and env today; formal registry later"],
    ["Distributed Orchestration Layer", "Scale", "Queues for indexing/evals/deploy jobs", "Deferred"],
    ["Cloud Infrastructure Layer", "Scale", "Cloud Run, Cloud Build, GCS, Supabase", "Existing deploy configs"],
    ["CI/CD + Release Layer", "Scale", "npm test/e2e/build and Cloud Build trigger", "Existing scripts"],
    ["Model Adaptation Pipeline", "Scale", "Fine-tuning/evals after enough traces", "Deferred"],
  ];

  return rows.map(([component, category, inferredForDama, v1Implementation], idx) => ({
    step: idx + 1,
    component,
    category,
    inferredForDama,
    v1Implementation,
  }));
}
