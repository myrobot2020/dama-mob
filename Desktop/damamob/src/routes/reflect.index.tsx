import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect, useRef } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { GroundedResponse } from "@/components/GroundedResponse";
import { CanonQuote } from "@/components/CanonQuote";
import { postDamaQuery, getItem, type DamaChunk, type ItemDetail } from "@/lib/damaApi";
import { extractDocBodyFromChunkText, findLooseRange, normalizeSuttaCiteRef } from "@/lib/damaRag";
import { Send, Loader2, History, Trash2, Quote, Volume2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reflect/")({
  component: ReflectChatScreen,
});

type Message = {
  role: "user" | "assistant";
  content: string;
  chunks?: DamaChunk[];
  timestamp: number;
};

function ReflectChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeRef, setActiveRef] = useState<{
    item?: ItemDetail;
    kind: "sutta" | "commentary";
    highlightRange?: { start: number; end: number };
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("dama:chat_history");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem("dama:chat_history", JSON.stringify(messages));
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await postDamaQuery(userMsg.content);
      const assistantMsg: Message = {
        role: "assistant",
        content: resp.answer || "I couldn't find a specific answer, but here are some related suttas.",
        chunks: resp.chunks,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      toast.error("Failed to get response: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCitationClick = async (kind: "sutta" | "commentary", ref: string) => {
    const norm = normalizeSuttaCiteRef(ref);
    const suttaId = norm.replace(/^c/, "");

    try {
      const item = await getItem(suttaId);
      let range;

      // Find the specific chunk for this citation to highlight it
      const lastMsg = messages.filter(m => m.role === "assistant").slice(-1)[0];
      if (lastMsg?.chunks) {
        const match = lastMsg.chunks.find(c =>
          normalizeSuttaCiteRef(c.suttaid || "") === norm ||
          normalizeSuttaCiteRef("c" + (c.suttaid || "")) === norm
        );
        if (match) {
          const fullText = kind === "commentary" ? item.commentry || "" : item.sutta;
          const snippet = extractDocBodyFromChunkText(kind, match.text || "");
          range = findLooseRange(fullText, snippet.slice(0, 300));
        }
      }

      setActiveRef({
        item,
        kind,
        highlightRange: range || undefined
      });
    } catch (e) {
      toast.error("Could not load reference for " + ref);
    }
  };

  const clearHistory = () => {
    if (confirm("Clear all chat history?")) {
      setMessages([]);
      localStorage.removeItem("dama:chat_history");
    }
  };

  const playCommentaryAudio = () => {
    if (!activeRef?.item?.aud_file) {
      toast.error("No audio available for this commentary.");
      return;
    }

    // In a real app, this would use the signed URL API or local path
    const url = `/aud/${activeRef.item.aud_file}`;
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.currentTime = activeRef.item.aud_start_s || 0;
      audioRef.current.play().catch(() => {
        toast.error("Audio playback blocked. Please click play again.");
      });
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0b0f19] text-[#e9eefc]">
      <ScreenHeader title="Dhamma Chat" showBack={false}>
        <button onClick={clearHistory} className="p-2 opacity-50 hover:opacity-100 transition-opacity">
          <Trash2 size={18} />
        </button>
      </ScreenHeader>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${activeRef ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                <History size={48} className="mb-4" />
                <h3 className="text-xl font-bold">Start a conversation</h3>
                <p className="max-w-xs mt-2 text-sm">
                  Ask anything about the AN1, AN2, or AN3 suttas and commentary.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 border ${
                  msg.role === 'user'
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-white/5 border-white/10'
                }`}>
                  <div className="label-mono text-[10px] opacity-40 mb-1 uppercase tracking-widest">
                    {msg.role}
                  </div>
                  {msg.role === 'user' ? (
                    <p className="text-reading leading-relaxed">{msg.content}</p>
                  ) : (
                    <GroundedResponse text={msg.content} onCitationClick={handleCitationClick} />
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin text-primary" />
                  <span className="label-mono text-xs opacity-50">Searching the suttas...</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-black/20">
            <div className="max-w-3xl mx-auto relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about the Buddha's teachings..."
                rows={1}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 pr-12 focus:outline-none focus:border-primary/50 transition-colors resize-none text-reading"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 transition-all active:scale-95"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Reference Panel */}
        {activeRef && (
          <div className="w-full md:w-[400px] lg:w-[500px] border-l border-white/10 flex flex-col bg-black/40 backdrop-blur-md">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2">
                <Quote size={16} className="text-primary" />
                <span className="font-bold label-mono text-xs tracking-wider uppercase">Reference</span>
              </div>
              <button onClick={() => setActiveRef(null)} className="p-1 hover:bg-white/10 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-primary">
                    {activeRef.kind === 'commentary' ? 'Teacher Commentary' : 'Sutta Text'}
                  </h2>
                  {activeRef.kind === 'commentary' && activeRef.item?.aud_file && (
                    <button
                      onClick={playCommentaryAudio}
                      className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-xs font-bold hover:bg-primary/30 transition-colors"
                    >
                      <Volume2 size={14} /> Listen
                    </button>
                  )}
                </div>
                <div className="label-mono text-[10px] opacity-40 uppercase mb-4">
                  Source: {activeRef.item?.suttaid}
                </div>

                <div className="prose prose-invert max-w-none">
                  <CanonQuote
                    text={activeRef.kind === 'commentary' ? (activeRef.item?.commentry || "") : (activeRef.item?.sutta || "")}
                    source={activeRef.item?.suttaid || ""}
                    highlightRange={activeRef.highlightRange}
                  />
                </div>
              </div>

              {activeRef.item?.chain && (
                <div className="mt-8 border-t border-white/10 pt-6">
                  <h3 className="label-mono text-[11px] opacity-50 uppercase mb-4 tracking-widest">Chain Links</h3>
                  <div className="space-y-2">
                    {activeRef.item.chain.items?.map((link, idx) => (
                      <div key={idx} className="p-3 bg-white/5 border border-white/5 rounded-xl text-sm leading-relaxed">
                        {link}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <audio ref={audioRef} hidden />
    </div>
  );
}
