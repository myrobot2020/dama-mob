import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, mergeConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";
import { damaCorpusFsPlugin } from "./config/vite/vite-plugin-dama-corpus-fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async (env) => {
  const { mode } = env;

  const envDefine: Record<string, string> = {};
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  // Handle local filesystem serving if GCS is unavailable
  const corpusRoot = path.resolve(__dirname, "public"); // Fallback to public
  const audRoot = path.resolve(__dirname, "public/audio");
  const damaFs = damaCorpusFsPlugin(corpusRoot, audRoot);

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'mask-icon.svg'],
      manifest: {
        name: 'DAMA Mobile',
        short_name: 'DAMA',
        description: 'Pāḷi Canon Sutta Corpus & Study Tool',
        theme_color: '#ffffff',
        icons: [{ src: 'mask-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
    }),
    ...(process.env.CI_GCP === "1" ? [nitro({ preset: "node-server", serverDir: path.resolve(__dirname, "server") })] : []),
    damaFs,
  ];

  return mergeConfig(
    {
      define: envDefine,
      resolve: {
        alias: { "@": path.join(process.cwd(), "src") },
        dedupe: [
          "react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime",
          "@tanstack/react-query", "@tanstack/query-core",
          "@tanstack/react-router", "@tanstack/react-start", "@tanstack/router-core",
        ],
      },
      plugins,
      server: {
        host: "0.0.0.0",
        port: 8031,
        proxy: {
          "/api": {
            target: "http://127.0.0.1:8088",
            changeOrigin: true,
          },
          "/dama-aud": {
            target: "http://localhost:8031",
            rewrite: (path) => path.replace(/^\/dama-aud/, "/audio"),
          },
        },
      },
    },
    {}
  );
});
