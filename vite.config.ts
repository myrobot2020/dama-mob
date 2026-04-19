// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { damaCorpusFsPlugin } from "./vite-plugin-dama-corpus-fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname);
/** When set (e.g. Cloud Build), skip Cloudflare adapter and emit a Node server via Nitro for Cloud Run. */
const ciGcp = process.env.CI_GCP === "1";
const validJsonDir = path.join(projectRoot, "valid json");
/** Corpus JSON root: env override, else `valid json/` when present (an*, sn, dn, mn, kn), else repo root. */
const corpusRoot = process.env.VITE_DAMA5_ROOT
  ? path.resolve(process.env.VITE_DAMA5_ROOT)
  : fs.existsSync(validJsonDir) && fs.statSync(validJsonDir).isDirectory()
    ? validJsonDir
    : projectRoot;
/**
 * Teacher MP3 directory for `/dama-aud/*`. Override with `VITE_DAMA_AUD_ROOT`.
 * If `<corpusRoot>/aud` exists it wins; otherwise defaults to `<project>/aud` so JSON-only corpus folders still find audio.
 */
function resolveAudRoot(): string {
  const raw = process.env.VITE_DAMA_AUD_ROOT?.trim();
  if (raw) return path.resolve(raw);
  const underCorpus = path.join(corpusRoot, "aud");
  if (fs.existsSync(underCorpus) && fs.statSync(underCorpus).isDirectory()) {
    return underCorpus;
  }
  return path.join(projectRoot, "aud");
}
const audRoot = resolveAudRoot();
const damaFs =
  fs.existsSync(corpusRoot) && fs.statSync(corpusRoot).isDirectory()
    ? damaCorpusFsPlugin(corpusRoot, audRoot)
    : null;

const fsAllowDirs = [projectRoot, corpusRoot];
if (!fsAllowDirs.some((p) => path.resolve(p) === path.resolve(audRoot))) {
  fsAllowDirs.push(audRoot);
}

// Proxy /api to a local FastAPI backend (optional). Start it on port 8000 when using chat/reflect.
const damaProxy = {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
  },
  // Fallback when middleware does not serve a file (optional FastAPI same paths).
  "/dama-aud": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/dama-aud/, "/aud"),
  },
} as const;

export default defineConfig({
  cloudflare: ciGcp ? false : undefined,
  vite: {
    plugins: [
      ...(ciGcp
        ? [
            nitro({
              preset: "node-server",
              serverDir: path.resolve(__dirname, "server"),
            }),
          ]
        : []),
      ...(damaFs ? [damaFs] : []),
    ],
    server: {
      fs: {
        // App source, corpus JSON root, and `aud/` when outside corpus.
        allow: fsAllowDirs,
      },
      proxy: { ...damaProxy },
    },
    // Same as dev: LAN `vite preview --host` must proxy /api or corpus calls 404 / hang.
    preview: {
      fs: {
        allow: fsAllowDirs,
      },
      proxy: { ...damaProxy },
    },
  },
});
