import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import treeImg from "@/assets/dhamma-tree.jpg";
import { ensureLeaf, hydrateLeaf, readLeaves, subscribeLeaves, upsertHydratedLeaf } from "@/lib/leaves";

export const Route = createFileRoute("/tree")({
  head: () => ({
    meta: [
      { title: "Tree — DAMA" },
      { name: "description", content: "Quest tree." },
    ],
  }),
  component: TreeScreen,
});

function TreeScreen() {
  const search = Route.useSearch() as { focus?: string | undefined };
  const focus = (search?.focus || "").trim();

  const leaves = useSyncExternalStore(subscribeLeaves, readLeaves, () => ({}));

  useEffect(() => {
    if (!focus) return;
    ensureLeaf(focus);
    upsertHydratedLeaf(focus);
  }, [focus]);

  useEffect(() => {
    // Best-effort: persist any automatic state transitions (green->yellow, yellow->grey).
    for (const id of Object.keys(leaves)) upsertHydratedLeaf(id);
  }, [leaves]);

  useEffect(() => {
    // Tick hydration so short demo windows (e.g. 7 seconds) visibly update without user interaction.
    const t = window.setInterval(() => {
      for (const id of Object.keys(readLeaves())) upsertHydratedLeaf(id);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const ordered = useMemo(() => {
    const ids = Object.keys(leaves);
    ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ids.map((id) => hydrateLeaf(leaves[id]!, Date.now()));
  }, [leaves]);

  const badge = (state: string) => {
    switch (state) {
      case "grey":
        return "Grey (quiz available)";
      case "green":
        return "Green";
      case "yellow":
        return "Yellow (review)";
      case "gold":
        return "Gold (fixed)";
      default:
        return state;
    }
  };

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader title="Tree" showBack={false} />
      <div className="px-5 pt-6 pb-[var(--dama-bottom-pad,0px)]">
        <div className="rounded-3xl overflow-hidden aspect-[16/10] relative glass">
          <img src={treeImg} alt="Dhamma tree" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="mt-6">
          <div className="label-mono text-primary">Leaves</div>
          {ordered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Open a sutta and tap the Tree icon to start a leaf.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {ordered.map((leaf) => (
                <Link
                  key={leaf.suttaId}
                  to="/quiz/$suttaId"
                  params={{ suttaId: leaf.suttaId }}
                  className="block rounded-2xl glass px-4 py-3 ring-1 ring-white/10 hover:ring-primary/25 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{leaf.suttaId}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground label-mono normal-case">
                        {badge(leaf.state)}
                      </div>
                    </div>
                    <div
                      className={`size-3.5 rounded-full ${
                        leaf.state === "gold"
                          ? "bg-yellow-400"
                          : leaf.state === "yellow"
                            ? "bg-yellow-200"
                            : leaf.state === "green"
                              ? "bg-green-400"
                              : "bg-white/30"
                      }`}
                      aria-hidden
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
