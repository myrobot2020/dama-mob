import { createAPIFileRoute } from "@tanstack/react-start/api";
import path from "node:path";
import fs from "node:fs";

export const Route = createAPIFileRoute("/work-api/clear-all")({
  POST: async () => {
    const projectRoot = process.cwd();
    const dbPath = path.join(projectRoot, "data", "work", "streaming", "pipeline.sqlite3");
    const audioDir = path.join(projectRoot, "data", "work", "streaming", "audio");
    const transDir = path.join(projectRoot, "data", "work", "streaming", "transcripts");

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
      if (fs.existsSync(transDir)) fs.rmSync(transDir, { recursive: true, force: true });

      fs.mkdirSync(audioDir, { recursive: true });
      fs.mkdirSync(transDir, { recursive: true });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
});
