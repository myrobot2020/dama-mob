import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import { useProfile } from "@/hooks/use-profile";
import { clearFreshStartInProgress, isFreshStartDone, markFreshStartDone, markFreshStartInProgress } from "@/lib/freshStart";
import { resetReadingProgress } from "@/lib/readingProgress";
import { resetAudioListenProgress } from "@/lib/audioListenProgress";
import { resetTeacherQuest } from "@/lib/teacherQuest";
import { clearUxLog } from "@/lib/uxLog";
import { REFLECTION_QUERY_STORAGE_KEY } from "@/lib/damaApi";
import { supabase } from "@/lib/supabase";

export function ClientBootstrap() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session, loading, supabaseReady } = useAuthSession();
  const { profile, loading: profileLoading, available: profileAvailable } = useProfile(
    session?.user?.id ?? null,
  );

  useEffect(() => {
    if (!supabaseReady) return;
    if (loading) return;
    if (!session?.user?.id) return;
    if (!profileAvailable) return;
    if (profileLoading) return;
    if (profile) return;

    const onOnboarding = pathname === "/onboarding";
    const inAuthCallback = pathname === "/auth/callback";
    const inUpdatePassword = pathname === "/update-password";
    if (onOnboarding || inAuthCallback || inUpdatePassword) return;

    navigate({ to: "/onboarding" });
  }, [
    loading,
    navigate,
    pathname,
    profile,
    profileAvailable,
    profileLoading,
    session?.user?.id,
    supabaseReady,
  ]);

  return null;
}
