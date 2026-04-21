import { Link, useLocation } from "@tanstack/react-router";
import { Home, BookOpen, Trees, NotebookPen, User } from "lucide-react";
import { NextSuttaStrip } from "@/components/NextSuttaStrip";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/sutta", label: "Sutta", icon: BookOpen },
  { to: "/tree", label: "Tree", icon: Trees },
  { to: "/reflect", label: "Journal", icon: NotebookPen },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 px-3 pb-3 pt-2">
      <NextSuttaStrip />
      <div className="glass rounded-2xl flex items-center justify-around px-2 py-2">
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
