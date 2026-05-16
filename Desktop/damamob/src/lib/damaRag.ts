/**
 * Logic adapted from dama5 (chat_embed.html and ui_linkify.js)
 * for grounded chatbot citations, scrolling, and highlighting.
 */

export function normalizeSuttaCiteRef(raw: string): string {
  const t0 = String(raw || "").trim().replace(/\s+/g, " ");
  // Match cAN, pAN, or just the Nikaya code
  let m = t0.match(/^(c|p)?(AN|SN|MN|DN|KN)\s*(\d+(?:\.\d+)*)\s*$/i);
  if (m) {
    const prefix = m[1]?.toLowerCase() === 'c' ? 'c' : '';
    const nikaya = m[2].toUpperCase();
    const id = m[3];
    return prefix + nikaya + " " + id;
  }
  return t0;
}

export function partitionIntoParagraphs(raw: string): { start: number; end: number }[] {
  if (raw == null || raw.length === 0) return [{ start: 0, end: 0 }];
  if (/\n\n/.test(raw)) {
    const r = [];
    let start = 0;
    const re = /\n\n+/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      r.push({ start: start, end: m.index });
      start = m.index + m[0].length;
    }
    r.push({ start: start, end: raw.length });
    return r;
  }
  const sents: { start: number; end: number }[] = [];
  const re = /[\s\S]*?[.!?](?:\s+|$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    sents.push({ start: m.index, end: m.index + m[0].length });
  }
  if (sents.length === 0) {
    return [{ start: 0, end: raw.length }];
  }
  const lastEnd = sents[sents.length - 1].end;
  if (lastEnd < raw.length) {
    sents.push({ start: lastEnd, end: raw.length });
  }
  const ranges: { start: number; end: number }[] = [];
  let gStart = sents[0].start;
  let gEnd = sents[0].end;
  let sentCount = 1;
  for (let i = 1; i < sents.length; i++) {
    const next = sents[i];
    const candEnd = next.end;
    const candLen = candEnd - gStart;
    const segStart = raw.slice(next.start, Math.min(next.start + 48, next.end));
    const breakStem = /Monks,\s+I know not|I know not of any other single thing/i.test(segStart);
    if (sentCount >= 4 || candLen > 450 || (sentCount >= 2 && breakStem)) {
      ranges.push({ start: gStart, end: gEnd });
      gStart = next.start;
      gEnd = next.end;
      sentCount = 1;
    } else {
      gEnd = candEnd;
      sentCount++;
    }
  }
  ranges.push({ start: gStart, end: gEnd });
  return ranges;
}

export function findLooseRange(raw: string, needle: string): { start: number; end: number } | null {
  const r = String(raw || "");
  let n0 = String(needle || "").trim();
  if (!r || !n0) return null;

  // Exact match (fast path)
  let idx = r.indexOf(n0);
  if (idx >= 0) return { start: idx, end: idx + n0.length };

  // Strip common prefixes/suffixes that might be in chunks but not golden text
  // e.g. "AN 1.1 ", "1.1 ", "(AN 1.1)"
  n0 = n0.replace(/^[([]?\s*(?:c|p)?AN\s*\d+(?:\.\d+)*\s*[)\]]?\s*/i, "");
  n0 = n0.replace(/\s*[([]?\s*(?:c|p)?AN\s*\d+(?:\.\d+)*\s*[)\]]?\s*$/i, "");
  n0 = n0.trim();
  if (!n0) return null;

  idx = r.indexOf(n0);
  if (idx >= 0) return { start: idx, end: idx + n0.length };

  // Loose whitespace match
  const n = n0.replace(/\s+/g, " ").trim();
  const toks = n.split(" ").filter(Boolean).slice(0, 25);
  if (toks.length < 3) return null;
  const escTok = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pat = toks.map(escTok).join("\\s+");
  try {
    const re = new RegExp(pat, "i");
    const m = re.exec(r);
    if (m && m.index != null) return { start: m.index, end: m.index + m[0].length };
  } catch (e) {
    /* ignore regex errors */
  }
  return null;
}

export function extractDocBodyFromChunkText(kind: "sutta" | "commentary", text: string): string {
  const t = String(text || "");
  const k = kind.toLowerCase();
  if (k === "commentary") {
    const i = t.indexOf("TEACHER COMMENTARY:\n");
    if (i >= 0) return t.slice(i + "TEACHER COMMENTARY:\n".length).trim();
    const j = t.indexOf("TEACHER COMMENTARY:");
    if (j >= 0) return t.slice(j + "TEACHER COMMENTARY:".length).trim();
    return t.trim();
  }
  const i = t.indexOf("SUTTA:\n");
  if (i >= 0) return t.slice(i + "SUTTA:\n".length).trim();
  const j = t.indexOf("SUTTA:");
  if (j >= 0) return t.slice(j + "SUTTA:".length).trim();
  return t.trim();
}
