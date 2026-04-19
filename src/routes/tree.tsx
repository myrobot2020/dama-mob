import { createFileRoute } from "@tanstack/react-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { Flame, Clock, Sparkles } from "lucide-react";
import treeImg from "@/assets/dhamma-tree.jpg";

export const Route = createFileRoute("/tree")({
  head: () => ({
    meta: [
      { title: "Your Tree — DAMA" },
      { name: "description", content: "Track your contemplative growth as a glowing Dhamma tree." },
    ],
  }),
  component: TreeScreen,
});

function TreeScreen() {
  const xp = 620;
  const xpMax = 1000;
  return (
    <div className="min-h-screen pb-28">
      <ScreenHeader title="Your Tree" showBack={false} />
      <div className="px-5">
        <div className="text-center">
          <div className="label-mono text-primary">Dhamma Tree</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your Growth</h1>
        </div>

        <div className="mt-4 relative rounded-3xl overflow-hidden glass aspect-[4/5] flex items-center justify-center">
          <img
            src={treeImg}
            alt="Glowing dhamma tree"
            className="absolute inset-0 w-full h-full object-cover animate-float"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/40" />
          <div className="absolute top-3 left-3 glass rounded-full px-3 py-1 flex items-center gap-1.5">
            <Flame size={12} className="text-primary" />
            <span className="label-mono">7 day streak</span>
          </div>
        </div>

        <div className="mt-6 glass rounded-2xl p-4">
          <div className="label-mono text-muted-foreground">Today's Growth</div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              <span className="text-sm">Studied <b>1h 15m</b></span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="text-sm">+12 leaves</span>
            </div>
          </div>
        </div>

        <div className="mt-3 glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-mono text-muted-foreground">Overall Progress</div>
              <div className="mt-1 text-sm font-medium">Level 7 · Mindful Explorer</div>
            </div>
            <div className="label-mono text-primary">{xp}/{xpMax} XP</div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-primary glow-soft transition-all"
              style={{ width: `${(xp / xpMax) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
