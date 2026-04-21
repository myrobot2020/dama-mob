import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { damaCorpusFsPlugin } from "./config/vite/vite-plugin-dama-corpus-fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname);
/** When set (e.g. Cloud Build), skip Cloudflare adapter and emit a Node server via Nitro for Cloud Run. */
const ciGcp = process.env.CI_GCP === "1";
const validatedJsonDir = path.join(projectRoot, "data", "validated-json");
const legacyValidJsonDir = path.join(projectRoot, "valid json");
/** Corpus JSON root: env override, else `data/validated-json/` (or legacy `valid json/`) when present, else repo root. */
const corpusRoot = process.env.VITE_DAMA5_ROOT
  ? path.resolve(process.env.VITE_DAMA5_ROOT)
  : fs.existsSync(validatedJsonDir) && fs.statSync(validatedJsonDir).isDirectory()
    ? validatedJsonDir
    : fs.existsSync(legacyValidJsonDir) && fs.statSync(legacyValidJsonDir).isDirectory()
      ? legacyValidJsonDir
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
    rewrite: (pathStr: string) => pathStr.replace(/^\/dama-aud/, "/aud"),
  },
} as const;

export default defineConfig(async (env) => {
  const { command, mode } = env;

  const envDefine: Record<string, string> = {};
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    ...(command === "build" && !ciGcp
      ? await (async () => {
          try {
            const { cloudflare } = await import("@cloudflare/vite-plugin");
            return [
              cloudflare({
                viteEnvironment: { name: "ssr" },
              }),
            ];
          } catch {
            return [];
          }
        })()
      : []),
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    ...(ciGcp
      ? [
          nitro({
            preset: "node-server",
            serverDir: path.resolve(__dirname, "server"),
          }),
        ]
      : []),
    ...(damaFs ? [damaFs] : []),
  ];

  const base = mergeConfig(
    {
      define: envDefine,
      resolve: {
        alias: {
          "@": path.join(process.cwd(), "src"),
        },
        dedupe: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "@tanstack/react-query",
          "@tanstack/query-core",
        ],
      },
      plugins,
      server: {
        host: "::",
        port: 8080,
        fs: {
          allow: fsAllowDirs,
        },
        proxy: { ...damaProxy },
      },
      preview: {
        fs: {
          allow: fsAllowDirs,
        },
        proxy: { ...damaProxy },
      },
    },
    {},
  );

  return mergeConfig(base, {
    server: {
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      },
    },
  });
});
