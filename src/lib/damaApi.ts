/**
 * Corpus: by default the app loads sutta JSON from the sibling `dama5` repo via Vite (`/__dama_corpus__/…`).
 * Set `VITE_DAMA_API_URL` to use FastAPI `/api` instead (e.g. static deploy or remote dama5).
 * Set `VITE_DAMA_CORPUS_MODE=api` to force `/api` while developing.
 */

import {
  fetchItemFromCorpusFs,
  fetchItemsFromCorpusFs,
  useDirectCorpusFs,
} from "./corpusDirect";
import { ensureEnglishSuttaSuffix } from "./suttaTitle";

export { ensureEnglishSuttaSuffix };

/** localStorage key: JSON from last /api/query in reflect flow */
export const REFLECTION_QUERY_STORAGE_KEY = "dama:reflectionQueryResult";

export type DamaChunk = {
  source?: string;
  suttaid?: string;
  text?: string;
  book?: string;
};

export type DamaQueryResponse = {
  chunks: DamaChunk[];
  answer: string;
  used_llm: boolean;
  timings_ms?: Record<string, unknown> | null;
};

/** Main Nikāya collections in the canon (UI); dama5 may only ship AN until more JSON exists. */
export type NikayaId = "AN" | "SN" | "DN" | "MN" | "KN";

export type ItemSummary = {
  suttaid: string;
  title?: string;
  has_commentary?: boolean;
  /** When set by API, preferred over guessing from suttaid. */
  nikaya?: NikayaId | string;
};

/** Header / nav: short labels; full names in titles where needed. */
export const NIKAYA_OPTIONS: { value: NikayaId; label: string; title: string }[] = [
  { value: "AN", label: "Aṅguttara", title: "Aṅguttara Nikāya" },
  { value: "SN", label: "Saṁyutta", title: "Saṁyutta Nikāya" },
  { value: "DN", label: "Dīgha", title: "Dīgha Nikāya" },
  { value: "MN", label: "Majjhima", title: "Majjhima Nikāya" },
  { value: "KN", label: "Khuddaka", title: "Khuddaka Nikāya" },
];

/** Aṅguttara nipātas 1–11 (Book of Ones … Book of Elevens). */
export const AN_BOOK_TITLES: Record<number, string> = {
  1: "Book of Ones",
  2: "Book of Twos",
  3: "Book of Threes",
  4: "Book of Fours",
  5: "Book of Fives",
  6: "Book of Sixes",
  7: "Book of Sevens",
  8: "Book of Eights",
  9: "Book of Nines",
  10: "Book of Tens",
  11: "Book of Elevens",
};

export type ItemDetail = {
  suttaid: string;
  title?: string;
  /** dama5 corpus flag; false means not published (API should 404, this is a client safety net). */
  valid?: boolean;
  /** English short name from corpus JSON (e.g. "Shopkeeper"); preferred for headings. */
  sutta_name_en?: string;
  sutta_name_pali?: string;
  sutta: string;
  commentry?: string;
  commentary_id?: string;
  sc_id?: string;
  sc_url?: string;
  sc_sutta?: string;
  aud_file?: string;
  aud_start_s?: number;
  aud_end_s?: number;
  /** Optional link to teacher recording on YouTube (from corpus JSON). */
  youtube_url?: string;
  youtube_video_id?: string;
  chain?: {
    items?: string[];
    count?: number;
    is_ordered?: boolean;
    category?: string;
  } | null;
};

/** First segment of dotted id: "7.4.38" -> 7, "11.16" -> 11; strips leading "AN ". */
export function anBookFromSuttaId(suttaid: string | undefined | null): number | null {
  const t = (suttaid ?? "")
    .trim()
    .replace(/^AN\s+/i, "")
    .trim();
  const head = (t.split(".")[0] ?? "").trim();
  const n = parseInt(head, 10);
  if (!Number.isFinite(n) || n < 1 || n > 11) return null;
  return n;
}

/** First book segment for SN/DN/MN/KN dotted ids (`SN 2.5` → 2). */
export function otherNikayaBookFromSuttaId(suttaid: string | undefined | null): number | null {
  const t = (suttaid ?? "").trim();
  const m = /^(SN|DN|MN|KN)\s+(\d+)\./i.exec(t);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  return Number.isFinite(n) ? n : null;
}

/** Matches repo folders an1…an11 (Aṅguttara nipātas). Value "all" or "1"…"11". */
export const AN_NIPATA_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All · Aṅguttara (an1–an11)" },
  ...Array.from({ length: 11 }, (_, i) => {
    const n = i + 1;
    return {
      value: String(n),
      label: `${AN_BOOK_TITLES[n]} (an${n})`,
    };
  }),
];

export function filterItemsByNipata(items: ItemSummary[], nipata: string): ItemSummary[] {
  if (nipata === "all") return items;
  const want = parseInt(nipata, 10);
  if (!Number.isFinite(want)) return items;
  return items.filter((it) => anBookFromSuttaId(it.suttaid) === want);
}

/** Like nipāta filtering for AN; for SN/DN/MN/KN filters by leading book segment (`SN 1.x` → book 1). */
export function filterItemsByNikayaBook(
  items: ItemSummary[],
  nik: NikayaId,
  book: string,
): ItemSummary[] {
  const inNik = filterItemsByNikaya(items, nik);
  if (book === "all") return inNik;
  if (nik === "AN") return filterItemsByNipata(inNik, book);
  const want = parseInt(book, 10);
  if (!Number.isFinite(want)) return inNik;
  return inNik.filter((it) => otherNikayaBookFromSuttaId(it.suttaid) === want);
}

function _normNikaya(s: string | undefined): NikayaId | null {
  const u = (s || "").trim().toUpperCase();
  if (u === "AN" || u === "SN" || u === "DN" || u === "MN" || u === "KN") return u;
  return null;
}

/** Guess nikāya from sutta id when API omits `nikaya`. */
export function inferNikayaFromSuttaId(suttaid: string): NikayaId {
  const raw = (suttaid || "").trim();
  if (!raw) return "AN";
  const up = raw.toUpperCase();
  if (/^\s*SN[\s.]/i.test(raw) || /^\s*SN$/i.test(raw)) return "SN";
  if (/^\s*DN[\s.]/i.test(raw) || /^DN\d/i.test(up)) return "DN";
  if (/^\s*MN[\s.]/i.test(raw) || /^MN\d/i.test(up)) return "MN";
  if (/^\s*KN\b/i.test(raw)) return "KN";
  if (anBookFromSuttaId(raw) != null) return "AN";
  return "AN";
}

export function inferNikayaFromItem(it: ItemSummary): NikayaId {
  const fromApi = _normNikaya(it.nikaya as string | undefined);
  if (fromApi) return fromApi;
  return inferNikayaFromSuttaId(it.suttaid);
}

/** Keep items for the selected main collection (AN includes dotted AN-style ids). */
export function filterItemsByNikaya(items: ItemSummary[], nik: NikayaId): ItemSummary[] {
  return items.filter((it) => inferNikayaFromItem(it) === nik);
}

export function getDamaApiBase(): string {
  const raw = import.meta.env.VITE_DAMA_API_URL as string | undefined;
  if (raw && raw.trim()) return raw.replace(/\/$/, "");
  return "";
}

/**
 * Public HTTPS base for teacher MP3s (e.g. GCS): `https://storage.googleapis.com/BUCKET`.
 * Objects use the same names as `aud_file` in corpus JSON. Build-time: `VITE_DAMA_AUD_PUBLIC_BASE`.
 */
export function getDamaAudPublicBase(): string {
  const raw = import.meta.env.VITE_DAMA_AUD_PUBLIC_BASE as string | undefined;
  if (raw && raw.trim()) return raw.replace(/\/$/, "");
  return "";
}

/**
 * Teacher MP3 from this app only: put the file under `public/aud/<filename>` (same name as in JSON).
 * No dama5 required. Vite serves `public/` at the site root.
 */
export function getPublicAudUrl(filename: string): string {
  const name = (filename || "").trim();
  if (!name) return "/aud/";
  return `/aud/${encodeURIComponent(name)}`;
}

/** Optional: MP3 from a deployed dama5 origin when `VITE_DAMA_API_URL` is set. */
export function getDamaAudUrl(filename: string): string {
  const base = getDamaApiBase();
  const name = (filename || "").trim();
  if (!name) return `${base}/aud/`;
  return `${base}/aud/${encodeURIComponent(name)}`;
}

/**
 * Teacher MP3: GCS/public base → dama5 `/aud/` → `/dama-aud/` (see vite.config + Nitro middleware).
 */
export function getCorpusAudSrc(filename: string): string {
  const name = (filename || "").trim();
  if (!name) return "";
  const publicBase = getDamaAudPublicBase();
  if (publicBase) return `${publicBase}/${encodeURIComponent(name)}`;
  const base = getDamaApiBase();
  if (base) return `${base}/aud/${encodeURIComponent(name)}`;
  return `/dama-aud/${encodeURIComponent(name)}`;
}

/** One-line placement in canon for the sutta page (nikāya · book · citation). Includes full sutta id once. */
export function canonIndexSubtitle(suttaid: string): string {
  const ref = suttaid.trim();
  const nk = inferNikayaFromSuttaId(suttaid);
  if (nk !== "AN") {
    const nt = NIKAYA_OPTIONS.find((o) => o.value === nk)?.title ?? nk;
    const ob = otherNikayaBookFromSuttaId(suttaid);
    if (ob != null && ref) return `${nt} · Book ${ob} · ${ref}`;
    return ref ? `${nt} · ${ref}` : nt;
  }
  const b = anBookFromSuttaId(suttaid);
  if (b == null) return ref ? `Aṅguttara Nikāya · ${ref}` : "Aṅguttara Nikāya";
  return `Aṅguttara Nikāya · ${AN_BOOK_TITLES[b]} · ${ref}`;
}

/** Remove common speech-to-text bracket tags (e.g. `[Music]`) from displayed corpus text. */
export function stripTranscriptNoise(text: string): string {
  let s = text ?? "";
  s = s.replace(
    /\s*\[(?:Music|music|MUSIC|Laughter|laughter|LAUGHTER|Applause|applause|Noise|noise|Silence|silence)\]\s*/g,
    " ",
  );
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

/** Heading: English sutta name when available; else API `title`; else truncated transcript. */
export function itemDisplayHeading(item: ItemDetail): string {
  const en = item.sutta_name_en?.trim();
  if (en) return ensureEnglishSuttaSuffix(en);
  const t = item.title?.trim();
  if (t) return t;
  const s = stripTranscriptNoise(item.sutta).replace(/\s+/g, " ").trim();
  if (!s) return item.suttaid;
  const one = s.slice(0, 88);
  return one + (s.length > 88 ? "…" : "");
}

/** Mettā / advantages demo (AN 11.16) — optional infographic + public clip. */
export function isAn1116Sutta(suttaid: string | undefined | null): boolean {
  const x = (suttaid ?? "").trim().replace(/^AN\s+/i, "").trim();
  if (x === "11.16") return true;
  const head = (x.split(".")[0] ?? "").trim();
  const rest = (x.split(".")[1] ?? "").trim();
  return head === "11" && rest === "16";
}

function llmEnabledFromEnv(): boolean {
  const v = (import.meta.env.VITE_DAMA_USE_LLM as string | undefined)?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

export async function postDamaQuery(
  question: string,
  signal?: AbortSignal,
): Promise<DamaQueryResponse> {
  const base = getDamaApiBase();
  const url = `${base}/api/query`;
  const body = {
    question: question.trim(),
    book: "all",
    k: 6,
    use_llm: llmEnabledFromEnv(),
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    credentials: "omit",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `Request failed (${r.status})`);
  }
  return r.json() as Promise<DamaQueryResponse>;
}

export async function getItems(
  params?: { q?: string; book?: string },
  signal?: AbortSignal,
): Promise<{ items: ItemSummary[] }> {
  if (useDirectCorpusFs()) {
    return fetchItemsFromCorpusFs({ q: params?.q }, signal);
  }
  const base = getDamaApiBase();
  const usp = new URLSearchParams();
  if (params?.q) usp.set("q", params.q);
  if (params?.book) usp.set("book", params.book);
  const qs = usp.toString();
  const url = `${base}/api/items${qs ? `?${qs}` : ""}`;
  const r = await fetch(url, { method: "GET", signal, credentials: "omit" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `Request failed (${r.status})`);
  }
  return r.json() as Promise<{ items: ItemSummary[] }>;
}

export async function getItem(
  suttaid: string,
  params?: { book?: string },
  signal?: AbortSignal,
): Promise<ItemDetail> {
  if (useDirectCorpusFs()) {
    const data = await fetchItemFromCorpusFs(suttaid, signal);
    if (data.valid === false) {
      throw new Error("This sutta is not in the corpus (valid=false).");
    }
    return data;
  }
  const base = getDamaApiBase();
  const usp = new URLSearchParams();
  if (params?.book) usp.set("book", params.book);
  const qs = usp.toString();
  const url = `${base}/api/item/${encodeURIComponent(suttaid)}${qs ? `?${qs}` : ""}`;
  const r = await fetch(url, { method: "GET", signal, credentials: "omit" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `Request failed (${r.status})`);
  }
  const data = (await r.json()) as ItemDetail;
  if (data.valid === false) {
    throw new Error("This sutta is not in the corpus (valid=false).");
  }
  return data;
}
