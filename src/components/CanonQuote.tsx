export function CanonQuote({
  text,
  source,
}: {
  text: string;
  /** Omitted on sutta reader when citation is shown above; still used on reflection answer. */
  source?: string;
}) {
  return (
    <div className="border-y paper-rule px-5 py-6">
      <p className="text-reading text-[1.28rem] leading-[1.55] text-foreground">
        "{text}"
      </p>
      {source?.trim() ? (
        <div className="mt-3 label-mono text-muted-foreground">— {source}</div>
      ) : null}
    </div>
  );
}
