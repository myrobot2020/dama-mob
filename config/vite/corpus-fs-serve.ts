/**
 * Shared Connect middleware: serves `GET /__dama_corpus__/…` (JSON) and `/dama-aud/*` (teacher audio).
 * Used by Vite dev/preview (`vite-plugin-dama-corpus-fs.ts`) and Nitro production (`server/middleware/`).
 */
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  itemSummaryFromDetail,
  passesCorpusGate,
  rawJsonToItemDetail,
} from "../../src/lib/corpusJsonMap";

/** an/an1..an11/*.json (preferred), legacy an1..an11/suttas/*.json, or sn/dn/mn/kn paths. */
function isAllowedCorpusJsonRel(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (/^an\/an(?:1[01]|[1-9])\/[^/]+\.json$/i.test(n)) return true;
  if (/^an(?:1[01]|[1-9])\/suttas\/[^/]+\.json$/i.test(n)) return true;
  for (const nk of ["sn", "dn", "mn", "kn"] as const) {
    const re = new RegExp(`^${nk}\\/${nk}\\d+\\/suttas\\/[^/]+\\.json$`, "i");
    if (re.test(n)) return true;
  }
  return false;
}

function safeResolveUnder(root: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) return null;
  const abs = path.resolve(root, cleaned);
  const normRoot = path.resolve(root);
  if (!abs.startsWith(normRoot)) return null;
  return abs;
}

function collectSuttaJsonDir(
  dama5Root: string,
  relDir: string,
): {
  items: ReturnType<typeof itemSummaryFromDetail>[];
  searchRows: { suttaid: string; blob: string }[];
} {
  const items: ReturnType<typeof itemSummaryFromDetail>[] = [];
  const searchRows: { suttaid: string; blob: string }[] = [];
  const dir = path.join(dama5Root, ...relDir.split("/"));
  if (!fs.existsSync(dir)) return { items, searchRows };
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = ent.name;
    if (!ent.isFile() || !name.endsWith(".json")) continue;
    const nl = name.toLowerCase();
    if (nl === "_index.json" || nl.startsWith("_")) continue;
    const fp = path.join(dir, name);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(fs.readFileSync(fp, "utf-8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const it = rawJsonToItemDetail(obj);
    if (!passesCorpusGate(it)) continue;
    const sum = itemSummaryFromDetail(it);
    items.push(sum);
    searchRows.push({
      suttaid: it.suttaid,
      blob: `${it.suttaid}\n${it.sutta}\n${it.commentry ?? ""}`.toLowerCase(),
    });
  }
  return { items, searchRows };
}

export function corpusFsMiddleware(dama5Root: string, audRoot: string) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const raw = req.url?.split("?")[0] ?? "";

    if (raw === "/__dama_corpus__/index.json") {
      try {
        const items: ReturnType<typeof itemSummaryFromDetail>[] = [];
        const searchRows: { suttaid: string; blob: string }[] = [];
        for (let n = 1; n <= 11; n++) {
          const chunkNew = collectSuttaJsonDir(dama5Root, `an/an${n}`);
          if (chunkNew.items.length > 0) {
            items.push(...chunkNew.items);
            searchRows.push(...chunkNew.searchRows);
            continue;
          }
          const chunkLegacy = collectSuttaJsonDir(dama5Root, `an${n}/suttas`);
          items.push(...chunkLegacy.items);
          searchRows.push(...chunkLegacy.searchRows);
        }
        for (const nk of ["sn", "dn", "mn", "kn"] as const) {
          const nkRoot = path.join(dama5Root, nk);
          if (fs.existsSync(nkRoot)) {
            for (const ent of fs.readdirSync(nkRoot, { withFileTypes: true })) {
              if (!ent.isDirectory()) continue;
              const m = new RegExp(`^${nk}(\\d+)$`, "i").exec(ent.name);
              if (!m) continue;
              const chunk = collectSuttaJsonDir(dama5Root, `${nk}/${ent.name}/suttas`);
              items.push(...chunk.items);
              searchRows.push(...chunk.searchRows);
            }
          }
        }
        items.sort((a, b) =>
          a.suttaid.localeCompare(b.suttaid, undefined, { numeric: true }),
        );
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ items, searchRows }));
      } catch {
        res.statusCode = 500;
        res.end();
      }
      return;
    }

    if (raw.startsWith("/__dama_corpus__/")) {
      const rel = decodeURIComponent(raw.slice("/__dama_corpus__/".length));
      if (!isAllowedCorpusJsonRel(rel.replace(/\\/g, "/"))) {
        res.statusCode = 400;
        res.end("invalid corpus path");
        return;
      }
      const fp = safeResolveUnder(dama5Root, rel);
      if (!fp) {
        res.statusCode = 403;
        res.end();
        return;
      }
      fs.readFile(fp, (err, buf) => {
        if (err) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(buf);
      });
      return;
    }

    if (raw.startsWith("/dama-aud/")) {
      const name = decodeURIComponent(
        raw.slice("/dama-aud/".length).split("/")[0] ?? "",
      );
      if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
        next();
        return;
      }
      const audDir = path.resolve(audRoot);
      const fp = path.join(audDir, name);
      if (!fp.startsWith(path.resolve(audDir))) {
        next();
        return;
      }
      const lower = name.toLowerCase();
      const mime =
        lower.endsWith(".webm") || lower.endsWith(".weba")
          ? "audio/webm"
          : lower.endsWith(".m4a") || lower.endsWith(".mp4") || lower.endsWith(".aac")
            ? "audio/mp4"
          : lower.endsWith(".opus")
            ? "audio/opus"
            : "audio/mpeg";
      fs.stat(fp, (e, st) => {
        if (e || !st.isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", mime);
        fs.createReadStream(fp).pipe(res);
      });
      return;
    }

    next();
  };
}
