import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity, Layers, Database, BarChart2, Home } from "lucide-react";

import appCss from "../styles.css?url";
import { ClientTelemetry } from "@/components/ClientTelemetry";
import { ThemeSync } from "@/components/ThemeSync";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dāma Dev" },
      {
        name: "description",
        content: "Tickerplant operations and performance dashboard.",
      },
      { property: "og:title", content: "Dāma Dev" },
      {
        property: "og:description",
        content: "Tickerplant operations and performance dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const isMobilePreview = useRouterState({
    select: (s) => {
      const sp = new URLSearchParams(s.location.search);
      const v = (sp.get("mobile") ?? "").trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes";
    },
  });

  // Some mobile emulators do not translate mouse wheels into touch scrolling.
  useEffect(() => {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (!coarsePointer) return;

    const handleWheel = (e: WheelEvent) => {
      window.scrollBy({
        top: e.deltaY,
        behavior: "auto",
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const app = (
    <>
      <ThemeSync />
      <ClientTelemetry />
      <div className="flex flex-col min-h-screen">
        <div className="flex-1">
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </>
  );

  if (!isMobilePreview) return app;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[430px] min-h-screen border-x border-border/60 shadow-2xl relative flex flex-col">
        {app}
      </div>
    </div>
  );
}

function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/plant", label: "Tape", icon: Activity, exact: true },
    { to: "/plant/waves", label: "Waves", icon: Layers, exact: false },
    { to: "/plant/hdb", label: "HDB", icon: Database, exact: false },
    { to: "/plant/performance", label: "Stats", icon: BarChart2, exact: false },
  ];

  return (
    <nav className="sticky bottom-0 z-30 flex h-16 w-full items-center justify-around border-t border-border bg-background/95 backdrop-blur lg:hidden">
      {items.map((item) => {
        const active = item.exact ? path === item.to : path.startsWith(item.to);
        return (
          <Link
            key={item.label}
            to={item.to}
            className={`flex flex-col items-center gap-1 transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {item.label}
            </span >
          </Link>
        );
      })}
    </nav>
  );
}
