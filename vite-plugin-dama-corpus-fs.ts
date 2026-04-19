/**
 * Serve sutta JSON from a corpus root (`/__dama_corpus__/…`) and teacher MP3s at `/dama-aud/`.
 * JSON lives under `<corpusRoot>/anN/suttas/`; audio can use a separate `audRoot` (see vite.config).
 * Works in `vite dev` and `vite preview` — no FastAPI required for corpus + MP3.
 */
import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import {
  itemSummaryFromDetail,
  passesCorpusGate,
  rawJsonToItemDetail,
} from "./src/lib/corpusJsonMap";

const JSON_PATH = /^an(?:1[01]|[1-9])\/suttas\/[^/\\]+\.json$/i;

function safeResolveUnder(root: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) return null;
  const abs = path.resolve(root, cleaned);
  const normRoot = path.resolve(root);
  if (!abs.startsWith(normRoot)) return null;
  return abs;
}

function corpusFsMiddleware(dama5Root: string, audRoot: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const raw = req.url?.split("?")[0] ?? "";

    if (raw === "/__dama_corpus__/index.json") {
      try {
        const items: ReturnType<typeof itemSummaryFromDetail>[] = [];
        const searchRows: { suttaid: string; blob: string }[] = [];
        for (let n = 1; n <= 11; n++) {
          const dir = path.join(dama5Root, `an${n}`, "suttas");
          if (!fs.existsSync(dir)) continue;
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
        }
        items.sort((a, b) => a.suttaid.localeCompare(b.suttaid, undefined, { numeric: true }));
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
      if (!JSON_PATH.test(rel.replace(/\\/g, "/"))) {
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
      const name = decodeURIComponent(raw.slice("/dama-aud/".length).split("/")[0] ?? "");
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
      fs.stat(fp, (e, st) => {
        if (e || !st.isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", "audio/mpeg");
        fs.createReadStream(fp).pipe(res);
      });
      return;
    }

    next();
  };
}

export function damaCorpusFsPlugin(dama5Root: string, audRoot: string): Plugin {
  const mw = corpusFsMiddleware(dama5Root, audRoot);
  return {
    name: "dama-corpus-fs",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    },
  };
}
