import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Sparkles, Send, Loader2, Cpu, ChevronDown, ChevronUp, Quote, BookOpen } from "lucide-react";
import { runHarness, type HarnessMessage, type HarnessTraceEvent } from "@/lib/damaHarness";
import { isUserAdmin } from "@/lib/devMode";
import { GroundedResponse } from "@/components/GroundedResponse";
import { getItem, REFLECTION_QUERY_STORAGE_KEY } from "@/lib/damaApi";
import { CanonQuote } from "@/components/CanonQuote";
import { extractDocBodyFromChunkText, findLooseRange, normalizeSuttaCiteRef } from "@/lib/damaRag";

export const Route = createFileRoute("/dev/ai")({
  component: ExperimentalAiDashboard,
});

type ReflectionBot = "simulation" | "buddha" | "psychologist" | "social" | "feminine";

function ExperimentalAiDashboard() {
  const [text, setText] = useState("");
  const [bot, setBot] = useState<ReflectionBot>("buddha");
  const [isThinking, setIsThinking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(true);
  const [activeRef, setActiveRef] = useState<{ text: string; source: string; highlightRange?: any } | null>(null);

  const handleSend = async () => {
    console.log("[DevAI] handleSend triggered. Text:", text);
    if (!text.trim() || isThinking) return;

    const currentText = text.trim();
    setText(""); // Clear immediately for better UX
    setIsThinking(true);
    setError(null);
    setResult(null);
    setActiveRef(null);

    try {
      const input = {
        channel: "ui" as const,
        text: currentText,
        metadata: { mode: bot },
        isAdmin: isUserAdmin(),
      };

      const res = await runHarness(input);
      if (res.ok) {
        const finalOutput = res.state.outputs["format-output"] || res.output;
        const displayResult = typeof finalOutput === 'object' && finalOutput !== null
          ? {
              ...finalOutput,
              harnessState: (finalOutput as any).harnessState || {
                runId: res.state.runId,
                intent: res.state.intent,
                trace: res.state.trace,
                durationMs: Date.now() - res.state.startTime
              }
            }
          : finalOutput;

        setResult(displayResult);
      } else {
        setError(res.error.message);
        setText(currentText); // Restore text on error
      }
    } catch (e: any) {
      setError(e.message || String(e));
      setText(currentText); // Restore text on error
    } finally {
      setIsThinking(false);
    }
  };

  const handleCitationClick = async (kind: "sutta" | "commentary", ref: string) => {
    const norm = normalizeSuttaCiteRef(ref);
    try {
      const item = await getItem(norm.replace(/^c/, ""));
      const fullText = kind === "commentary" ? item.commentry || "" : item.sutta;

      // Try to find if this sutta was in the chunks for highlighting
      const match = result?.chunks?.find((c: any) => normalizeSuttaCiteRef(c.suttaid || "") === norm);
      let range;
      if (match) {
        range = findLooseRange(fullText, extractDocBodyFromChunkText(kind, match.text).slice(0, 300));
      }

      setActiveRef({
        text: fullText,
        source: item.suttaid,
        highlightRange: range || undefined,
      });
    } catch (e) {
      console.error("Failed to load reference", e);
    }
  };

  return (
    <div style={{ height: '100vh', padding: '24px', background: '#f2e8cf', color: '#3d3124', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
      <header style={{ marginBottom: '20px', borderBottom: '2px solid #3d3124', paddingBottom: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8d816b' }}>EXPERIMENTAL AI DEBUGGER</div>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>AI Reflection Workbench</h1>

        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <Link to="/dev/pipeline" style={{ fontSize: '12px', fontWeight: 700, color: '#3d3124', textDecoration: 'none', padding: '4px 8px', border: '1px solid #3d3124', borderRadius: '4px' }}>Pipeline</Link>
          <Link to="/dev/ai" style={{ fontSize: '12px', fontWeight: 700, background: '#3d3124', color: '#f2e8cf', textDecoration: 'none', padding: '4px 8px', border: '1px solid #3d3124', borderRadius: '4px' }}>Experimental AI</Link>
          <Link to="/dev/chat" style={{ fontSize: '12px', fontWeight: 700, color: '#3d3124', textDecoration: 'none', padding: '4px 8px', border: '1px solid #3d3124', borderRadius: '4px' }}>Chat</Link>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px', overflow: 'hidden' }}>
        {/* Left: Input & Trace */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #bcac8d', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>REFLECTION VOICE</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
              {(["buddha", "psychologist", "social", "simulation", "feminine"] as ReflectionBot[]).map(b => (
                <button
                  key={b}
                  onClick={() => setBot(b)}
                  style={{
                    padding: '8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid #3d3124',
                    background: bot === b ? '#3d3124' : 'transparent',
                    color: bot === b ? '#f2e8cf' : '#3d3124',
                    cursor: 'pointer'
                  }}
                >
                  {b.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ minHeight: '200px', background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #bcac8d', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800 }}>USER PROMPT</label>
            </div>
            <textarea
              value={text}
              autoFocus
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Enter a question to test the harness..."
              style={{ flex: 1, width: '100%', resize: 'none', border: '1px solid #e7d8b1', padding: '12px', borderRadius: '4px', fontSize: '14px', marginBottom: '15px', color: '#000' }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={isThinking || !text.trim()}
              style={{
                padding: '12px',
                background: '#3d3124',
                color: '#f2e8cf',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                opacity: (isThinking || !text.trim()) ? 0.5 : 1
              }}
            >
              {isThinking ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              RUN HARNESS
            </button>
          </div>

          {result?.harnessState && (
            <div style={{ background: '#1a1a1a', color: '#e0e0e0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333' }}>
              <button
                onClick={() => setShowTrace(!showTrace)}
                style={{ width: '100%', padding: '10px 15px', background: '#222', border: 'none', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cpu size={16} color="#b08d57" />
                  <span style={{ fontSize: '11px', fontWeight: 800 }}>HARNESS TRACE ({result.harnessState.durationMs}ms)</span>
                </div>
                {showTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showTrace && (
                <div style={{ padding: '15px', fontSize: '11px' }}>
                  {result.harnessState.trace.map((event: any, i: number) => (
                    <div key={i} style={{ marginBottom: '10px', paddingLeft: '15px', borderLeft: '1px solid #444', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-4px', top: '2px', width: '7px', height: '7px', borderRadius: '50%', background: event.status === 'succeeded' ? '#4ade80' : '#f87171' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700 }}>{event.stepId}</span>
                        <span style={{ opacity: 0.6 }}>{event.durationMs}ms</span>
                      </div>
                      {event.detail && <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '2px' }}>{event.detail}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: Response & Ref */}
        <section style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #ef4444', padding: '15px', borderRadius: '8px', color: '#b91c1c' }}>
              <div style={{ fontWeight: 900, fontSize: '12px', marginBottom: '5px' }}>ERROR</div>
              <div style={{ fontSize: '13px' }}>{error}</div>
            </div>
          )}

          {result && (
            <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #bcac8d' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#8d816b', marginBottom: '10px' }}>RESPONSE</div>
              <div style={{ color: '#3d3124' }}>
                <GroundedResponse text={result.answer} onCitationClick={handleCitationClick} />
              </div>
            </div>
          )}

          {activeRef && (
             <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #bcac8d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                   <BookOpen size={16} color="#8d816b" />
                   <div style={{ fontSize: '10px', fontWeight: 800, color: '#8d816b', textTransform: 'uppercase' }}>REFERENCE: {activeRef.source}</div>
                   <button onClick={() => setActiveRef(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>×</button>
                </div>
                <CanonQuote text={activeRef.text} source={activeRef.source} highlightRange={activeRef.highlightRange} />
             </div>
          )}

          {!result && !isThinking && !error && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8d816b', border: '2px dashed #dcd0b9', borderRadius: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <Sparkles size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
                <div style={{ fontSize: '12px', fontWeight: 700 }}>WAITING FOR INPUT</div>
              </div>
            </div>
          )}

          {isThinking && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3d3124' }}>
              <div style={{ textAlign: 'center' }}>
                <Loader2 className="animate-spin" size={32} style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '12px', fontWeight: 700 }}>THINKING...</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
