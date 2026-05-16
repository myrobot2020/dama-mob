import { useEffect, useRef, useMemo } from "react";
import { partitionIntoParagraphs } from "@/lib/damaRag";

export function CanonQuote({
  text,
  source,
  highlightRange,
}: {
  text: string;
  /** Omitted on sutta reader when citation is shown above; still used on reflection answer. */
  source?: string;
  highlightRange?: { start: number; end: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const paragraphs = useMemo(() => {
    if (text.length < 500 && !text.includes("\n\n")) {
      return null;
    }
    return partitionIntoParagraphs(text);
  }, [text]);

  useEffect(() => {
    if (highlightRange && containerRef.current) {
      const mark = containerRef.current.querySelector("mark");
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightRange, text]);

  const renderContent = () => {
    if (!highlightRange) {
      if (!paragraphs) {
        return (
          <p className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
            "{text}"
          </p>
        );
      }
      return (
        <div className="space-y-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
              {text.slice(p.start, p.end)}
            </p>
          ))}
        </div>
      );
    }

    const { start, end } = highlightRange;

    if (!paragraphs) {
      const before = text.slice(0, start);
      const mid = text.slice(start, end);
      const after = text.slice(end);
      return (
        <p className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
          "
          {before}
          <mark className="bg-primary/30 text-inherit px-0.5 rounded-sm animate-highlight">
            {mid}
          </mark>
          {after}
          "
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {paragraphs.map((p, i) => {
          const pStart = p.start;
          const pEnd = p.end;

          // Check if highlight is in this paragraph
          if (end <= pStart || start >= pEnd) {
            return (
              <p key={i} className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
                {text.slice(pStart, pEnd)}
              </p>
            );
          }

          const localStart = Math.max(0, start - pStart);
          const localEnd = Math.min(pEnd - pStart, end - pStart);

          const pText = text.slice(pStart, pEnd);
          const before = pText.slice(0, localStart);
          const mid = pText.slice(localStart, localEnd);
          const after = pText.slice(localEnd);

          return (
            <p key={i} className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
              {before}
              <mark className="bg-primary/30 text-inherit px-0.5 rounded-sm animate-highlight">
                {mid}
              </mark>
              {after}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="border-y paper-rule px-5 py-6" ref={containerRef}>
      {renderContent()}
      {source?.trim() ? (
        <div className="mt-3 label-mono text-muted-foreground">— {source}</div>
      ) : null}
    </div>
  );
}
