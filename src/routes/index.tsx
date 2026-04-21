import { createFileRoute } from "@tanstack/react-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "DAMA" }, { name: "description", content: "Dhamma app" }],
  }),
  component: HomeScreen,
});

function HomeScreen() {
  return (
    <div className="min-h-screen pb-40 flex flex-col">
      <ScreenHeader title="Home" showBack={false} />
      <div className="flex-1 min-h-[50vh]" />
      <BottomNav />
    </div>
  );
}
