import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Check, Image as ImageIcon, Search, X, Edit2, Save } from "lucide-react";
import { z } from "zod";

const imageSelectorSearchSchema = z.object({
  suttaId: z.string().optional(),
});

export const Route = createFileRoute("/dev/image-selector")({
  validateSearch: (search) => imageSelectorSearchSchema.parse(search),
  component: ImageSelectorScreen,
});

type Candidate = {
  panel_id: string;
  imageUrl: string;
  local_path: string;
  source_book_id: string;
  page: number;
  quality_score: number;
  tags: {
    caption?: string;
    modern?: string;
    proposals: Array<{
      sutta_id: string;
      canonical_word: string;
      reason: string;
      score: string;
      rank: string;
    }>;
  };
};

type Selection = {
  sutta_id: string;
  panel_id: string;
  image_url: string;
  status: string;
  selection_word: string;
  selection_reason: string;
  selected_by: string;
  created_at: string;
};

function ImageSelectorScreen() {
  const { suttaId: initialSuttaId } = Route.useSearch();
  const [suttaId, setSuttaId] = useState(initialSuttaId || "");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [suttaData, setSuttaData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selectionWord, setSelectionWord] = useState("");
  const [panelMappings, setPanelMappings] = useState<any>(null);
  const [pipelineData, setPipelineData] = useState<any>(null);

  // ALL HOOKS MUST BE AT THE TOP
  const suggestedSuttas = useMemo(() => {
    const suttas = new Set<string>();

    // 1. From mappings grunt
    if (panelMappings) {
      Object.values(panelMappings).forEach((m: any) => {
        const match = m.mapping?.match(/SUTTA:\s*(AN\s+[0-9.]+)/i);
        if (match) suttas.add(match[1].toUpperCase());

        if (m.possible_sutta_names) {
          m.possible_sutta_names.forEach((name: string) => {
            const m2 = name.match(/(AN\s+[0-9.]+)/i);
            if (m2) suttas.add(m2[1].toUpperCase());
          });
        }
      });
    }

    // 2. From candidate proposals
    candidates.forEach(c => {
      c.tags.proposals?.forEach(p => {
        if (p.sutta_id) {
          const sid = p.sutta_id.toUpperCase();
          if (sid.startsWith("AN ")) suttas.add(sid);
        }
      });
    });

    return Array.from(suttas).sort();
  }, [panelMappings, candidates]);

  const waitingSuttas = useMemo(() => {
    // Heuristic 1: Suttas from mapping that don't have a selection yet
    const mappingWaiting = suggestedSuttas.filter(sid => !selections[sid]);

    // Heuristic 2: Suttas from pipeline that have finished generation
    const rawSources = pipelineData?.sources || pipelineData?.data || [];
    const pipelineWaiting = rawSources
      .filter((s: any) => {
        const sid = s.suttaHint || s.sutta_id;
        if (!sid || selections[sid] || mappingWaiting.includes(sid)) return false;
        const stages = s.stages || [];
        // If it's done with generation, it's a candidate for image matching
        return stages.some((st: any) => (st.stage === "generation" || st.stage === "dubbing") && (st.status === "completed" || st.status === "done" || st.status === "valid"));
      })
      .map((s: any) => s.suttaHint || s.sutta_id);

    return [...mappingWaiting, ...pipelineWaiting];
  }, [suggestedSuttas, selections, pipelineData]);

  const waitingSuttaStats = useMemo(() => {
    // 1. Map each panel to the suttas it's suggested for
    const panelToSuttas = candidates.map(c => {
      const sids = new Set<string>();
      const mapping = panelMappings?.[c.panel_id];
      if (mapping) {
        const match = mapping.mapping?.match(/SUTTA:\s*(AN\s+[0-9.]+)/i);
        if (match) sids.add(match[1].toUpperCase());
        mapping.possible_sutta_names?.forEach((name: string) => {
          const m2 = name.match(/(AN\s+[0-9.]+)/i);
          if (m2) sids.add(m2[1].toUpperCase());
        });
      }
      c.tags.proposals?.forEach(p => {
        if (p.sutta_id) sids.add(p.sutta_id.toUpperCase());
      });
      return sids;
    });

    // 2. Count panels for each waiting sutta
    return waitingSuttas.map(sid => {
      const sidUpper = sid.toUpperCase();
      let count = 0;
      for (const sids of panelToSuttas) {
        if (sids.has(sidUpper)) count++;
      }
      return { sid, count };
    });
  }, [waitingSuttas, candidates, panelMappings]);

  const suggestionsForActiveSutta = useMemo(() => {
    if (!suttaId) return [];
    const sidUpper = suttaId.toUpperCase();
    return candidates.filter(c => {
      // 1. From mapping grunt
      const mapping = panelMappings?.[c.panel_id];
      const inMapping = mapping && (
        mapping.mapping?.toUpperCase().includes(sidUpper) ||
        mapping.possible_sutta_names?.some((name: string) => name.toUpperCase().includes(sidUpper))
      );
      if (inMapping) return true;

      // 2. From candidate proposals bone
      return c.tags.proposals?.some(p => p.sutta_id?.toUpperCase() === sidUpper);
    });
  }, [candidates, suttaId, panelMappings]);

  const fetchCandidates = async () => {
    try {
      const res = await fetch("/api/images/candidates?t=" + Date.now());
      if (!res.ok) throw new Error("API fail");
      const data = await res.json();
      setCandidates(data.candidates || []);
      setSelections(data.selections || {});
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchMappings = async () => {
    try {
      const mappingRes = await fetch("/api/images/sutta-panel-mapping");
      if (mappingRes.ok) {
        setPanelMappings(await mappingRes.json());
      }
    } catch (e) {
      console.warn("Mapping fetch failed", e);
    }
  };

  const fetchPipeline = async () => {
    try {
      const pipeRes = await fetch("/api/pipeline/status");
      if (pipeRes.ok) {
        setPipelineData(await pipeRes.json());
      }
    } catch (e) {
      console.warn("Pipeline status fetch failed", e);
    }
  };

  const fetchSutta = async () => {
    if (!suttaId) return;
    try {
      const res = await fetch(`/api/pipeline/sutta-segments?sutta_id=${encodeURIComponent(suttaId)}`);
      if (res.ok) {
        setSuttaData(await res.json());
      } else {
        setSuttaData(null);
      }
    } catch {
      setSuttaData(null);
    }

    // Auto-select if sutta has selection grunt
    if (selections[suttaId]) {
      const sel = selections[suttaId];
      setSelectedPanelId(sel.panel_id);
      setReason(sel.selection_reason);
      setSelectionWord(sel.selection_word || "");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCandidates(), fetchMappings(), fetchPipeline()]);
      setLoading(false);
    };
    init();
  }, []); // Only once on mount

  useEffect(() => {
    fetchSutta();
  }, [suttaId, selections]); // When suttaId changes or selections updated

  const handleSave = async () => {
    if (!suttaId || !selectedPanelId) return;
    setSaving(true);
    setError(null);

    const panel = candidates.find(c => c.panel_id === selectedPanelId);
    if (!panel) return;

    try {
      const res = await fetch("/api/images/selection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sutta_id: suttaId,
          panel_id: selectedPanelId,
          image_url: panel.imageUrl,
          selection_reason: reason,
          selection_word: selectionWord,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save fail");
      }
      await fetchCandidates(); // Refresh selections
      alert("Selection saved and approved grunt!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMetadata = async (panelId: string, caption: string) => {
    try {
      const res = await fetch(`/api/images/panel/${panelId}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) throw new Error("Update fail");
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: "40px" }}>Cave man loading images...</div>;

  const filtered = candidates.filter(c => {
    const searchLower = filter.toLowerCase();
    const matchesSearch = c.panel_id.toLowerCase().includes(searchLower) ||
      c.tags.proposals.some(p => p.canonical_word.toLowerCase().includes(searchLower));
    return matchesSearch;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "sans-serif", padding: "40px" }}>
      <header style={{ marginBottom: "30px", borderBottom: "2px solid #e2e8f0", paddingBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900 }}>IMAGE SELECTOR</h1>

          <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            <Link to="/dev/pipeline" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textDecoration: 'none', padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>Pipeline</Link>
            <Link to="/dev/image-selector" style={{ fontSize: '11px', fontWeight: 800, background: '#0f172a', color: '#fff', textDecoration: 'none', padding: '4px 10px', borderRadius: '6px' }}>Image Selector</Link>
            <Link to="/dev/ai" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textDecoration: 'none', padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>Experimental AI</Link>
            <Link to="/dev/chat" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textDecoration: 'none', padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>Chat</Link>
          </div>

          <p style={{ color: "#64748b", marginTop: "12px" }}>Match Buddha bones with mountain images. Grunt.</p>
        </div>
        <button onClick={() => window.history.back()} style={{ padding: "8px 16px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}>Back to Dash</button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "450px 1fr", gap: "30px" }}>
        {/* Control Panel grunt */}
        <section style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", height: "fit-content", position: "sticky", top: "40px", maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px" }}>SELECTION</h2>

          {suttaData && (
            <div style={{ marginBottom: "20px", padding: "12px", background: "#fdf2f8", borderRadius: "8px", border: "1px solid #fbcfe8" }}>
               <div style={{ fontSize: "10px", fontWeight: 900, color: "#9d174d", textTransform: "uppercase" }}>SUTTA TEXT</div>
               <div style={{ fontSize: "12px", color: "#831843", marginTop: "6px", maxHeight: "150px", overflow: "auto", lineHeight: 1.4 }}>
                 {suttaData.segments?.slice(0, 5).map((seg: any) => (
                   <div key={seg.segment_id} style={{ marginBottom: "4px" }}>{seg.text}</div>
                 ))}
                 {suttaData.segments?.length > 5 && <div style={{ fontSize: "10px", color: "#be185d" }}>... more text in segments bone grunt</div>}
               </div>
            </div>
          )}

          <label style={{ display: "block", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "6px" }}>SUTTA ID</span>
            <input
              value={suttaId}
              onChange={e => setSuttaId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="e.g. AN 1.1"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: 700 }}
            />
          </label>

          <div style={{ marginBottom: "20px" }}>
            <span style={{ fontSize: "10px", fontWeight: 900, color: "#64748b", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Quick Suggestions</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "150px", overflowY: "auto", padding: "4px" }}>
              {suggestedSuttas.map(sid => (
                <button
                  key={sid}
                  onClick={() => setSuttaId(sid)}
                  style={{
                    fontSize: "10px", fontWeight: 800, padding: "4px 8px", borderRadius: "4px",
                    background: suttaId.toUpperCase() === sid ? "#0f172a" : "#f1f5f9",
                    color: suttaId.toUpperCase() === sid ? "#fff" : "#475569",
                    border: "none", cursor: "pointer",
                    textDecoration: selections[sid] ? "line-through" : "none",
                    opacity: selections[sid] ? 0.5 : 1
                  }}
                >
                  {sid}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: "block", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "6px" }}>COMPRESSED WORD</span>
            <input
              value={selectionWord}
              onChange={e => setSelectionWord(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="e.g. mindfulness"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: 700 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "6px" }}>WHY THIS IMAGE? (MANUAL NOTE)</span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="Reason for selection grunt..."
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", minHeight: "100px" }}
            />
          </label>

          <div style={{ marginBottom: "20px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "6px" }}>PANEL SELECTED</span>
            {selectedPanelId ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f0fdf4", padding: "10px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                <ImageIcon size={16} color="#166534" />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#166534" }}>{selectedPanelId}</span>
                <button onClick={() => setSelectedPanelId(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer" }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ fontSize: "14px", color: "#94a3b8", fontStyle: "italic" }}>No panel picked yet. Grunt.</div>
            )}
          </div>

          {error && <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px", fontWeight: 700 }}>{error}</div>}

          <button
            onClick={handleSave}
            disabled={!suttaId || !selectedPanelId || saving}
            style={{
              width: "100%", padding: "14px", borderRadius: "8px", border: "none",
              background: "#0f172a", color: "#ffffff", fontWeight: 800, fontSize: "14px",
              cursor: "pointer", opacity: (!suttaId || !selectedPanelId || saving) ? 0.5 : 1
            }}
          >
            {saving ? "SAVING..." : "APPROVE SELECTION"}
          </button>

          {selections[suttaId] && (
            <div style={{ marginTop: "20px", padding: "12px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "10px", fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase" }}>Current Selection</div>
              <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>{selections[suttaId].panel_id}</div>
              <div style={{ fontSize: "11px", color: "#1d4ed8", marginTop: "2px" }}>{selections[suttaId].created_at}</div>
              <button
                onClick={() => {
                  setSelectedPanelId(selections[suttaId].panel_id);
                  setReason(selections[suttaId].selection_reason || "");
                }}
                style={{ marginTop: "8px", fontSize: "11px", fontWeight: 800, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                EDIT SELECTION
              </button>
            </div>
          )}
        </section>

        {/* Gallery grunt */}
        <section>
          <div style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            marginBottom: "20px"
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#1e293b", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <ImageIcon size={18} />
              APPROVAL QUEUE
            </h3>
            {waitingSuttas.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {waitingSuttaStats.map(({ sid, count }) => (
                  <button
                    key={sid}
                    onClick={() => setSuttaId(sid)}
                    style={{
                      fontSize: "12px", fontWeight: 800, padding: "6px 12px", borderRadius: "8px",
                      background: suttaId.toUpperCase() === sid.toUpperCase() ? "#2563eb" : "#f1f5f9",
                      color: suttaId.toUpperCase() === sid.toUpperCase() ? "#fff" : "#475569",
                      border: "1px solid #cbd5e1", cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    {sid}
                    {count > 0 && (
                      <span style={{
                        background: suttaId.toUpperCase() === sid.toUpperCase() ? "rgba(255,255,255,0.2)" : "#cbd5e1",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        fontSize: "10px"
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#64748b", fontStyle: "italic" }}>No suttas waiting for approval. Good job, grunt!</div>
            )}
          </div>

          <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={18} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search panels or canonical words..."
                style={{ width: "100%", padding: "12px 12px 12px 40px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
              />
            </div>
          </div>

          {suggestionsForActiveSutta.length > 0 && (
            <div style={{ marginBottom: "30px", padding: "20px", background: "#fdf4ff", borderRadius: "12px", border: "2px solid #f5d0fe" }}>
               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#701a75", marginBottom: "16px", textTransform: "uppercase" }}>Mapping Suggestions for {suttaId}</h3>
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                  {suggestionsForActiveSutta.map(c => (
                    <PanelCard
                      key={c.panel_id}
                      c={c}
                      suttaId={suttaId}
                      selectedPanelId={selectedPanelId}
                      selections={selections}
                      panelMappings={panelMappings}
                      onSelect={(pid, reason, word) => {
                        setSelectedPanelId(pid);
                        setReason(reason);
                        setSelectionWord(word);
                      }}
                      onUpdateMetadata={handleUpdateMetadata}
                    />
                  ))}
               </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
            {filtered.map(c => (
              <PanelCard
                key={c.panel_id}
                c={c}
                suttaId={suttaId}
                selectedPanelId={selectedPanelId}
                selections={selections}
                panelMappings={panelMappings}
                onSelect={(pid, reason, word) => {
                  setSelectedPanelId(pid);
                  setReason(reason);
                  setSelectionWord(word);
                }}
                onUpdateMetadata={handleUpdateMetadata}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PanelCard({ c, suttaId, selectedPanelId, selections, panelMappings, onSelect, onUpdateMetadata }: {
  c: Candidate;
  suttaId: string;
  selectedPanelId: string | null;
  selections: Record<string, Selection>;
  panelMappings: any;
  onSelect: (pid: string, reason: string, word: string) => void;
  onUpdateMetadata: (pid: string, caption: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCaption, setEditedCaption] = useState(c.tags.caption || "");
  const isSelected = selectedPanelId === c.panel_id;
  const isUsedElsewhere = Object.values(selections).some(s => s.panel_id === c.panel_id && s.sutta_id !== suttaId);
  const myProposal = c.tags.proposals?.find(p => p.sutta_id === suttaId);
  const mappingSuggestion = panelMappings?.[c.panel_id];
  const isSuggested = suttaId && (
    mappingSuggestion?.mapping?.toUpperCase().includes(suttaId.toUpperCase()) ||
    mappingSuggestion?.possible_sutta_names?.some((name: string) => name.toUpperCase().includes(suttaId.toUpperCase()))
  );

  return (
    <div
      onClick={() => {
        if (isEditing) return;
        if (myProposal) {
          onSelect(c.panel_id, myProposal.reason, myProposal.canonical_word);
        } else if (c.tags.caption) {
          onSelect(c.panel_id, c.tags.caption, "");
        } else {
          onSelect(c.panel_id, "", "");
        }
      }}
      style={{
        background: "#ffffff", borderRadius: "12px", border: `3px solid ${isSelected ? "#2563eb" : (isSuggested ? "#d946ef" : "#e2e8f0")}`,
        overflow: "hidden", cursor: "pointer", transition: "all 0.2s",
        boxShadow: isSelected ? "0 10px 15px -3px rgba(37, 99, 235, 0.2)" : "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
      }}
    >
      <div style={{ aspectRatio: "4/3", background: "#f1f5f9", overflow: "hidden", position: "relative" }}>
        <img src={c.imageUrl} alt={c.panel_id} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {isSelected && (
          <div style={{ position: "absolute", top: "8px", right: "8px", background: "#2563eb", color: "white", padding: "4px", borderRadius: "50%" }}>
            <Check size={16} />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
          style={{ position: "absolute", top: "8px", left: "8px", background: "#fff", border: "1px solid #cbd5e1", padding: "4px", borderRadius: "6px", cursor: "pointer" }}
        >
          <Edit2 size={14} />
        </button>
        {isUsedElsewhere && (
          <div style={{ position: "absolute", bottom: "0", insetX: "0", background: "rgba(15, 23, 42, 0.6)", color: "white", fontSize: "10px", padding: "6px", textAlign: "center", fontWeight: 700 }}>
            USED IN OTHER SUTTA
          </div>
        )}
      </div>
      <div style={{ padding: "16px" }}>
        <div style={{ fontWeight: 900, fontSize: "14px", color: "#1e293b" }}>{c.panel_id}</div>

        {isEditing ? (
          <div style={{ marginTop: "8px" }}>
            <textarea
              value={editedCaption}
              onChange={e => setEditedCaption(e.target.value)}
              style={{ width: "100%", fontSize: "11px", padding: "8px", borderRadius: "6px", border: "1px solid #2563eb", minHeight: "60px" }}
              autoFocus
            />
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await onUpdateMetadata(c.panel_id, editedCaption);
                setIsEditing(false);
              }}
              style={{ marginTop: "4px", width: "100%", padding: "6px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "10px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
            >
              <Save size={12} /> SAVE METADATA
            </button>
          </div>
        ) : (
          c.tags.caption && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#64748b", fontStyle: "italic", borderLeft: "2px solid #e2e8f0", paddingLeft: "8px" }}>
              {c.tags.caption}
            </div>
          )
        )}

        {c.tags.modern && !isEditing && (
          <div style={{ marginTop: "4px", fontSize: "10px", color: "#94a3b8", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
             {c.tags.modern}
          </div>
        )}

        {myProposal && (
           <div style={{ marginTop: "12px", padding: "10px", background: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd" }}>
             <div style={{ fontSize: "10px", fontWeight: 900, color: "#0369a1", textTransform: "uppercase" }}>PROPOSAL FOR {suttaId}</div>
             <div style={{ fontSize: "13px", fontWeight: 800, marginTop: "4px", color: "#0c4a6e" }}>Canonical: {myProposal.canonical_word}</div>
             <div style={{ fontSize: "11px", color: "#0369a1", marginTop: "4px", lineHeight: 1.4 }}>Reason: {myProposal.reason}</div>
             <div style={{ fontSize: "10px", color: "#7dd3fc", marginTop: "6px", fontWeight: 800 }}>AI SCORE: {myProposal.score}</div>
           </div>
        )}

        {isSuggested && (
           <div style={{ marginTop: "12px", padding: "10px", background: "#fdf4ff", borderRadius: "8px", border: "1px solid #f5d0fe" }}>
             <div style={{ fontSize: "10px", fontWeight: 900, color: "#701a75", textTransform: "uppercase" }}>MAPPING SUGGESTION</div>
             <div style={{ fontSize: "11px", color: "#701a75", marginTop: "4px", lineHeight: 1.4 }}>
                {mappingSuggestion.mapping ?
                  mappingSuggestion.mapping.split('\n').filter((line: string) => line.includes('REASON:') || line.includes('SUTTA:')).join(' ') :
                  mappingSuggestion.possible_sutta_names?.join(', ')
                }
             </div>
             <button
               onClick={(e) => {
                 e.stopPropagation();
                 const m = mappingSuggestion.mapping || "";
                 const reasonMatch = m.match(/REASON:\s*(.*)/i);
                 onSelect(c.panel_id, reasonMatch ? reasonMatch[1].trim() : (m || mappingSuggestion.possible_sutta_names?.[0] || ""), "");
               }}
               style={{ marginTop: "8px", width: "100%", fontSize: "10px", fontWeight: 800, color: "#d946ef", background: "white", border: "1px solid #f5d0fe", padding: "6px", borderRadius: "6px", cursor: "pointer" }}
             >
               USE THIS MAPPING
             </button>
           </div>
        )}

        {!myProposal && !isSuggested && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px" }}>
              No specific proposal for {suttaId || "this sutta"}
            </div>
            {suttaId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(c.panel_id, `Manual proposal for ${suttaId}`, "");
                }}
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px",
                  background: "#fff", color: "#475569", border: "1px solid #cbd5e1",
                  fontSize: "11px", fontWeight: 700, cursor: "pointer"
                }}
              >
                CREATE PROPOSAL
              </button>
            )}
          </div>
        )}

        {isUsedElsewhere && (
          <div style={{ marginTop: "8px" }}>
            {Object.values(selections).filter(s => s.panel_id === c.panel_id).map(s => (
              <div key={s.sutta_id} style={{ fontSize: "10px", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", marginBottom: "4px" }}>
                <strong>{s.sutta_id}</strong>: {s.selection_word || "(no word)"}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "8px", display: "flex", gap: "10px" }}>
           <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>PG {c.page}</span>
           <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>{c.source_book_id.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
