import { createAPIFileRoute } from "@tanstack/react-start/api";
import { spawnSync } from "node:child_process";

export const Route = createAPIFileRoute("/pipeline-events-api")({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit") || "100";
    const uvCommand = process.platform === "win32" ? "uv.exe" : "uv";

    const result = spawnSync(
      uvCommand,
      ["run", "python", "-m", "scripts.pipeline.streaming.status", "events", "--limit", limit, "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      }
    );

    return new Response(result.stdout, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  },
});
