import { createFileRoute } from "@tanstack/react-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { User } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfileScreen,
});

function ProfileScreen() {
  return (
    <div className="min-h-screen pb-28">
      <ScreenHeader title="Profile" showBack={false} />
      <div className="px-5 text-center">
        <div className="mx-auto size-24 rounded-full glass flex items-center justify-center animate-pulse-glow">
          <User size={36} className="text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Practitioner</h1>
        <div className="mt-1 label-mono text-primary">Mindful Explorer · Lv 7</div>
        <p className="mt-6 text-sm text-muted-foreground">
          Profile, settings and journal coming soon.
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
