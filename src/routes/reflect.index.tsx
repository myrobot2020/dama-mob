import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import heroImg from "@/assets/reflection-hero.jpg";
import { Sparkles } from "lucide-react";

type ReflectionBot = "simulation" | "buddha" | "psychologist" | "social" | "feminine";

export const Route = createFileRoute("/reflect/")({
  head: () => ({
    meta: [
      { title: "End of Day Reflection - DAMA" },
      {
        name: "description",
        content: "A calm daily reflection grounded in the suttas you have read.",
      },
    ],
  }),
  component: ReflectScreen,
});

function botLabel(bot: ReflectionBot): string {
  switch (bot) {
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
}

function ReflectScreen() {
  const [text, setText] = useState("");
  const [bot, setBot] = useState<ReflectionBot>("buddha");
  const navigate = useNavigate();

  const submit = (mode: "dama" | ReflectionBot) => {
    const reflection = text.trim();
    if (!reflection) return;
    localStorage.setItem("dama:reflection", reflection);
    localStorage.setItem("dama:reflectionMode", mode);
    navigate({ to: "/reflect/thinking" });
  };

  const askBotLabel =
    bot === "buddha" ? "Ask BuddhaBot (in-app)" : `Ask ${botLabel(bot)} (in-app)`;

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader title="Reflection" showBack={false} />
      <div className="px-5">
        <div className="relative aspect-[16/10] overflow-hidden rounded-3xl glass">
          <img
            src={heroImg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="mt-5">
          <div className="label-mono text-primary">End of Day Question</div>
          <h1 className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
            Which part of your mind today was least touched by goodwill, and what was it holding
            onto?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Take a slow breath. Write what arises without editing it into something prettier.
          </p>
        </div>

        <label className="mt-4 block glass rounded-2xl p-4">
          <span className="label-mono text-muted-foreground">Choose an AI voice</span>
          <select
            value={bot}
            onChange={(e) => setBot(e.target.value as ReflectionBot)}
            className="mt-3 w-full rounded-2xl border border-border/60 bg-background/30 px-4 py-3 text-sm font-medium text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="AI voice"
          >
            <option value="buddha">{botLabel("buddha")}</option>
            <option value="psychologist">{botLabel("psychologist")}</option>
            <option value="social">{botLabel("social")}</option>
            <option value="simulation">{botLabel("simulation")}</option>
            <option value="feminine">{botLabel("feminine")}</option>
          </select>
        </label>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Begin writing..."
          rows={6}
          className="mt-4 w-full resize-none rounded-2xl bg-transparent p-4 text-[15px] leading-relaxed glass placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <button
          type="button"
          onClick={() => submit(bot)}
          disabled={!text.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-medium text-primary-foreground animate-pulse-glow disabled:animate-none disabled:opacity-40"
        >
          <Sparkles size={16} /> {askBotLabel}
        </button>
      </div>
    </div>
  );
}
