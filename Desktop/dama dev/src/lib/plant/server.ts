import { createServerFn } from "@tanstack/react-start";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const projectRoot = process.cwd();

export const ingestUrl = createServerFn({ method: "POST" })
  .validator((url: string) => url)
  .handler(async ({ data: urlParam }) => {
    console.log(`[Ingest] Received request for: ${urlParam}`);

    // In production/cloud, we might need to use 'python3' or 'python'
    const pythonCommand = process.platform === "win32" ? "python.exe" : "python3";

    const child = spawn(
      pythonCommand,
      ["-m", "uv", "run", "python", "-m", "scripts.pipeline.streaming.01_ingest", "--url", urlParam],
      {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    );

    child.unref();
    return { ok: true, message: "Ingest started in background" };
  });

export const getPipelineStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const uvCommand = process.platform === "win32" ? "uv.exe" : "uv";
    const result = spawnSync(
      uvCommand,
      ["run", "python", "-m", "scripts.pipeline.streaming.status", "snapshot"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || "snapshot failed");
    }

    return JSON.parse(result.stdout);
  });

export const getPipelineEvents = createServerFn({ method: "GET" })
  .validator((limit: number) => limit)
  .handler(async ({ data: limit }) => {
    const uvCommand = process.platform === "win32" ? "uv.exe" : "uv";
    const result = spawnSync(
      uvCommand,
      ["run", "python", "-m", "scripts.pipeline.streaming.status", "events", "--limit", String(limit), "--json"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      }
    );

    return JSON.parse(result.stdout);
  });
