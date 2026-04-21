import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { CorpusIndexPanel } from "@/components/CorpusIndexPanel";
import heroImg from "@/assets/reflection-hero.jpg";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/reflect")({
  head: () => ({
    meta: [
      { title: "End of Day Reflection — DAMA" },
      {
        name: "description",
        content: "A calm, daily contemplative prompt grounded in canonical sources.",
      },
    ],
  }),
  component: ReflectScreen,
});

function ReflectScreen() {
  const [text, setText] = useState("");
  const navigate = useNavigate();

  const submit = () => {
    if (!text.trim()) return;
    localStorage.setItem("dama:reflection", text);
    navigate({ to: "/reflect/thinking" });
  };

  return (
    <div className="min-h-screen pb-40">
      <ScreenHeader title="Reflection" showBack={false} />
      <div className="px-5">
        <div className="rounded-3xl overflow-hidden aspect-[16/10] relative glass">
          <img
            src={heroImg}
            alt="Sunset skyline"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <CorpusIndexPanel className="mt-5" />

        <div className="mt-5">
          <div className="label-mono text-primary">End of Day Question</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight leading-snug">
            Which part of your mind today was least touched by goodwill — and what was it holding
            onto?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Take a slow breath. Write what arises — without editing.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Begin writing..."
          rows={6}
          className="mt-4 w-full glass rounded-2xl p-4 text-[15px] leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
        />

        <button
          onClick={submit}
          disabled={!text.trim()}
          className="mt-5 w-full rounded-2xl bg-primary text-primary-foreground font-medium py-4 flex items-center justify-center gap-2 disabled:opacity-40 disabled:animate-none animate-pulse-glow"
        >
          <Sparkles size={16} /> Get AI Answer
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
