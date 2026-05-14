import { createAPIFileRoute } from "@tanstack/react-start/api";
import { spawn } from "node:child_process";

export const Route = createAPIFileRoute("/work-api/ingest")({
  POST: async ({ request }) => {
    const url = new URL(request.url);
    const urlParam = url.searchParams.get("url");

    if (!urlParam) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const pythonCommand = process.platform === "win32" ? "python.exe" : "python3";
    spawn(
      pythonCommand,
      ["-m", "uv", "run", "python", "-m", "scripts.pipeline.streaming.01_ingest", "--url", urlParam],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    ).unref();

    return new Response(JSON.stringify({ ok: true, message: "Ingest started in background" }), {
      headers: { "Content-Type": "application/json" }
    });
  },
});
