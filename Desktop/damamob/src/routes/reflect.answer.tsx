import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState, useRef } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CanonQuote } from "@/components/CanonQuote";
import { GroundedResponse } from "@/components/GroundedResponse";
import { sutta as fallbackSutta } from "@/data/an1116.ts";
import { REFLECTION_QUERY_STORAGE_KEY } from "@/lib/damaApi";
import { Bookmark, Check, ChevronDown, ChevronUp, Cpu, History, Quote, Send, Loader2 } from "lucide-react";
import { type HarnessTraceEvent, runHarness, type HarnessMessage, recordHarnessFeedback } from "@/lib/damaHarness";
import { isDevMode, isUserAdmin } from "@/lib/devMode";
import { extractDocBodyFromChunkText, findLooseRange, normalizeSuttaCiteRef } from "@/lib/damaRag";
import { getItem } from "@/lib/damaApi";

type StoredQuery =
  | {
      ok: true;
      question: string;
      answer: string;
      used_llm: boolean;
      chunks: { suttaid?: string; text: string; kind?: "sutta" | "commentary" }[];
      mode?: "dama5" | "buddhabot" | "simulation" | "buddha" | "psychologist" | "social" | "feminine";
      history?: HarnessMessage[];
      harnessState?: {
        runId: string;
        intent: any;
        trace: HarnessTraceEvent[];
        durationMs: number;
      };
    }
  | { ok: false; error: string };

function readStoredQuery(): StoredQuery | null {
  try {
    const raw = localStorage.getItem(REFLECTION_QUERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredQuery;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/reflect/answer")({
  component: AnswerScreen,
});

const OFFLINE_EXPLANATION = `What you describe is a state of mind, and the Buddha taught that mind-states
arise from what we cultivate. The radiation of loving-kindness, when made to
grow, brings well-being even in sleep, calm in waking, and clarity in
difficulty. The feeling you sense is the natural fruit of practice, not
an accident.`;

function AnswerScreen() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HarnessMessage[]>([]);
  const [saved, setSaved] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [fromApi, setFromApi] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const isDev = isDevMode();
  const [harnessState, setHarnessState] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [mode, setMode] = useState<
    "dama5" | "buddhabot" | "simulation" | "buddha" | "psychologist" | "social" | "feminine" | "offline"
  >("offline");

  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeRef, setActiveRef] = useState<{
    text: string;
    source: string;
    highlightRange?: { start: number; end: number };
  }>({ text: fallbackSutta.canon, source: fallbackSutta.id });

  const modeLabel = (m: typeof mode) => {
    if (m === "dama5") return "dama5";
    if (m === "buddhabot" || m === "buddha") return "Buddha Bot";
    if (m === "psychologist") return "Psychologist Bot";
    if (m === "social") return "Social Cohesion Bot";
    if (m === "simulation") return "Simulation Theory Bot";
    if (m === "feminine") return "Feminine Bot";
    return "offline";
  };

  const syncFromStorage = () => {
    const q = readStoredQuery();
    console.log("[Answer] syncFromStorage read:", q ? (q.ok ? "ok" : "error: " + (q as any).error) : "null");
    if (q && q.ok && q.answer.trim()) {
      setQuestion(q.question || localStorage.getItem("dama:reflection") || "");
      setExplanation(q.answer.trim());
      setFromApi(true);
      setMode((q.mode as any) || "dama5");
      setChunks(q.chunks || []);
      setHistory(q.history || []);
      if (q.harnessState) setHarnessState(q.harnessState);

      if (q.chunks && q.chunks.length > 0) {
        const first = q.chunks[0];
        setActiveRef({
          text: extractDocBodyFromChunkText(first.kind || "sutta", first.text),
          source: first.suttaid || "Unknown Source",
        });
      }
    } else {
      setQuestion(localStorage.getItem("dama:reflection") || "");
      setExplanation(OFFLINE_EXPLANATION.replace(/\s+/g, " ").trim());
      setFromApi(false);
      setMode("offline");
      setChunks([]);
      setHistory([]);
    }
  };

  useEffect(() => {
    syncFromStorage();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, isThinking]);

  const handleCitationClick = async (kind: "sutta" | "commentary", ref: string) => {
    const norm = normalizeSuttaCiteRef(ref);
    const match = chunks.find((c) => {
      const cId = normalizeSuttaCiteRef(c.suttaid || "");
      return (
        cId === norm ||
        (kind === "commentary" && cId.replace(/^c/, "") === norm.replace(/^c/, ""))
      );
    });

    try {
      const item = await getItem(norm.replace(/^c/, ""));
      const fullText = kind === "commentary" ? item.commentry || "" : item.sutta;

      let range;
      if (match) {
        const snippet = extractDocBodyFromChunkText(kind, match.text);
        range = findLooseRange(fullText, snippet.slice(0, 300));
      }

      setActiveRef({
        text: fullText,
        source: item.suttaid,
        highlightRange: range || undefined,
      });
    } catch (e) {
      console.error("Failed to fetch full item for citation", e);
      if (match) {
        const body = extractDocBodyFromChunkText(kind, match.text);
        setActiveRef({
          text: body,
          source: match.suttaid || ref,
          highlightRange: { start: 0, end: Math.min(body.length, 200) },
        });
      }
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || isThinking) return;
    const text = followUp.trim();
    setFollowUp("");
    setIsThinking(true);

    const newHistory: HarnessMessage[] = [
      ...history,
      { role: "user", content: question },
      { role: "assistant", content: explanation },
    ];

    try {
      const result = await runHarness(
        {
          channel: "ui",
          text,
          history: newHistory,
          metadata: { mode: mode === "offline" ? "buddha" : mode },
          isAdmin: isUserAdmin(),
        }
      );

      if (result.ok) {
        syncFromStorage();
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setIsThinking(false);
    }
  };

  const save = () => {
    const entry = {
      question,
      answer: explanation,
      source: activeRef.source,
      savedAt: new Date().toISOString(),
      fromApi,
    };
    const prev = JSON.parse(localStorage.getItem("dama:journal") || "[]");
    localStorage.setItem("dama:journal", JSON.stringify([entry, ...prev]));
    setSaved(true);

    if (harnessState?.runId) {
      void recordHarnessFeedback(harnessState.runId, {
        score: 1,
        method: "implicit",
        detail: "User saved reflection to journal"
      });
    }
  };

  return (
    <div className="min-h-screen dama-screen pb-32">
      <ScreenHeader title="Reflect" showBookmark />
      <div className="px-7 pt-24">

        {/* History of conversation */}
        {history.length > 0 && (
          <div className="space-y-8 mb-8">
            {history.map((msg, i) => (
              <div key={i} className={`border-y paper-rule py-4 ${msg.role === 'user' ? 'opacity-60' : ''}`}>
                <div className="label-mono text-muted-foreground mb-1">
                  {msg.role === 'user' ? 'Previous Question' : 'Previous Answer'}
                </div>
                <div className={`text-reading ${msg.role === 'user' ? 'text-lg' : 'text-xl'} leading-relaxed`}>
                  {msg.role === 'assistant' ? (
                    <GroundedResponse text={msg.content} onCitationClick={handleCitationClick} />
                  ) : (
                    `"${msg.content}"`
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="label-mono text-foreground/70">Response</div>

        {question && (
          <div className="mt-4 border-y paper-rule py-4">
            <div className="label-mono text-muted-foreground">Your question</div>
            <p className="mt-2 text-reading text-lg leading-relaxed text-muted-foreground">"{question}"</p>
          </div>
        )}

        <section className="mt-6">
          <div className="label-mono text-muted-foreground mb-2">
            Explanation ({modeLabel(mode)})
          </div>
          <GroundedResponse text={explanation} onCitationClick={handleCitationClick} />
        </section>

        {isThinking && (
          <div className="mt-8 flex items-center gap-3 text-muted-foreground animate-pulse">
            <Loader2 className="animate-spin" size={18} />
            <span className="label-mono text-sm">BuddhaBot is reflecting...</span>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm">
            <div className="font-bold label-mono mb-1 uppercase tracking-tight">Error</div>
            {error}
          </div>
        )}

        <div ref={scrollRef} />

        {harnessState && isDev && (
          <section className="mt-6">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="w-full flex items-center justify-between border-y paper-rule py-4 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-primary" />
                <span className="text-xs font-semibold label-mono uppercase tracking-wider">
                  Harness Trace
                </span>
              </div>
              {showTrace ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showTrace && (
              <div className="mt-2 border-y paper-rule bg-primary/5 p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b paper-rule pb-2">
                  <div className="text-[10px] label-mono text-muted-foreground">
                    RUN_ID: <span className="text-primary">{harnessState.runId}</span>
                  </div>
                  <div className="text-[10px] label-mono text-muted-foreground">
                    TOTAL: <span className="text-primary">{harnessState.durationMs}ms</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {harnessState.trace.map((event: any, i: number) => (
                    <div key={i} className="relative pl-4 border-l-2 paper-rule">
                      <div className="absolute -left-[5px] top-1 size-2 rounded-full bg-primary shadow-[0_0_8px_var(--glow)]" />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold label-mono text-foreground/90">
                          {event.stepId}
                        </span>
                        <span
                          className={`text-[9px] label-mono px-1.5 py-0.5 rounded ${
                            event.status === "succeeded"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {event.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/70">
                          {new Date(event.at).toLocaleTimeString()}
                        </span>
                        {event.durationMs && (
                          <span className="text-[10px] text-primary/60">{event.durationMs}ms</span>
                        )}
                      </div>
                      {event.detail && (
                        <p className="mt-1 text-[10px] text-muted-foreground italic leading-relaxed">
                          {event.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Quote size={14} className="text-muted-foreground" />
            <div className="label-mono text-muted-foreground">Reference</div>
          </div>
          <CanonQuote
            text={activeRef.text}
            source={activeRef.source}
            highlightRange={activeRef.highlightRange}
          />
        </section>

        {chunks.length > 1 && (
          <section className="mt-4 overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {chunks.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setActiveRef({
                    text: extractDocBodyFromChunkText(c.kind || "sutta", c.text),
                    source: c.suttaid || "Source",
                  })}
                  className={`px-3 py-1 rounded-full text-[10px] label-mono whitespace-nowrap border transition-colors ${
                    activeRef.source === c.suttaid ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-paper-rule"
                  }`}
                >
                  {c.suttaid || `Source ${i + 1}`}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={save}
            className={`w-full rounded-full border py-4 font-medium flex items-center justify-center gap-2 ${
              saved ? "paper-rule text-primary" : "border-foreground bg-transparent text-foreground"
            }`}
          >
            {saved ? (
              <>
                <Check size={16} /> Saved to Journal
              </>
            ) : (
              <>
                <Bookmark size={16} /> Save to Journal
              </>
            )}
          </button>

          <button
            onClick={() => navigate({ to: "/reflect", replace: true })}
            className="w-full rounded-full border paper-rule py-4 font-medium text-muted-foreground flex items-center justify-center gap-2"
          >
            Start New Reflection
          </button>
        </div>
      </div>

      {/* Floating Chat Input */}
      <div className="fixed bottom-0 inset-x-0 bg-background/80 backdrop-blur-md border-t paper-rule p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-screen-md mx-auto flex items-center gap-3">
          <input
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFollowUp()}
            placeholder="Ask a follow-up question..."
            className="flex-1 bg-transparent border-none focus:outline-none text-reading text-lg"
            disabled={isThinking}
          />
          <button
            onClick={handleFollowUp}
            disabled={!followUp.trim() || isThinking}
            className="size-10 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-30"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
