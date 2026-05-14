import { createFileRoute } from "@tanstack/react-router";
import { GlobalHealthPanel } from "@/components/GlobalHealthPanel";
import { ShieldAlert, Activity, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/plant/network")({
  component: NetworkView,
});

function NetworkView() {
  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="font-serif text-2xl">Network & Health</h2>
          <p className="text-sm text-muted-foreground">
            Real-time health and connectivity metrics across all regions and dependencies.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg border border-emerald-500/20">
          <Globe size={14} className="animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Global Status: Optimal</span>
        </div>
      </header>

      {/* Primary Health Panel */}
      <GlobalHealthPanel />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <ShieldAlert size={14} className="text-primary" />
            Security Shield
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">DDoS Protection</span>
              <span className="text-emerald-500 font-bold">Active</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rate Limiting</span>
              <span className="text-emerald-500 font-bold">Normal</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">WAF Rules</span>
              <span className="text-emerald-500 font-bold">42 Filtered</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Activity size={14} className="text-amber-500" />
            Traffic Balancing
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Main (Mumbai)</span>
              <span className="font-bold">62%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tokyo (Failover)</span>
              <span className="font-bold">18%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Europe/US</span>
              <span className="font-bold">20%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 flex flex-col justify-center items-center text-center">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1">
            <Globe size={24} />
          </div>
          <div className="text-xs font-bold uppercase tracking-tighter">Multi-Region Active</div>
          <p className="text-[10px] text-muted-foreground leading-snug max-w-[180px]">
            Anycast routing is distributing traffic based on client proximity.
          </p>
        </div>
      </section>
    </div>
  );
}
