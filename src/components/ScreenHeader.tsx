import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronLeft, Bookmark } from "lucide-react";

export function ScreenHeader({
  title,
  center,
  showBack = true,
  showBookmark = false,
}: {
  title?: string;
  /** Replaces centered title when set (e.g. corpus nav). */
  center?: ReactNode;
  showBack?: boolean;
  showBookmark?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 backdrop-blur-xl bg-background/60 min-h-[52px]">
      {showBack ? (
        <button
          type="button"
          onClick={() => router.history.back()}
          className="size-9 rounded-full glass flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
      ) : (
        <div className="size-9 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex flex-col items-center justify-center">
        {center != null ? (
          center
        ) : title ? (
          <h2 className="label-mono text-muted-foreground text-center truncate max-w-full">{title}</h2>
        ) : null}
      </div>
      {showBookmark ? (
        <Link
          to="/reflect"
          className="size-9 rounded-full glass flex items-center justify-center shrink-0"
        >
          <Bookmark size={16} />
        </Link>
      ) : (
        <div className="size-9 shrink-0" aria-hidden />
      )}
    </header>
  );
}
