import { createFileRoute } from "@tanstack/react-router";
import { useWaves } from "@/lib/plant/hooks";
import { Cpu, Settings, Layers, TriangleAlert, Activity } from "lucide-react";

export const Route = createFileRoute("/plant/waves")({
  component: WavesView,
});

function elapsed(ts?: number) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function WavesView() {
  const w = useWaves();
  if (!w) return <div className="font-mono text-sm text-muted-foreground">loading…</div>;

  return (
    <div className="space-y-6">
      {/* Top strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="throughput / hr" value={w.throughput_per_hour} icon={Activity} />
        <Stat
          label="GPU"
          value={w.wave2.locked ? "busy" : "idle"}
          icon={Settings}
          tone={w.wave2.locked ? "gpu" : undefined}
        />
        <Stat label="ready to seal" value={w.wave3.ready_to_seal} icon={Layers} />
        <Stat
          label="errors / hr"
          value={w.errors_last_hour}
          icon={TriangleAlert}
          tone={w.errors_last_hour > 0 ? "err" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Wave 1 */}
        <section className="rounded-md border border-border bg-card p-4">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg">Wave 1</h3>
              <p className="text-xs text-muted-foreground">Parallel CPU · 8 grunts</p>
            </div>
            <Cpu className="h-4 w-4 text-wave-cpu" strokeWidth={1.5} />
          </header>
          <div className="grid grid-cols-2 gap-2">
            {w.wave1.map((s) => (
              <div
                key={s.index}
                className={`rounded-md border p-2 ${
                  s.busy
                    ? "border-wave-cpu/40 bg-wave-cpu/5"
                    : "border-dashed border-border bg-transparent"
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>grunt #{s.index}</span>
                  {s.busy && <span className="text-wave-cpu">{s.task}</span>}
                </div>
                <div className="mt-1 truncate font-serif text-sm text-foreground">
                  {s.busy ? s.sutta_title : <span className="text-muted-foreground/60">idle</span>}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {s.busy ? elapsed(s.started_at) : ""}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Wave 2 */}
        <section className="rounded-md border border-border bg-card p-4">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg">Wave 2</h3>
              <p className="text-xs text-muted-foreground">Sequential GPU · 1 lock</p>
            </div>
            <Settings
              className={`h-4 w-4 ${w.wave2.locked ? "text-wave-gpu" : "text-muted-foreground"}`}
              strokeWidth={1.5}
            />
          </header>

          <div
            className={`rounded-md border p-3 ${
              w.wave2.locked ? "border-wave-gpu/50 bg-wave-gpu/5" : "border-dashed border-border"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
              <span className="text-muted-foreground">gpu lock</span>
              <span className={w.wave2.vram_loaded ? "text-wave-gpu" : "text-muted-foreground"}>
                vram {w.wave2.vram_loaded ? "loaded" : "cold"}
              </span>
            </div>
            <div className="mt-2 font-serif text-lg text-foreground">
              {w.wave2.sutta_title ?? <span className="text-muted-foreground/60">no holder</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {(["gen", "translate", "dub"] as const).map((stage) => {
                const active = w.wave2.stage === stage;
                return (
                  <span
                    key={stage}
                    className={`flex-1 rounded-sm border px-2 py-1 text-center font-mono text-[10px] uppercase tracking-widest ${
                      active
                        ? "border-wave-gpu bg-wave-gpu/10 text-wave-gpu"
                        : "border-border text-muted-foreground/60"
                    }`}
                  >
                    {stage}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              elapsed {elapsed(w.wave2.started_at)} · queue depth {w.wave2.queue_depth}
            </div>
          </div>
        </section>

        {/* Wave 3 */}
        <section className="rounded-md border border-border bg-card p-4">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg">Wave 3</h3>
              <p className="text-xs text-muted-foreground">Weaver · Seal</p>
            </div>
            <Layers className="h-4 w-4 text-wave-weaver" strokeWidth={1.5} />
          </header>

          <ol className="space-y-2">
            {(["match", "weave", "validate", "seal"] as const).map((stage) => {
              const sutta = w.wave3.pipeline[stage];
              const active = !!sutta;
              return (
                <li
                  key={stage}
                  className={`flex items-center gap-3 rounded-md border p-2 ${
                    active
                      ? "border-wave-weaver/40 bg-wave-weaver/5"
                      : "border-dashed border-border"
                  }`}
                >
                  <span className="w-20 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {stage}
                  </span>
                  <span className="flex-1 truncate font-serif text-sm">
                    {sutta ?? <span className="text-muted-foreground/60">—</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 font-mono text-[10px] text-muted-foreground">
            ready to seal · {w.wave3.ready_to_seal}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  tone?: "gpu" | "err";
}) {
  const color =
    tone === "gpu" ? "text-wave-gpu" : tone === "err" ? "text-status-err" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${color}`} strokeWidth={1.5} />
      </div>
      <div className={`mt-1 font-serif text-2xl ${color}`}>{value}</div>
    </div>
  );
}
