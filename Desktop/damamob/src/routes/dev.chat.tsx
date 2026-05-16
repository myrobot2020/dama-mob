import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Send,
  Plus,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Pause,
  Square,
  RotateCcw,
  MessageSquare,
  BookOpen,
  Info,
  ExternalLink
} from "lucide-react";
import { getItem, getItems, postDamaQuery } from "@/lib/damaApi";
import { GroundedResponse } from "@/components/GroundedResponse";
import { CanonQuote } from "@/components/CanonQuote";
import { extractDocBodyFromChunkText, findLooseRange, normalizeSuttaCiteRef } from "@/lib/damaRag";

export const Route = createFileRoute("/dev/chat")({
  component: DamaChatWorkbench,
});

function DamaChatWorkbench() {
  const [useLlm, setUseLlm] = useState(true);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isConvCollapsed, setConvCollapsed] = useState(false);
  const [activeRef, setActiveRef] = useState<any>(null);
  const [refMode, setRefMode] = useState<"sutta" | "links">("sutta");
  const [indexStatus, setIndexStatus] = useState("loading...");

  const chatLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshConversations();
    refreshIndexStatus();
    // Default to true unless explicitly disabled in localStorage
    const saved = localStorage.getItem("dama_use_llm");
    if (saved === "0") setUseLlm(false);
  }, []);

  const toggleLlm = (val: boolean) => {
    setUseLlm(val);
    localStorage.setItem("dama_use_llm", val ? "1" : "0");
  };

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const refreshIndexStatus = async () => {
    try {
      const res = await fetch("/api/index_status");
      const data = await res.json();
      setIndexStatus(`AN1: ${data.count} · AN2: ${data.an2_count} · AN3: ${data.an3_count}`);
    } catch {
      setIndexStatus("unknown");
    }
  };

  const refreshConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error("Failed to load conversations", e);
    }
  };

  const loadConversation = async (id: string) => {
    setActiveConversationId(id);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      const items = data.items || [];
      const chatMsgs: any[] = [];
      for (const item of items) {
        if (item.q) chatMsgs.push({ role: "user", text: item.q });
        if (item.a) chatMsgs.push({ role: "assistant", text: item.a, latency_ms: item.latency_ms });
      }
      setMessages(chatMsgs);
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  };

  const synthesizeAnswer = (chunks: any[]) => {
    const top = (chunks || []).slice(0, 6);
    if (!top.length) return "(no answer)";
    const lines = ["Retrieval results (no LLM):", ""];
    for (const c of top) {
      const sid = (c.suttaid || "").toString().trim();
      const cid = (c.commentary_id || "").toString().trim();
      const kind = ((c.kind || "").toString().trim() || "unknown").toLowerCase();
      if (kind === "chain") continue;

      const numsFrom = (s: string) => {
        const m = String(s || "").match(/(\d+(?:\.\d+)*)/);
        return m ? m[1] : "";
      };
      const sidNums = numsFrom(sid);
      const cidNums = numsFrom(cid);
      const cite = kind === "commentary"
        ? ("cAN " + (cidNums || sidNums || "").trim())
        : ("AN " + (sidNums || "").trim());

      const snippet = (c.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 220);
      lines.push("- " + snippet + (cite ? (" (" + cite + ")") : ""));
    }
    return lines.join("\n");
  };

  const handleSend = async () => {
    if (!inputText.trim() || isThinking) return;
    const question = inputText.trim();
    setInputText("");
    setIsThinking(true);

    const newUserMsg = { role: "user", text: question };
    setMessages(prev => [...prev, newUserMsg]);

    const t0 = performance.now();
    try {
      // Use the proxy /api/query which hits dama5 backend
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, book: "all", use_llm: useLlm, k: 8 }),
      });
      const data = await res.json();
      const latencyMs = Math.round(performance.now() - t0);

      const chunks = data.chunks || [];
      const answer = data.answer || synthesizeAnswer(chunks);

      const asstMsg = {
        role: "assistant",
        text: answer,
        latency_ms: latencyMs,
        chunks: chunks
      };

      setMessages(prev => [...prev, asstMsg]);

      // Save to conversation if possible
      let cid = activeConvId;
      if (!cid) {
        const cRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: question.slice(0, 30) }),
        });
        const cData = await cRes.json();
        cid = cData.id;
        setActiveConversationId(cid);
      }

      await fetch(`/api/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, latency_ms: latencyMs }),
      });

      refreshConversations();
    } catch (e) {
      console.error("Query failed", e);
      setMessages(prev => [...prev, { role: "assistant", text: "**Error:** Failed to reach backend.", error: true }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleCitationClick = async (kind: "sutta" | "commentary", ref: string, msgChunks?: any[]) => {
    const norm = normalizeSuttaCiteRef(ref);
    try {
      // Use existing getItem from damaApi which might use direct FS or proxy
      const item = await getItem(norm.replace(/^c/, ""));

      // Try to find matching chunk for highlighting
      // If we have msgChunks (passed from message), use them; else fallback to searching all assistant messages
      const chunks = msgChunks || messages.filter(m => m.role === "assistant" && m.chunks).flatMap(m => m.chunks);
      let range;
      if (chunks.length > 0) {
         const match = chunks.find((c: any) => normalizeSuttaCiteRef(c.suttaid || "") === norm || normalizeSuttaCiteRef(c.commentary_id || "") === norm);
         if (match) {
            const fullText = kind === "commentary" ? item.commentry || "" : item.sutta;
            const body = extractDocBodyFromChunkText(kind, match.text);
            // Use longer sample for better match robustness
            range = findLooseRange(fullText, body.slice(0, 450));
         }
      }

      setActiveRef({
        item,
        kind,
        highlightRange: range
      });
      setRefMode("sutta");
    } catch (e) {
      console.error("Failed to load reference", e);
    }
  };

  const [rebuildBooks, setRebuildBooks] = useState({ an1: false, an2: true, an3: true });

  const handleRebuild = async () => {
    const selected = Object.entries(rebuildBooks).filter(([_, v]) => v).map(([k, _]) => k);
    if (!selected.length) return;

    setIndexStatus("rebuilding...");
    try {
      for (const book of selected) {
        await fetch(`/api/build?book=${book}`, { method: "POST" });
      }
      refreshIndexStatus();
    } catch (e) {
      console.error("Rebuild failed", e);
      setIndexStatus("rebuild failed");
    }
  };

  return (
    <div className="dark charcoal bg-background text-foreground" style={{ height: '100vh', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header className="border-b border-border/10 bg-black/20 backdrop-blur-md" style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.2px' }}>Dama — local (AN1+AN2+AN3)</div>
          <div className="text-muted-foreground" style={{ fontSize: '11px' }}>Index: {indexStatus}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
           <Link to="/dev/pipeline" className="text-muted-foreground hover:text-foreground transition-colors" style={{ fontSize: '11px', textDecoration: 'none' }}>Pipeline</Link>
           <Link to="/dev/ai" className="text-muted-foreground hover:text-foreground transition-colors" style={{ fontSize: '11px', textDecoration: 'none' }}>Experimental AI</Link>
           <Link to="/dev/chat" style={{ fontSize: '11px', color: '#ffcc33', fontWeight: 700, textDecoration: 'none' }}>Chat</Link>

           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '10px' }}>
             <button className="bg-white/5 border border-border/10 hover:bg-white/10 transition-colors" style={{ height: '30px', padding: '0 10px', borderRadius: '10px', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Profile</button>

             <div className="text-muted-foreground" style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
               <span>LLM:</span>
               <input type="checkbox" checked={useLlm} onChange={e => toggleLlm(e.target.checked)} />
               <span style={{ marginLeft: '10px' }}>Rebuild:</span>
               {(['an1', 'an2', 'an3'] as const).map(b => (
                 <label key={b} style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                   <input
                     type="checkbox"
                     checked={rebuildBooks[b]}
                     onChange={e => setRebuildBooks(prev => ({ ...prev, [b]: e.target.checked }))}
                   />
                   {b.toUpperCase()}
                 </label>
               ))}
             </div>

             <button
               onClick={handleRebuild}
               className="border border-border/20 transition-all hover:opacity-90"
               style={{ height: '30px', padding: '0 10px', borderRadius: '10px', background: 'linear-gradient(180deg, rgba(255,204,51,0.4), rgba(255,204,51,0.18))', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
             >Rebuild</button>
           </div>
        </div>
      </header>

      {/* Main Layout */}
      <div style={{ flex: 1, display: 'flex', padding: '12px', gap: '10px', overflow: 'hidden' }}>

        {/* Col 1: Past Chats */}
        <aside style={{ width: isConvCollapsed ? '42px' : '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px', transition: 'width 0.22s' }}>
          <div className="border border-border/10 bg-card/80" style={{ borderRadius: '14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="border-b border-border/5" style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {!isConvCollapsed && <span className="text-muted-foreground" style={{ fontSize: '12px' }}>Past chats</span>}
              <button onClick={() => setConvCollapsed(!isConvCollapsed)} className="text-muted-foreground hover:text-foreground transition-colors" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                {isConvCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>
            {!isConvCollapsed && (
              <div style={{ flex: 1, padding: '10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => { setActiveConversationId(null); setMessages([]); }}
                  className="bg-white/5 border border-border/10 hover:bg-white/10 transition-colors"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '10px', color: '#fff', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Plus size={14} /> New chat
                </button>
                {conversations.map(c => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`transition-all ${activeConvId === c.id ? 'bg-primary/20 border-primary/40' : 'bg-black/10 border-border/5 hover:border-border/20'}`}
                    style={{ padding: '8px', borderRadius: '10px', borderStyle: 'solid', borderWidth: '1px', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 600, color: '#dbe6ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || "Chat"}</div>
                    <div className="text-muted-foreground" style={{ fontSize: '10px', marginTop: '2px' }}>{new Date(c.updated_ts).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Col 2: Chat Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '400px' }}>
          <div className="border border-border/10 bg-card/80" style={{ borderRadius: '14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="border-b border-border/5 text-muted-foreground" style={{ padding: '8px 10px', fontSize: '12px' }}>Chat</div>
            <div ref={chatLogRef} style={{ flex: 1, padding: '10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.length === 0 && (
                 <div className="text-muted-foreground" style={{ fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
                   Hi there. Ask anything about the AN 1 or AN 2 teachings (suttas, commentary, or themes).
                 </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                  <div className={`p-3 rounded-2xl border transition-all ${m.role === 'user' ? 'bg-primary/10 border-primary/30' : 'bg-black/20 border-border/5'}`} style={{ fontSize: '13px', lineHeight: '1.45' }}>
                    {m.role === 'user' ? m.text : (
                      <div className="text-foreground">
                        <GroundedResponse text={m.text} onCitationClick={(k, r) => handleCitationClick(k, r, m.chunks)} />
                      </div>
                    )}
                  </div>
                  {m.latency_ms && (
                    <div className="text-muted-foreground" style={{ fontSize: '10px', marginTop: '4px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                      {m.latency_ms} ms
                    </div>
                  )}
                </div>
              ))}
              {isThinking && (
                <div className="self-start bg-black/20 border border-border/5 p-3 rounded-2xl text-muted-foreground animate-pulse" style={{ fontSize: '12px' }}>
                  Searching...
                </div>
              )}
            </div>
            <div className="p-3 border-t border-border/5">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask across AN1 and AN2..."
                  className="bg-black/30 border border-border/10 focus:border-primary/50 transition-colors"
                  style={{ flex: 1, borderRadius: '12px', padding: '8px 10px', color: '#fff', resize: 'none', minHeight: '44px', fontSize: '13px', outline: 'none' }}
                />
                <button
                  onClick={handleSend}
                  disabled={isThinking || !inputText.trim()}
                  className="transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  style={{ padding: '8px 16px', borderRadius: '12px', background: 'linear-gradient(180deg, rgba(124,92,255,0.9), rgba(124,92,255,0.6))', border: '1px solid rgba(124,92,255,0.7)', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Col 3: Reference */}
        <section style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="border border-border/10 bg-card/80" style={{ borderRadius: '14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="border-b border-border/5" style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted-foreground" style={{ fontSize: '12px' }}>Reference</span>
              {activeRef && <div className="text-muted-foreground" style={{ fontSize: '10px' }}>{activeRef.item.suttaid}</div>}
            </div>
            <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
              {!activeRef ? (
                <div className="text-muted-foreground" style={{ fontSize: '12px' }}>
                  Click an (AN ...) or (cAN ...) citation in chat to open sutta and commentary here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setRefMode("sutta")}
                      className={`text-xs px-3 py-1 rounded-md transition-all ${refMode === 'sutta' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white/5 hover:bg-white/10 text-muted-foreground'}`}
                      style={{ cursor: 'pointer', border: 'none' }}
                    >Sutta</button>
                    <button
                      onClick={() => setRefMode("links")}
                      className={`text-xs px-3 py-1 rounded-md transition-all ${refMode === 'links' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white/5 hover:bg-white/10 text-muted-foreground'}`}
                      style={{ cursor: 'pointer', border: 'none' }}
                    >Links</button>
                  </div>

                  {refMode === 'sutta' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div style={{ fontSize: '12px' }}>
                        <div className="text-muted-foreground font-black tracking-widest" style={{ fontSize: '10px', marginBottom: '8px' }}>SUTTA</div>
                        <div style={{ color: '#dbe6ff', lineHeight: '1.6', fontSize: '14px' }}>
                          <CanonQuote text={activeRef.item.sutta} source={activeRef.item.suttaid} highlightRange={activeRef.kind === 'sutta' ? activeRef.highlightRange : undefined} />
                        </div>
                      </div>
                      <div className="h-px bg-white/5" />
                      <div style={{ fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                           <div className="text-muted-foreground font-black tracking-widest" style={{ fontSize: '10px' }}>TEACHER COMMENTARY</div>
                           <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="text-muted-foreground hover:text-foreground transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Volume2 size={14} /></button>
                           </div>
                        </div>
                        <div style={{ color: '#dbe6ff', lineHeight: '1.6', fontSize: '13px', fontStyle: 'italic' }}>
                          {activeRef.item.commentry ? (
                             <CanonQuote text={activeRef.item.commentry} source={activeRef.item.commentary_id || activeRef.item.suttaid} highlightRange={activeRef.kind === 'commentary' ? activeRef.highlightRange : undefined} />
                          ) : "(no commentary)"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                       <div className="text-muted-foreground font-black tracking-widest" style={{ fontSize: '10px' }}>LINKS</div>
                       {activeRef.item.sc_url && (
                          <a href={activeRef.item.sc_url} target="_blank" rel="noreferrer" className="text-primary hover:underline transition-all" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            SuttaCentral (discourse page) <ExternalLink size={12} />
                          </a>
                       )}
                       {activeRef.item.chain && (
                          <div style={{ marginTop: '10px' }}>
                             <div className="text-muted-foreground" style={{ fontSize: '11px', marginBottom: '8px' }}>
                               Category: {activeRef.item.chain.category} · {activeRef.item.chain.is_ordered ? "Ordered" : "Unordered"} · {activeRef.item.chain.count} items
                             </div>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {activeRef.item.chain.items?.map((it: string, idx: number) => (
                                   <div key={idx} style={{ padding: '7px 10px', border: '1px solid rgba(124, 92, 255, 0.32)', borderLeft: '3px solid rgba(129, 140, 248, 0.75)', borderRadius: '8px', background: 'rgba(12, 18, 32, 0.92)', fontSize: '12px', color: '#dbe6ff' }}>
                                      {it}
                                   </div>
                                ))}
                             </div>
                          </div>
                       )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
