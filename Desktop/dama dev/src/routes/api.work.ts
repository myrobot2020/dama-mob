import { createAPIFileRoute } from "@tanstack/react-start/api";
import path from "node:path";
import fs from "node:fs";

export const Route = createAPIFileRoute("/api/work")({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const p = url.searchParams.get("p");

    if (!p) {
      return new Response("Missing path", { status: 400 });
    }

    const workRoot = path.join(process.cwd(), "data", "work");
    const cleanP = p.replace(/^data\/work\//, "").replace(/\\/g, "/");
    const filePath = path.resolve(workRoot, cleanP);

    if (
      filePath.startsWith(workRoot + path.sep) &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
        ".json": "application/json; charset=utf-8",
        ".json3": "application/json; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
      };

      const fileBuffer = fs.readFileSync(filePath);
      return new Response(fileBuffer, {
        headers: {
          "Content-Type": mimeTypes[ext] || "application/octet-stream",
        },
      });
    }

    return new Response("File not found", { status: 404 });
  },
});
