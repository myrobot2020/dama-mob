import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  type LeavesStore,
  mergeLeaves,
  readLeaves,
  subscribeLeaves,
} from "@/lib/leaves";

type QuizResultRow = {
  user_id: string;
  sutta_id: string;
  state: string;
  last_option_id: string | null;
  answered_at: string | null;
  yellow_at: string | null;
  fall_at: string | null;
  gold_at: string | null;
};

function leavesToRows(userId: string, store: LeavesStore): QuizResultRow[] {
  return Object.entries(store).map(([suttaId, leaf]) => ({
    user_id: userId,
    sutta_id: suttaId,
    state: leaf.state,
    last_option_id: leaf.lastOptionId ?? null,
    answered_at: leaf.answeredAtMs ? new Date(leaf.answeredAtMs).toISOString() : null,
    yellow_at: leaf.yellowAtMs ? new Date(leaf.yellowAtMs).toISOString() : null,
    fall_at: leaf.fallAtMs ? new Date(leaf.fallAtMs).toISOString() : null,
    gold_at: leaf.goldAtMs ? new Date(leaf.goldAtMs).toISOString() : null,
  }));
}

async function pullQuizResults(userId: string): Promise<LeavesStore> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("quiz_results")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;

  const store: LeavesStore = {};
  for (const row of data || []) {
    store[row.sutta_id] = {
      suttaId: row.sutta_id,
      state: row.state,
      createdAtMs: Date.parse(row.answered_at || row.updated_at), // fallback
      updatedAtMs: Date.parse(row.updated_at),
      answeredAtMs: row.answered_at ? Date.parse(row.answered_at) : undefined,
      yellowAtMs: row.yellow_at ? Date.parse(row.yellow_at) : undefined,
      fallAtMs: row.fall_at ? Date.parse(row.fall_at) : undefined,
      goldAtMs: row.gold_at ? Date.parse(row.gold_at) : undefined,
      lastOptionId: row.last_option_id ?? undefined,
    };
  }
  return store;
}

async function pushQuizResults(userId: string): Promise<void> {
  if (!supabase) return;
  const store = readLeaves();
  const rows = leavesToRows(userId, store);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("quiz_results")
    .upsert(rows, { onConflict: "user_id,sutta_id" });
  if (error) throw error;
}

export function useQuizSync(session: Session | null, enabled: boolean) {
  const [armed, setArmed] = useState(false);
  const syncingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !supabase || !session?.user?.id) return;
    const userId = session.user.id;
    let cancelled = false;
    (async () => {
      try {
        const remote = await pullQuizResults(userId);
        if (cancelled) return;
        mergeLeaves(remote);
        setArmed(true);
      } catch {
        setArmed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, session?.user?.id]);

  useEffect(() => {
    if (!enabled || !supabase || !session?.user?.id || !armed) return;
    const userId = session.user.id;

    const unsub = subscribeLeaves(() => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        void pushQuizResults(userId).finally(() => {
          syncingRef.current = false;
        });
      }, 1000);
    });

    void pushQuizResults(userId).catch(() => {});

    return () => {
      unsub();
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [armed, enabled, session?.user?.id]);
}
