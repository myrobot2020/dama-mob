import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Sparkles, Trees, User } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { readReadingProgress, getLastOpenedSuttaId, subscribeReadingProgress } from "@/lib/readingProgress";
import { DEFAULT_SUTTA_ID } from "@/lib/damaApi";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "DAMA" }, { name: "description", content: "DAMA" }],
  }),
  component: HomeScreen,
});

function HomeScreen() {
  const navigate = useNavigate();
  const progress = useSyncExternalStore(subscribeReadingProgress, readReadingProgress, () => ({}));
  const lastOpenedId = getLastOpenedSuttaId(progress);
  const lastId =
    lastOpenedId === "1.1" || lastOpenedId === "AN 1.1"
      ? DEFAULT_SUTTA_ID
      : lastOpenedId || DEFAULT_SUTTA_ID;

  const homeOptions = [
    {
      label: "AN Nikāya",
      detail: "Suttas",
      icon: BookOpen,
      onClick: () => navigate({ to: "/sutta/$suttaId", params: { suttaId: lastId } }),
    },
    {
      label: "Tree",
      detail: "Progress",
      icon: Trees,
      onClick: () => navigate({ to: "/tree" }),
    },
    {
      label: "Reflect",
      detail: "Chatbot",
      icon: Sparkles,
      onClick: () => navigate({ to: "/reflect" }),
    },
    {
      label: "Profile",
      detail: "Language and settings",
      icon: User,
      onClick: () => navigate({ to: "/profile" }),
    },
  ] as const;

  return (
    <div className="min-h-screen dama-screen flex flex-col">
      <ScreenHeader title="DAMA" showBack={false} showHome={false} />
      <main className="flex-1 px-8 pt-0 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="-mx-8 h-[18rem] overflow-hidden border-b paper-rule bg-background">
          <img
            src="/panels/buddha-mountain.png"
            alt=""
            className="h-full w-full object-cover object-center ink-panel opacity-90"
          />
          <div className="-mt-24 h-24 bg-gradient-to-b from-transparent to-background" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {homeOptions.map(({ label, detail, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="min-h-40 rounded-[1.4rem] border paper-rule bg-background/45 p-4 transition-colors hover:border-primary/60 hover:bg-card/80 flex flex-col justify-between text-left"
            >
              <div className="text-primary">
                <Icon size={23} strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-reading text-[1.35rem] leading-tight text-foreground">{label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
