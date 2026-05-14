import { Activity, ShieldCheck, Zap, Globe } from "lucide-react";
import { useWaves } from "@/lib/plant/hooks";

export function GlobalHealthPanel() {
  const waves = useWaves();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <HealthCard
        title="Pipeline API"
        status="Active"
        uptime="100%"
        latency="20ms"
        icon={Zap}
      />
      <HealthCard
        title="GCS Storage"
        status="Connected"
        uptime="99.9%"
        latency="15ms"
        icon={Globe}
      />
      <HealthCard
        title="GPU Cluster"
        status={waves?.wave2.locked ? "Busy" : "Idle"}
        uptime="-"
        latency={waves?.wave2.locked ? "Processing" : "-"}
        icon={Activity}
      />
      <HealthCard
        title="Seals"
        status={String(waves?.wave3.ready_to_seal ?? 0)}
        uptime="Buffer"
        latency="Pending"
        icon={ShieldCheck}
      />
    </div>
  );
}

function HealthCard({
  title,
  status,
  uptime,
  latency,
  icon: Icon,
}: {
  title: string;
  status: string;
  uptime: string;
  latency: string;
  icon: any;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-serif text-lg">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-xl text-primary">{status}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {uptime} uptime
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        Avg. Latency: {latency}
      </div>
    </div>
  );
}
