/**
 * Pure mapping from dama5 per-sutta JSON → app types (shared by API client and Vite fs plugin).
 */

import type { ItemDetail, ItemSummary, NikayaId } from "./damaApi";
import { ensureEnglishSuttaSuffix } from "./suttaTitle";

function inferNikayaFromSuttaId(suttaid: string): NikayaId {
  const raw = (suttaid || "").trim();
  if (!raw) return "AN";
  const up = raw.toUpperCase();
  if (/^\s*SN[\s.]/i.test(raw) || /^\s*SN$/i.test(raw)) return "SN";
  if (/^\s*DN[\s.]/i.test(raw) || /^DN\d/i.test(up)) return "DN";
  if (/^\s*MN[\s.]/i.test(raw) || /^MN\d/i.test(up)) return "MN";
  if (/^\s*KN\b/i.test(raw)) return "KN";
  return "AN";
}

export function stripAnPrefix(s: string): string {
  return s
    .trim()
    .replace(/^AN\s+/i, "")
    .trim();
}

function coerceValid(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off", ""].includes(s)) return false;
  }
  return false;
}

function normalizeSuttaIdDisplay(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const prefixed = /^(AN|SN|DN|MN|KN)\s+/i.exec(s);
  if (prefixed) {
    const p = prefixed[1].toUpperCase();
    const rest = s.slice(prefixed[0].length).trim();
    return `${p} ${rest}`;
  }
  if (/^\d/.test(s)) return `AN ${s}`;
  return s;
}

export function rawJsonToItemDetail(obj: Record<string, unknown>): ItemDetail {
  const sidRaw = String(obj.sutta_id ?? obj.suttaid ?? "").trim();
  const suttaid = normalizeSuttaIdDisplay(sidRaw);
  const sutta = String(obj.sutta ?? "").trim();
  const comm = String(obj.commentary ?? obj.commentry ?? "").trim();
  let commentary_id = String(obj.commentary_id ?? "").trim();
  if (!commentary_id && suttaid) {
    const sid = suttaid.trim();
    if (/^SN\s+/i.test(sid) || /^DN\s+/i.test(sid) || /^MN\s+/i.test(sid) || /^KN\s+/i.test(sid)) {
      commentary_id = `c${sid}`;
    } else {
      commentary_id = `cAN ${stripAnPrefix(suttaid)}`;
    }
  }
  const valid = Object.prototype.hasOwnProperty.call(obj, "valid") ? coerceValid(obj.valid) : false;

  return {
    suttaid,
    sutta,
    sutta_name_en: String(obj.sutta_name_en ?? "").trim() || undefined,
    sutta_name_pali: String(obj.sutta_name_pali ?? "").trim() || undefined,
    commentry: comm,
    commentary_id: commentary_id || undefined,
    sc_id: String(obj.sc_id ?? "").trim() || undefined,
    sc_url: String(obj.sc_url ?? "").trim() || undefined,
    sc_sutta: String(obj.sc_sutta ?? "").trim() || undefined,
    aud_file: String(obj.aud_file ?? "").trim() || undefined,
    aud_start_s: typeof obj.aud_start_s === "number" ? obj.aud_start_s : Number(obj.aud_start_s) || 0,
    aud_end_s: typeof obj.aud_end_s === "number" ? obj.aud_end_s : Number(obj.aud_end_s) || 0,
    youtube_url: String(obj.youtube_url ?? "").trim() || undefined,
    youtube_video_id: String(obj.youtube_video_id ?? "").trim() || undefined,
    chain: (obj.chain && typeof obj.chain === "object" ? obj.chain : null) as ItemDetail["chain"],
    valid,
  };
}

export function passesCorpusGate(it: ItemDetail): boolean {
  if (it.valid !== true) return false;
  if (!(it.sutta || "").trim()) return false;
  if (!(it.aud_file || "").trim()) return false;
  return true;
}

export function titleFromCorpusItem(it: ItemDetail): string {
  const en = it.sutta_name_en?.trim();
  if (en) return ensureEnglishSuttaSuffix(en);
  const s = it.sutta.replace(/\s+/g, " ").trim();
  const one = s.slice(0, 72);
  return one + (s.length > 72 ? "…" : "");
}

export function itemSummaryFromDetail(it: ItemDetail): ItemSummary {
  return {
    suttaid: it.suttaid,
    title: titleFromCorpusItem(it),
    has_commentary: !!(it.commentry || "").trim(),
    nikaya: inferNikayaFromSuttaId(it.suttaid),
  };
}
