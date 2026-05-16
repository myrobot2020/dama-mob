import React from "react";
import { normalizeSuttaCiteRef } from "@/lib/damaRag";

export function GroundedResponse({
  text = "",
  onCitationClick,
}: {
  text?: string;
  onCitationClick?: (kind: "sutta" | "commentary", ref: string) => void;
}) {
  const safeText = text || "";
  // Enhanced citation regex matching (AN 1.1), (SN 1.1), (cAN 1.1), etc.
  const re = /\b(cAN|pAN|AN|SN|MN|DN|KN)\s*\d+(?:\.\d+)*\b/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = re.exec(safeText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(safeText.slice(lastIndex, match.index));
    }

    const rawRef = match[0];
    const normRef = normalizeSuttaCiteRef(rawRef);
    const kind = normRef.startsWith("cAN") ? "commentary" : "sutta";

    parts.push(
      <button
        key={match.index}
        onClick={() => onCitationClick?.(kind, normRef)}
        className="text-primary hover:underline font-medium inline-block"
      >
        {rawRef}
      </button>
    );

    lastIndex = re.lastIndex;
  }

  if (lastIndex < safeText.length) {
    parts.push(safeText.slice(lastIndex));
  }

  return (
    <p className="text-reading leading-relaxed text-foreground whitespace-pre-wrap">
      {parts.length > 0 ? parts : safeText}
    </p>
  );
}
