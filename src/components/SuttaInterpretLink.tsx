import { Link } from "@tanstack/react-router";

export function SuttaInterpretLink({ suttaId }: { suttaId: string }) {
  return (
    <Link
      to="/quiz/$suttaId"
      params={{ suttaId }}
      className="block w-full text-center py-4 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98]"
    >
      Try interpreting
    </Link>
  );
}
