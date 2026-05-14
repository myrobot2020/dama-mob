import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useArtifacts } from "@/lib/plant/hooks";

export const Route = createFileRoute("/plant/hdb")({
  component: HdbView,
});

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function HdbView() {
  const [hashPrefix, setHashPrefix] = useState("");
  const [model, setModel] = useState("");
  const arts = useArtifacts({
    hash_prefix: hashPrefix || undefined,
    model: model || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">GCS HDB</h2>
          <p className="text-sm text-muted-foreground">
            Sealed artifacts indexed by Hash-ID (content hash + model version).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={hashPrefix}
            onChange={(e) => setHashPrefix(e.target.value)}
            placeholder="hash prefix"
            className="h-8 w-40 rounded-md border border-border bg-card px-2 font-mono text-xs"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model version"
            className="h-8 w-44 rounded-md border border-border bg-card px-2 font-mono text-xs"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="grid grid-cols-[1fr_1.2fr_1.2fr_120px_100px] border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>type</span>
          <span>sutta</span>
          <span>uri</span>
          <span>created</span>
          <span className="text-right">size</span>
        </div>
        {arts.length === 0 && (
          <div className="px-3 py-12 text-center font-mono text-xs text-muted-foreground">
            no sealed artifacts yet — let the plant cook a wave through.
          </div>
        )}
        {arts.map((a, i) => (
          <Link
            key={a.id}
            to="/plant/sutta/$jobId"
            params={{ jobId: a.job_id }}
            className="grid grid-cols-[1fr_1.2fr_1.2fr_120px_100px] items-center px-3 py-2 font-mono text-xs hover:bg-secondary/60"
            style={{
              backgroundColor: i % 2 === 1 ? "var(--color-tape-row-alt)" : "var(--color-tape-row)",
            }}
          >
            <span className="truncate text-primary">{a.kind}</span>
            <span className="truncate text-foreground/80">{a.sutta_id}</span>
            <span className="truncate text-muted-foreground">{a.id}</span>
            <span className="text-muted-foreground">{fmtAgo(a.created_at)}</span>
            <span className="text-right text-muted-foreground">{a.size_bytes ? fmtSize(a.size_bytes) : "—"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
