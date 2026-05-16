import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GOLDEN_SCENARIOS, evaluateResponse, type GoldenScenario, type EvalResult } from "@/lib/evals";
import { runHarness } from "@/lib/aiHarness";
import * as tools from "@/lib/harnessTools";
import { isUserAdmin } from "@/lib/devMode";
import { Loader2, CheckCircle2, XCircle, Play, AlertTriangle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dev/evals")({
  component: EvalsScreen,
});

type ScenarioRun = {
  scenario: GoldenScenario;
  status: "idle" | "running" | "completed" | "failed";
  result?: any;
  evalResult?: EvalResult;
  error?: string;
};

function EvalsScreen() {
  const [runs, setRuns] = useState<ScenarioRun[]>(
    GOLDEN_SCENARIOS.map(s => ({ scenario: s, status: "idle" }))
  );
  const [isRunningAll, setIsRunningAll] = useState(false);

  const runScenario = async (index: number) => {
    // ... rest of the function
  };

  const runAll = async () => {
    // ... rest of the function
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans p-10">
      <header className="flex justify-between items-start mb-10 border-b border-zinc-800 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="text-emerald-500" size={24} />
            <h1 className="text-3xl font-black tracking-tighter uppercase italic">DAMA EVALS</h1>
          </div>
          <p className="text-zinc-500 text-sm font-medium mb-6">Point 37: Automated Evaluation of BuddhaBot Grounding & Persona</p>

          <div className="flex gap-4">
            <a href="/dev/pipeline" className="text-xs font-bold text-zinc-400 hover:text-white transition-colors border border-zinc-700 px-4 py-2 rounded-lg">Pipeline</a>
            <a href="/dev/image-selector" className="text-xs font-bold text-zinc-400 hover:text-white transition-colors border border-zinc-700 px-4 py-2 rounded-lg">Image Selector</a>
            <a href="/dev/ai" className="text-xs font-bold text-zinc-400 hover:text-white transition-colors border border-zinc-700 px-4 py-2 rounded-lg">Experimental AI</a>
            <a href="/dev/evals" className="text-xs font-bold text-white bg-zinc-800 border border-zinc-600 px-4 py-2 rounded-lg">Evals</a>
          </div>
        </div>
        <button
          onClick={runAll}
          disabled={isRunningAll}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all active:scale-95"
        >
          {isRunningAll ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
          RUN ALL SCENARIOS
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {runs.map((run, i) => (
          <div key={run.scenario.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className={`size-3 rounded-full ${
                  run.status === "idle" ? "bg-zinc-700" :
                  run.status === "running" ? "bg-amber-500 animate-pulse" :
                  run.status === "completed" ? (run.evalResult?.pass ? "bg-emerald-500" : "bg-rose-500") : "bg-rose-500"
                }`} />
                <div>
                  <h3 className="font-bold text-lg">{run.scenario.name}</h3>
                  <div className="text-xs text-zinc-500 label-mono">ID: {run.scenario.id} | INTENT: {run.scenario.intent}</div>
                </div>
              </div>
              <button
                onClick={() => runScenario(i)}
                disabled={run.status === "running"}
                className="size-10 rounded-full border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors"
              >
                <Play size={16} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="label-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">Input</div>
                <div className="bg-black/40 p-4 rounded-xl text-zinc-300 text-sm italic leading-relaxed">
                  "{run.scenario.input}"
                </div>

                {run.scenario.expectedSuttaIds.length > 0 && (
                  <div className="mt-4 flex gap-2">
                    {run.scenario.expectedSuttaIds.map(id => (
                      <span key={id} className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-1 rounded font-bold label-mono">EXPECT: {id}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="label-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">Evaluation</div>
                {run.status === "idle" && <div className="text-zinc-700 italic text-sm">Not run yet...</div>}
                {run.status === "running" && <div className="flex items-center gap-2 text-amber-500 text-sm animate-pulse font-bold italic"><Loader2 className="animate-spin" size={16} /> Evaluating output...</div>}
                {run.status === "failed" && (
                  <div className="bg-rose-900/20 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-sm flex gap-3">
                    <AlertTriangle size={18} className="shrink-0" />
                    {run.error}
                  </div>
                )}
                {run.status === "completed" && run.evalResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-black text-emerald-400">{(run.evalResult.score * 100).toFixed(0)}<span className="text-xl text-zinc-600">%</span></div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                        run.evalResult.pass ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      }`}>
                        {run.evalResult.pass ? "PASS" : "FAIL"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(run.evalResult.metrics).map(([key, val]) => (
                        <div key={key} className="bg-black/20 p-3 rounded-lg border border-zinc-800/50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] uppercase font-bold text-zinc-500">{key}</span>
                            <span className="text-[10px] font-bold text-zinc-300">{(val * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${val * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-sm text-zinc-400 leading-relaxed border-t border-zinc-800 pt-4 italic">
                      {run.evalResult.reason}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {run.status === "completed" && run.result && (
              <div className="px-6 pb-6">
                <button
                  onClick={() => console.log(run.result)}
                  className="w-full bg-black/60 hover:bg-black text-zinc-500 hover:text-zinc-300 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  VIEW RAW OUTPUT IN CONSOLE
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
