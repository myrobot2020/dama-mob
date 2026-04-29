import { Link, useLocation } from "@tanstack/react-router";
import { Home, BookOpen, Trees, User, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/sutta", label: "Sutta", icon: BookOpen },
  { to: "/reflect", label: "Reflect", icon: Sparkles },
  { to: "/tree", label: "Tree", icon: Trees },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav({ topSlot }: { topSlot?: ReactNode }) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return;

    const root = document.documentElement;
    const setPad = () => {
      const r = el.getBoundingClientRect();
      // small buffer for shadows/glow and iOS rounding
      const px = Math.ceil(r.height + 8);
      root.style.setProperty("--dama-bottom-pad", `${px}px`);
    };

    setPad();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => setPad());
      ro.observe(el);
    }

    window.addEventListener("resize", setPad);
    return () => {
      window.removeEventListener("resize", setPad);
      ro?.disconnect();
      // Only clear if we're still the same mounted nav.
      root.style.setProperty("--dama-bottom-pad", "0px");
    };
  }, [pathname]);

  return (
    <nav
      ref={(n) => {
        navRef.current = n;
      }}
      className="fixed bottom-0 inset-x-0 z-50 px-3 pt-2 bg-background border-t border-border/60"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {topSlot}
      <div className="rounded-2xl bg-background ring-1 ring-white/10 flex items-center justify-around px-2 py-2">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/"
              ? pathname === "/"
              : to === "/sutta"
                ? pathname === "/sutta" || pathname.startsWith("/sutta/") || pathname === "/browse"
                : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Icon
                size={20}
                className={active ? "text-primary" : "text-muted-foreground"}
                style={active ? { filter: "drop-shadow(0 0 6px var(--glow))" } : undefined}
              />
              <span className={`text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
