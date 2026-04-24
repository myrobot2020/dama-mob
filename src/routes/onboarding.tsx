import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useProfile } from "@/hooks/use-profile";
import { createProfile, isLikelyUniqueViolation, validateUsername } from "@/lib/profile";
import { trackUxEvent } from "@/lib/uxLog";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingScreen,
  head: () => ({
    meta: [{ title: "Choose a username — DAMA" }],
  }),
});

function OnboardingScreen() {
  const navigate = useNavigate();
  const { session, loading, supabaseReady } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const { profile, loading: profileLoading } = useProfile(userId);

  const suggested = useMemo(() => {
    const email = (session?.user?.email ?? "").trim().toLowerCase();
    const local = email.includes("@") ? email.split("@")[0] : email;
    const cleaned = local.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 20);
    const base = cleaned.replace(/^_+/, "");
    return base.length >= 1 ? base : "";
  }, [session?.user?.email]);

  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorHelp = useMemo(() => {
    if (!error) return null;
    const msg = error.toLowerCase();
    if (
      (msg.includes("relation") && msg.includes("profiles") && msg.includes("does not exist")) ||
      (msg.includes("schema cache") && msg.includes("profiles")) ||
      msg.includes("pgrst205")
    ) {
      return 'Supabase table "profiles" is missing (or API schema cache is stale). Run docs/supabase-schema.sql in Supabase SQL editor, then reload the API schema (Project Settings → API → Reload schema) and refresh this page.';
    }
    if (msg.includes("permission denied") || msg.includes("rls") || msg.includes("row level security")) {
      return "RLS blocked the insert. Make sure you ran the schema SQL (includes policies) and you are signed in.";
    }
    return null;
  }, [error]);

  useEffect(() => {
    if (!profileLoading && profile) navigate({ to: "/profile" });
  }, [navigate, profile, profileLoading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseReady || !session?.user?.id) return;

    const v = validateUsername(username);
    if (!v.ok) {
      setError(v.error);
      return;
    }

    setPending(true);
    try {
      await createProfile({ userId: session.user.id, username: v.value, displayName: v.value });
      trackUxEvent("profile_create", { username: v.value });
      navigate({ to: "/profile" });
    } catch (e: unknown) {
      if (isLikelyUniqueViolation(e)) {
        setError("That username is taken. Try another.");
      } else {
        setError(e instanceof Error ? e.message : "Could not create profile.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <ScreenHeader title="Choose a username" showBack={false} />
      <div className="mx-auto max-w-sm px-5 pt-2">
        {!supabaseReady ? (
          <p className="text-sm text-muted-foreground">
            Supabase isn’t configured yet.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading session…</p>
        ) : !session ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Sign in to create your profile.</p>
            <p>
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Go to sign in
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This is your public handle (used for progress syncing and later community features).
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="onb-username">Username</Label>
                <Input
                  id="onb-username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  Anything you want. Up to 256 characters.
                </p>
                {suggested ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground truncate">
                      Suggestion: <span className="text-foreground/90">{suggested}</span>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-primary hover:underline underline-offset-4 shrink-0 disabled:opacity-50"
                      onClick={() => setUsername(suggested)}
                    >
                      Use
                    </button>
                  </div>
                ) : null}
              </div>
              {error ? (
                <div role="alert" className="space-y-1">
                  <p className="text-sm text-destructive">{error}</p>
                  {errorHelp ? (
                    <p className="text-xs text-muted-foreground">{errorHelp}</p>
                  ) : null}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Saving…" : "Continue"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
