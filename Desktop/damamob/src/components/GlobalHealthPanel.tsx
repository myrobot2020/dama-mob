import { useEffect, useMemo, useState } from "react";
import { Activity, Zap, AlertCircle } from "lucide-react";

const REGIONS = [
  { id: "local", name: "Local Dev", url: "http://localhost:8031", flag: "💻" },
  { id: "mumbai", name: "Mumbai", url: "https://dama-mob-qbqfec72dq-el.a.run.app", flag: "🇮🇳" },
  { id: "tokyo", name: "Tokyo", url: "https://dama-mob-qbqfec72dq-an.a.run.app", flag: "🇯🇵" },
  { id: "belgium", name: "Belgium", url: "https://dama-mob-qbqfec72dq-ew.a.run.app", flag: "🇧🇪" },
  { id: "iowa", name: "Iowa", url: "https://dama-mob-qbqfec72dq-uc.a.run.app", flag: "🇺🇸" },
];

export function GlobalHealthPanel() {
  const [statuses, setStatuses] = useState<Record<string, { latency: number; ok: boolean; loading: boolean; checks?: any; usage?: any }>>({});

  const checkHealth = async (region: typeof REGIONS[0]) => {
    const start = performance.now();
    try {
      // Use relative URL for local to bypass CORS
      const url = region.id === 'local' ? '/api/health' : `${region.url}/api/health`;
      const res = await fetch(url);
      const data = await res.json();
      const latency = Math.round(performance.now() - start);
      setStatuses(prev => ({
        ...prev,
        [region.id]: {
          latency,
          ok: data.status === 'healthy',
          loading: false,
          checks: data.checks,
          usage: data.usage
        }
      }));
    } catch (e) {
      setStatuses(prev => ({ ...prev, [region.id]: { latency: 0, ok: false, loading: false } }));
    }
  };

  useEffect(() => {
    REGIONS.forEach(r => {
      setStatuses(prev => ({ ...prev, [r.id]: { latency: 0, ok: false, loading: true } }));
      checkHealth(r);
    });
    const timer = setInterval(() => REGIONS.forEach(checkHealth), 30000);
    return () => clearInterval(timer);
  }, []);

  const totalUsage = useMemo(() => {
    return statuses['local']?.usage || statuses['mumbai']?.usage || {};
  }, [statuses]);

  return (
    <div className="space-y-6 mb-8 px-2">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {REGIONS.map(r => {
          const s = statuses[r.id];
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-xl">{r.flag}</span>
                <div>
                  <div className="font-mono text-[10px] font-bold text-slate-800 uppercase tracking-tight">{r.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {s?.loading ? (
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                    ) : s?.ok ? (
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                    ) : (
                      <AlertCircle size={10} className="text-rose-500" />
                    )}
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tight">
                      {s?.loading ? "checking..." : s?.ok ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
              </div>
              {s?.ok && (
                <div className="text-right">
                  <div className="text-[9px] font-mono text-slate-400">LATENCY</div>
                  <div className={`text-xs font-mono font-bold ${s.latency < 150 ? 'text-emerald-500' : s.latency < 400 ? 'text-amber-500' : 'text-rose-500'}`}>
                    {s.latency}ms
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-indigo-600" />
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Dependency Heartbeats</h3>
          </div>
          <div className="space-y-3">
            {['supabase', 'gcs', 'upstash', 'openai'].map(dep => {
              const ok = statuses['local']?.checks?.[dep] || statuses['mumbai']?.checks?.[dep];
              return (
                <div key={dep} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                  <span className="font-mono text-[11px] text-slate-500 uppercase">{dep}</span>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                    <span className={`font-mono text-[10px] font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {ok ? 'HEALTHY' : 'FAILING'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-amber-500" />
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Usage Stats (Today)</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
              <div className="text-[9px] font-mono text-slate-400 uppercase mb-1">AI Requests</div>
              <div className="text-xl font-mono font-bold text-slate-800">{totalUsage.ai_requests_today || 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
              <div className="text-[9px] font-mono text-slate-400 uppercase mb-1">Sutta Reads</div>
              <div className="text-xl font-mono font-bold text-slate-800">{totalUsage.sutta_reads_today || 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
              <div className="text-[9px] font-mono text-slate-400 uppercase mb-1">Quiz Submits</div>
              <div className="text-xl font-mono font-bold text-slate-800">{totalUsage.quiz_submits_today || 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
              <div className="text-[9px] font-mono text-slate-400 uppercase mb-1">DB Queries</div>
              <div className="text-xl font-mono font-bold text-slate-800">{totalUsage.db_queries_today || 0}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
