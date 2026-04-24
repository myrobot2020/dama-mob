import { createFileRoute } from "@tanstack/react-router";

import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "DAMA" }, { name: "description", content: "DAMA" }],
  }),
  component: HomeScreen,
});

function HomeScreen() {
  return (
    <div className="min-h-screen dama-screen flex flex-col">
      <ScreenHeader title="DAMA" showBack={false} />
      <main className="flex-1" />
      <BottomNav />
    </div>
  );
}

