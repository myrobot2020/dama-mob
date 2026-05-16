import { getItem, itemDisplayHeading, stripTranscriptNoise, type ItemDetail } from "./damaApi";

export type ReadSuttaContext = {
  suttaid: string;
  title?: string;
  text: string;
};

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4),
    ),
  );
}

export function scoreReadSuttaForQuestion(item: ReadSuttaContext, question: string): number {
  const terms = tokenize(question);
  if (terms.length === 0) return 0;
  const haystack = `${item.suttaid} ${item.title ?? ""} ${item.text}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export function selectReadSuttaContexts(
  contexts: ReadSuttaContext[],
  question: string,
  maxItems = 6,
): ReadSuttaContext[] {
  return contexts
    .map((ctx, idx) => ({ ctx, idx, score: scoreReadSuttaForQuestion(ctx, question) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, Math.max(1, maxItems))
    .map(({ ctx }) => ctx);
}

function contextFromItem(item: ItemDetail): ReadSuttaContext {
  const sutta = stripTranscriptNoise(item.sutta || "");
  const commentary = stripTranscriptNoise(item.commentry || "");
  const text = [sutta, commentary].filter(Boolean).join("\n\nCommentary:\n");
  return {
    suttaid: item.suttaid,
    title: itemDisplayHeading(item),
    text: text.slice(0, 2_000),
  };
}

export async function loadReadSuttaContexts(
  readSuttaIds: string[],
  question: string,
  signal?: AbortSignal,
): Promise<ReadSuttaContext[]> {
  let uniqueIds = Array.from(new Set(readSuttaIds.map((id) => id.trim()).filter(Boolean)));

  // If no IDs provided, try to find some relevant ones from the index
  if (uniqueIds.length === 0) {
    try {
      const { getItems } = await import("./damaApi");
      const { items } = await getItems({ q: question }, signal);
      uniqueIds = items.slice(0, 5).map(it => it.suttaid);
    } catch (e) {
      console.error("Failed to fetch suttas for search fallback", e);
    }
  }

  if (uniqueIds.length === 0) return [];

  const loaded = await Promise.allSettled(
    uniqueIds.map(async (id) => contextFromItem(await getItem(id, undefined, signal))),
  );

  const contexts = loaded
    .filter(
      (result): result is PromiseFulfilledResult<ReadSuttaContext> => result.status === "fulfilled",
    )
    .map((result) => result.value)
    .filter((ctx) => ctx.text.trim());

  return selectReadSuttaContexts(contexts, question);
}
