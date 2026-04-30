import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Sparkles, Trees, User } from "lucide-react";

import { ScreenHeader } from "@/components/ScreenHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "DAMA" }, { name: "description", content: "DAMA" }],
  }),
  component: HomeScreen,
});

const homeOptions = [
  {
    to: "/book-transition",
    search: { to: "AN 1.18.13" },
    label: "Book of Ones",
    detail: "Suttas",
    icon: BookOpen,
  },
  {
    to: "/tree",
    search: undefined,
    label: "Tree",
    detail: "Progress",
    icon: Trees,
  },
  {
    to: "/reflect",
    search: undefined,
    label: "Reflect",
    detail: "Chatbot",
    icon: Sparkles,
  },
  {
    to: "/profile",
    search: undefined,
    label: "Profile",
    detail: "Language and settings",
    icon: User,
  },
] as const;

function HomeScreen() {
  return (
    <div className="min-h-screen dama-screen flex flex-col">
      <ScreenHeader title="DAMA" showBack={false} showHome={false} />
      <main className="flex-1 px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="grid grid-cols-2 gap-3">
          {homeOptions.map(({ to, search, label, detail, icon: Icon }) => (
            <Link
              key={to}
              to={to as "/book-transition"}
              search={search}
              className="min-h-36 rounded-2xl glass p-4 ring-1 ring-white/10 transition-colors hover:bg-primary/10 hover:ring-primary/25 flex flex-col justify-between"
            >
              <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Icon size={22} />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">{label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

