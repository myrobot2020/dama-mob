import { Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";

export function RelevantSuttaStrip({
  suttaId,
  label = "Relevant sutta",
  audioEnabled,
}: {
  suttaId: string;
  label?: string;
  audioEnabled: boolean;
}) {
  const id = (suttaId || "").trim();
  if (!id) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 px-3 pt-2 bg-background border-t border-border/60"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Link
        to="/sutta/$suttaId"
        params={{ suttaId: id }}
        className="flex items-center gap-2 rounded-2xl bg-background ring-1 ring-primary/25 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
      >
        <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-left">
          <div className="label-mono text-[10px] text-muted-foreground leading-tight">{label}</div>
          <div className="text-sm font-medium text-foreground truncate">{id}</div>
        </div>
        <div
          className={`size-9 rounded-full glass flex items-center justify-center shrink-0 ${
            audioEnabled ? "text-primary" : "text-muted-foreground opacity-40"
          }`}
          aria-label={audioEnabled ? "Audio available" : "Audio disabled"}
          title={audioEnabled ? "Open sutta to play audio" : "Audio unlocks on review (yellow leaf)"}
        >
          <Play size={16} className="ml-0.5" />
        </div>
      </Link>
    </div>
  );
}

