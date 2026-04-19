import { Hexagon } from "lucide-react";

export function CanonQuote({
  text,
  source,
}: {
  text: string;
  /** Omitted on sutta reader when citation is shown above; still used on reflection answer. */
  source?: string;
}) {
  return (
    <div className="relative rounded-2xl glass p-5 pl-6">
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-primary glow-soft" />
      <div className="flex items-center gap-2 mb-3">
        <Hexagon size={12} className="text-primary fill-primary" style={{ filter: "drop-shadow(0 0 6px var(--glow))" }} />
        <span className="label-mono text-primary">Canon · Verified</span>
      </div>
      <p className="text-[15px] leading-relaxed text-foreground/90 italic">
        "{text}"
      </p>
      {source?.trim() ? (
        <div className="mt-3 label-mono text-muted-foreground">— {source}</div>
      ) : null}
    </div>
  );
}
