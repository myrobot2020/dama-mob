import { createFileRoute, Link } from "@tanstack/react-router";
import { User } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/profile")({
  component: ProfileScreen,
});

function ProfileScreen() {
  const { session, loading, supabaseReady } = useAuthSession();
  const user = session?.user ?? null;

  return (
    <div className="min-h-screen pb-40">
      <ScreenHeader title="Profile" showBack={false} />
      <div className="px-5 text-center">
        <div className="mx-auto size-24 rounded-full glass flex items-center justify-center animate-pulse-glow">
          <User size={36} className="text-primary" />
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading session…</p>
        ) : !supabaseReady ? (
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p>
              Supabase env vars are missing. Add them to{" "}
              <span className="font-mono text-xs">.env.local</span> and restart the dev server.
            </p>
          </div>
        ) : user ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              {user.email ?? "Signed in"}
            </h1>
            <div className="mt-1 label-mono text-primary text-xs truncate max-w-full mx-auto">
              User id · {user.id.slice(0, 8)}…
            </div>
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => supabase?.auth.signOut()}
              >
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Guest</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to sync profile data when you add it.
            </p>
            <div className="mt-8 flex justify-center">
              <Button type="button" asChild>
                <Link to="/login">Sign in or create account</Link>
              </Button>
            </div>
          </>
        )}

        {supabaseReady && user ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Profile details and journal coming soon.
          </p>
        ) : null}
      </div>
      <BottomNav />
    </div>
  );
}
