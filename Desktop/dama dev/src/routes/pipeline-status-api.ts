import { createAPIFileRoute } from "@tanstack/react-start/api";
import { spawnSync } from "node:child_process";

export const Route = createAPIFileRoute("/pipeline-status-api")({
  GET: async () => {
    const uvCommand = process.platform === "win32" ? "uv.exe" : "uv";
    const result = spawnSync(
      uvCommand,
      ["run", "python", "-m", "scripts.pipeline.streaming.status", "snapshot"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      }
    );

    if (result.status !== 0) {
      return new Response(JSON.stringify({ error: result.stderr || "snapshot failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(result.stdout, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  },
});
