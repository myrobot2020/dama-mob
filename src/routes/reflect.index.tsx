import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import heroImg from "@/assets/reflection-hero.jpg";
import { Sparkles } from "lucide-react";

type ReflectionBot = "simulation" | "buddha" | "psychologist" | "social" | "feminine";

export const Route = createFileRoute("/reflect/")({
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
  const [bot, setBot] = useState<ReflectionBot>("buddha");
  const navigate = useNavigate();

  const submit = (nextMode: "dama" | ReflectionBot) => {
    if (!text.trim()) return;
    localStorage.setItem("dama:reflection", text);
    localStorage.setItem("dama:reflectionMode", nextMode);
    navigate({ to: "/reflect/thinking" });
  };

  const botLabel = (b: ReflectionBot) => {
    switch (b) {
      case "simulation":
        return "Simulation Theory Bot";
      case "buddha":
        return "Buddha Bot";
      case "psychologist":
        return "Psychologist Bot";
      case "social":
        return "Social Cohesion Bot";
      case "feminine":
        return "Feminine Bot";
    }
  };

  const askButtonLabel = (() => {
    switch (bot) {
      case "buddha":
        // Keep the existing label for the default bot (tests + muscle memory).
        return "Ask BuddhaBot (in-app)";
      default:
        return `Ask ${botLabel(bot)} (in-app)`;
    }
  })();

  return (
    <div className="min-h-screen dama-screen">
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

        <div className="mt-4 glass rounded-2xl p-4">
          <div className="label-mono text-muted-foreground">Choose an AI voice</div>
          <div className="mt-3">
            <select
              value={bot}
              onChange={(e) => setBot(e.target.value as ReflectionBot)}
              className="w-full rounded-2xl bg-background/30 border border-border/60 px-4 py-3 text-sm font-medium text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="AI voice"
            >
              <option value="buddha">{botLabel("buddha")}</option>
              <option value="psychologist">{botLabel("psychologist")}</option>
              <option value="social">{botLabel("social")}</option>
              <option value="simulation">{botLabel("simulation")}</option>
              <option value="feminine">{botLabel("feminine")}</option>
            </select>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Begin writing..."
          rows={6}
          className="mt-4 w-full glass rounded-2xl p-4 text-[15px] leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
        />

        <button
          onClick={() => submit("dama")}
          disabled={!text.trim()}
          className="mt-4 w-full rounded-2xl bg-primary text-primary-foreground font-medium py-4 flex items-center justify-center gap-2 disabled:opacity-40 disabled:animate-none animate-pulse-glow"
        >
          <Sparkles size={16} /> Get DAMA Answer
        </button>

        <button
          onClick={() => submit(bot)}
          disabled={!text.trim()}
          className="mt-3 w-full rounded-2xl glass font-medium py-4 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Sparkles size={16} /> {askButtonLabel}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
