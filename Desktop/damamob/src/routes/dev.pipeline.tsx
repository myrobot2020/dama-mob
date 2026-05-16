import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useRef } from "react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const Route = createFileRoute("/dev/pipeline")({
  component: PipelineMonitor,
});

const COLUMNS = [
  { label: ["FETCH", "SOURCE"], key: "source" },
  { label: ["SCAN", "PANELS"], key: "panel_extraction" },
  { label: ["DOWNLOAD", "AUDIO"], key: "audio" },
  { label: ["WHISPER", "TRANS"], key: "transcript" },
  { label: ["MATCH", "SUTTA"], key: "sutta_match" },
  { label: ["SEGMENT", "TEXT"], key: "segments" },
  { label: ["ALIGN", "AUDIO"], key: "audio_timestamps" },
  { label: ["EXTRACT", "KEYS"], key: "keys" },
  { label: ["MAP", "NAMES"], key: "names" },
  { label: ["GEN", "CONTENT"], key: "generation" },
  { label: ["TRANSLATE", "JA"], key: "translation" },
  { label: ["DUBBING", "JA"], key: "dubbing" },
  { label: ["MATCH", "IMAGE"], key: "image_match" },
  { label: ["MERGE", "JSON"], key: "edit_json" },
  { label: ["VALIDATE", "DATA"], key: "validation" },
  { label: ["SEAL", "PACKAGE"], key: "seal" },
  { label: ["CLOUD", "UPLOAD"], key: "upload" },
];

const doneStatuses = new Set(["completed", "valid", "sealed", "uploaded", "selected", "done"]);

function getStatusTheme(rawStatus: string) {
  const status = rawStatus.toLowerCase();
  if (doneStatuses.has(status)) return { bg: "transparent", text: "#000", border: "#3d3124", code: "✓" };
  if (status === "running") return { bg: "#cb997e", text: "#fff", border: "#3d3124", code: "⟳" };
  if (status === "queued") return { bg: "transparent", text: "#8d816b", border: "#3d3124", code: "⏲" };
  if (status === "failed") return { bg: "#6a040f", text: "#fff", border: "#3e0106", code: "!" };
  if (status.includes("review")) return { bg: "#ddbea9", text: "#3d3124", border: "#3d3124", code: "V" };
  return { bg: "transparent", text: "#bcac8d", border: "#dcd0b988", code: "·" };
}

function PipelineMonitor() {
  const [data, setData] = useState<any>(null);
  const [editor, setEditor] = useState<any>(null);
  const [selectedSutta, setSelectedSutta] = useState<any>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    fetch(`/api/pipeline/status?t=${Date.now()}`, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(snapshot => {
        setData(snapshot);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  if (error && !data) {
    return (
      <div style={{ padding: '40px', background: '#f2e8cf', minHeight: '100vh', color: '#3d3124', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ marginBottom: '10px' }}>Backend Offline</h2>
        <p style={{ opacity: 0.7, marginBottom: '20px' }}>{error}</p>
        <button
          onClick={() => fetchData()}
          style={{ padding: '10px 20px', background: '#3d3124', color: '#f2e8cf', border: 'none', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}
        >
          RETRY CONNECTION
        </button>
        <div style={{ marginTop: '20px', fontSize: '11px', opacity: 0.5 }}>
          Try running: <code>npm run dev:all</code>
        </div>
      </div>
    );
  }

  if (!data) return <div style={{ padding: '20px', background: '#f2e8cf', minHeight: '100vh', color: '#3d3124' }}>BOOTING PLANT...</div>;

  const sources = data.sources || [];

  const getStatusInfo = (sutta: any, key: string) => {
    const isReplaying = replayingId === sutta.suttaHint;

    // If replaying, we treat it as if it has no completed stages yet
    const effectiveStages = isReplaying ? [] : sutta.stages;

    if (!isReplaying && (key === 'image_match' || key === 'images') && sutta.imageSelection?.id) {
       return { status: 'completed' };
    }

    const info = effectiveStages.find((st: any) => st.stage === key);
    if (info) return info;

    // "What's Next" Logic: Find the first column that isn't done
    const firstIncomplete = COLUMNS.find(c => {
       const sInfo = effectiveStages.find((st: any) => st.stage === c.key);
       return !sInfo || !doneStatuses.has(sInfo.status);
    });

    if (firstIncomplete && firstIncomplete.key === key) {
       return { status: 'queued' };
    }

    return { status: 'wait' };
  };

  const handleReplay = async (suttaId: string) => {
    if (!confirm(`Confirm REPLAY for ${suttaId}? This will reset the pipeline for this sutta.`)) return;
    setReplayingId(suttaId);
    await fetch(`/api/pipeline/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sutta_id: suttaId })
    });
    fetchData();
    setTimeout(() => setReplayingId(null), 1500);
  };

  const openEditor = async (sutta: any) => {
    setEditor({ title: sutta.suttaHint, suttaId: sutta.suttaHint, draft: "Loading...", status: "loading" });
    const res = await fetch(`/api/suttas/${encodeURIComponent(sutta.suttaHint)}`);
    const doc = await res.json();
    setEditor({ title: sutta.suttaHint, suttaId: doc.sutta_id || sutta.suttaHint, draft: JSON.stringify(doc, null, 2), status: "idle" });
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + sizes[i];
  };

  return (
    <div style={{ height: '100vh', padding: '12px', background: '#f2e8cf', color: '#3d3124', fontFamily: '"Segoe UI", Roboto, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header & Resources */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 240px', gap: '20px', marginBottom: '12px', alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: '#8d816b', fontWeight: 800 }}>LOCAL DATA PLANT</div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, fontFamily: 'Georgia, serif' }}>Pipeline Monitor</h1>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
             <Link to="/dev/pipeline" style={{ fontSize: '9px', fontWeight: 800, background: '#3d3124', color: '#f2e8cf', textDecoration: 'none', padding: '3px 6px', borderRadius: '2px' }}>Pipeline</Link>
             <Link to="/dev/ai" style={{ fontSize: '9px', fontWeight: 800, color: '#3d3124', textDecoration: 'none', padding: '3px 6px', border: '1px solid #3d3124', borderRadius: '2px' }}>Experimental AI</Link>
             <Link to="/dev/chat" style={{ fontSize: '9px', fontWeight: 800, color: '#3d3124', textDecoration: 'none', padding: '3px 6px', border: '1px solid #3d3124', borderRadius: '2px' }}>Chat</Link>
          </div>

          <div style={{ marginTop: '12px', fontSize: '10px', color: '#8d816b', fontWeight: 800 }}>
             TOTAL DONE: {data.queues?.completed || 0} | QUEUED: {data.queues?.queued || 0}
          </div>
        </div>

        <section style={{ background: 'rgba(61, 49, 36, 0.05)', padding: '10px 16px', borderRadius: '4px', border: '1px solid #bcac8d' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 30px' }}>
            {['CPU', 'DISK', 'GPU', 'RAM'].map(key => {
              const k = key.toLowerCase().split(' ')[0];
              const res = data.resources?.[k];
              const percent = res?.percent || 0;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '8px', fontWeight: 900, width: '30px' }}>{key}</span>
                  <div style={{ flex: 1, height: '4px', background: '#dcd0b9', borderRadius: '1px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: '#b08d57' }} />
                  </div>
                  <span style={{ fontSize: '8px', fontWeight: 900, width: '30px', textAlign: 'right' }}>{percent}%</span>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'end' }}>
          <div style={{ fontSize: '8px', color: '#8d816b', width: '100%', textAlign: 'right', marginTop: '4px' }}>LIVE SYNC: 2S</div>
        </div>
      </div>

      {/* Main Table */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f2e8cf' }}>
            <tr style={{ background: '#e7d8b1' }}>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #3d3124', width: '140px', fontSize: '9px' }}>SUTTA / ARTIFACTS</th>
              {COLUMNS.map(c => (
                <th key={c.key} style={{ padding: '4px 1px', borderBottom: '1px solid #3d3124', verticalAlign: 'bottom', width: '32px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '7px', fontWeight: 900, color: '#3d3124', lineHeight: 1.1 }}>
                    {c.label.map((word, idx) => <span key={idx}>{word}</span>)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #dcd0b988', opacity: replayingId === s.suttaHint ? 0.6 : 1, transition: 'opacity 0.3s' }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span title={s.title || s.suttaHint} style={{ fontWeight: 800, fontSize: '11px', color: '#3d3124', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', display: 'block' }}>
                        {s.title || s.suttaHint}
                      </span>
                      <a
                        href={s.sourceUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#8d816b', display: 'inline-flex' }}
                        title="Open Source"
                      >
                        <span style={{ fontSize: '10px' }}>↗</span>
                      </a>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                    <button onClick={() => openEditor(s)} style={{ fontSize: '7px', fontWeight: 900, padding: '1px 3px', borderRadius: '2px', background: 'transparent', border: '1px solid #bcac8d', color: '#3d3124', cursor: 'pointer' }}>json</button>
                    <button onClick={() => setSelectedSutta(s)} style={{ fontSize: '7px', fontWeight: 900, padding: '1px 3px', borderRadius: '2px', background: '#3d3124', border: '1px solid #3d3124', color: '#f2e8cf', cursor: 'pointer' }}>summary</button>
                  </div>
                </td>
                {COLUMNS.map(c => {
                  const info = getStatusInfo(s, c.key);
                  const theme = getStatusTheme(info.status);
                  const m = info.metrics || {};
                  const tooltip = info.status === 'wait' ? '' : `TIME: ${info.duration ? Math.round(info.duration) + 's' : '-'} | IN: ${formatSize(m.input_size)} | OUT: ${formatSize(m.output_size)}`;

                  return (
                    <td key={c.key} style={{ padding: '2px', textAlign: 'center' }}>
                      <div title={tooltip} style={{ width: '18px', height: '18px', margin: '0 auto', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '2px', fontSize: '9px', fontWeight: 900, color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: info.status === 'wait' ? 0.3 : 1, cursor: 'help' }}>
                         {theme.code}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor && (
        <div style={{ position: 'fixed', inset: '0 0 0 auto', width: '500px', background: '#f2e8cf', borderLeft: '2px solid #3d3124', padding: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontFamily: 'Georgia, serif' }}>{editor.title}</h2>
            <button onClick={() => setEditor(null)} style={{ fontSize: '10px', background: 'transparent', border: '1px solid #bcac8d', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>CLOSE</button>
          </div>
          <textarea value={editor.draft} onChange={e => setEditor({ ...editor, draft: e.target.value })} style={{ flex: 1, background: 'rgba(255,255,255,0.2)', border: '1px solid #bcac8d', borderRadius: '4px', padding: '10px', fontFamily: 'monospace', fontSize: '11px', color: '#3d3124' }} />
          <button style={{ marginTop: '12px', padding: '10px', background: '#3d3124', color: '#f2e8cf', border: 'none', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}>SAVE & VALIDATE</button>
        </div>
      )}

      {selectedSutta && (
        <SummaryPanel
           sutta={selectedSutta}
           onClose={() => setSelectedSutta(null)}
           onReplay={(id: string) => { handleReplay(id); setSelectedSutta(null); }}
        />
      )}
    </div>
  );
}

function SummaryPanel({ sutta, onClose, onReplay }: any) {
  const [pos, setPos] = useState({ x: 150, y: 80 });
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
    };
    const handleMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pos]);

  let totalTime = 0;
  sutta.stages.forEach((s: any) => totalTime += (s.duration || 0));

  const timeSeriesData = [
    { time: '14:16', ram: 2.1, gpu: 45, latency: 12.5 },
    { time: '14:17', ram: 2.3, gpu: 55, latency: 10.2 },
    { time: '14:18', ram: 2.2, gpu: 78, latency: 8.7 },
    { time: '14:19', ram: 2.4, gpu: 70, latency: 9.1 },
    { time: '14:20', ram: 2.34, gpu: 78, latency: 8.74 },
  ];

  const resourceData = [
    { name: 'Embedding', value: 42, color: '#8884d8' },
    { name: 'Retrieval', value: 28, color: '#82ca9d' },
    { name: 'Scoring', value: 18, color: '#ffc658' },
    { name: 'Other', value: 12, color: '#ff8042' },
  ];

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, width: '920px', height: '580px',
      background: '#1a1a1a', color: '#e0e0e0', borderRadius: '8px', display: 'flex',
      flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
      border: '1px solid #333', zIndex: 2000
    }}>

      {/* Header (Draggable) */}
      <div
        onMouseDown={handleMouseDown}
        style={{ padding: '14px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', background: '#222' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{sutta.suttaHint} › OVERVIEW</span>
          <span style={{ fontSize: '10px', background: '#1b4332', color: '#74c69d', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>✓ STAGE DETAIL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => onReplay(sutta.suttaHint)} style={{ background: '#b08d57', border: 'none', color: '#fff', padding: '5px 14px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>REPLAY</button>
          <span style={{ fontSize: '11px', color: '#666' }}>Started: 2025-05-24 14:21:03</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: '30px', overflowY: 'auto' }}>

        {/* Col 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>PERFORMANCE SUMMARY</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <MetricBox label="LATENCY" value={Math.round(totalTime * 100) / 100 + 's'} sub="p95: 112s" />
              <MetricBox label="PEAK RAM" value="1.2 GB" sub="avg: 4.2 GB" />
              <MetricBox label="GPU UTIL" value="65%" sub="avg: 42%" color="#ffc658" />
              <MetricBox label="THROUGHPUT" value="6.2" sub="units/sec" />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>TIME SERIES (Last 5 Minutes)</h3>
            <MiniGraph label="RAM (GB)" data={timeSeriesData} dataKey="ram" color="#8884d8" />
            <MiniGraph label="GPU UTIL (%)" data={timeSeriesData} dataKey="gpu" color="#82ca9d" />
            <MiniGraph label="LATENCY (s)" data={timeSeriesData} dataKey="latency" color="#3182bd" />
          </section>
        </div>

        {/* Col 2 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>DATA FLOW</h3>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <DataRow label="Input Files" value="24" />
              <DataRow label="Total Processed" value="1.2 GB" />
              <DataRow label="Network IO" value="450 MB" />
              <DataRow label="Database Writes" value="12,402" />
              <DataRow label="Cache Hits" value="82%" />
              <DataRow label="Errors Logged" value="0" />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>TOP CONTRIBUTORS (LATENCY)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <MatchRow rank={1} name="Whisper Transcript" score={0.65} />
              <MatchRow rank={2} name="Sutta Matching" score={0.22} />
              <MatchRow rank={3} name="Translation" score={0.08} />
              <MatchRow rank={4} name="Other" score={0.05} />
            </div>
          </section>
        </div>

        {/* Col 3 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>RESOURCE ALLOCATION</h3>
            <div style={{ height: '120px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={resourceData} innerRadius={35} outerRadius={50} paddingAngle={5} dataKey="value">
                    {resourceData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop: '10px' }}>
              {resourceData.map(item => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', background: item.color, borderRadius: '2px' }} />
                    <span style={{ color: '#aaa' }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 600 }}>{item.value}%</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>SUB-TASKS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '12px', borderLeft: '1px solid #333' }}>
              <TraceItem name="Initialize" time="0.1s" />
              <TraceItem name="Fetch Assets" time="2.4s" />
              <TraceItem name="Compute" time="12.5s" active />
              <TraceItem name="Finalize" time="0.8s" />
            </div>
          </section>

          <section>
             <h3 style={{ fontSize: '10px', fontWeight: 800, color: '#555', marginBottom: '14px', letterSpacing: '0.05em' }}>ENV INFO</h3>
             <div style={{ fontSize: '10px', color: '#888', display: 'flex', flexDirection: 'column', gap: '5px' }}>
               <div>Host: worker-node-07</div>
               <div>Runtime: Python 3.11 / Node 20</div>
               <div>GPU: NVIDIA A100 (80GB)</div>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub, color }: any) {
  return (
    <div style={{ background: '#222', padding: '14px', borderRadius: '4px', border: '1px solid #333' }}>
      <div style={{ fontSize: '9px', color: '#666', fontWeight: 800, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: color || '#fff' }}>{value}</div>
      <div style={{ fontSize: '9px', color: '#444', marginTop: '4px' }}>{sub}</div>
    </div>
  );
}

function MiniGraph({ label, data, dataKey, color }: any) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '8px', color: '#555', marginBottom: '4px', fontWeight: 700 }}>{label}</div>
      <div style={{ height: '35px', background: 'rgba(255,255,255,0.02)', borderRadius: '2px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.05} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DataRow({ label, value }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: '6px' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function MatchRow({ rank, name, score }: any) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
        <span style={{ color: '#eee' }}>{rank}. {name}</span>
        <span style={{ color: '#666', fontSize: '10px' }}>{Math.round(score * 100)}%</span>
      </div>
      <div style={{ height: '3px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${score * 100}%`, height: '100%', background: '#b08d57' }} />
      </div>
    </div>
  );
}

function TraceItem({ name, time, active }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', position: 'relative' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: active ? '#fff' : '#333', border: active ? '2px solid #b08d57' : 'none', marginLeft: '-17px', zIndex: 1 }} />
      <span style={{ fontSize: '11px', color: active ? '#fff' : '#666' }}>{name}</span>
      <span style={{ fontSize: '10px', color: '#444', marginLeft: 'auto' }}>{time}</span>
    </div>
  );
}

