import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp, BarChart3, Zap, DollarSign, Activity,
  GitPullRequest, AlertTriangle, List, Terminal, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Info, Database
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Cell, PieChart, Pie
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWaves } from "@/lib/plant/hooks";

export const Route = createFileRoute("/plant/performance")({
  component: PerformanceView,
});

function PerformanceView() {
  const waves = useWaves();

  const stats = [
    {
      label: "THROUGHPUT / HR",
      value: waves?.throughput_per_hour ?? "0",
      sub: "Sealed artifacts",
      icon: GitPullRequest
    },
    {
      label: "ERRORS / HR",
      value: waves?.errors_last_hour ?? "0",
      sub: "Failed jobs",
      icon: AlertTriangle
    },
    {
      label: "GPU STATUS",
      value: waves?.wave2.locked ? "BUSY" : "IDLE",
      sub: waves?.wave2.vram_loaded ? "VRAM Loaded" : "Cold",
      icon: Zap
    },
    {
      label: "QUEUE DEPTH",
      value: waves?.wave2.queue_depth ?? "0",
      sub: "Jobs waiting",
      icon: Activity
    },
    {
      label: "READY TO SEAL",
      value: waves?.wave3.ready_to_seal ?? "0",
      sub: "Wave 3 buffer",
      icon: CheckCircle2
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="font-serif text-2xl">Pipeline Performance</h2>
          <p className="text-sm text-muted-foreground">
            Real-time analysis of pipeline throughput and system state.
          </p>
        </div>
      </header>

      {/* 1. Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {stats.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4 shadow-sm relative overflow-hidden group hover:border-primary/40 transition-colors">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              {m.label}
              <m.icon size={10} className="opacity-40" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-xl font-bold">{m.value}</div>
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground font-mono text-xs">
        Detailed telemetry charts are coming soon as the data plant matures.
      </div>
    </div>
  );
}

// Internal icons helper
const ShieldAlert = ({ className, size }: { className?: string; size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
);
