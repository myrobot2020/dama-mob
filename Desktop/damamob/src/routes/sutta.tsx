import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { DEFAULT_SUTTA_ID } from "@/lib/damaApi";

/**
 * Parent layout for `/sutta/*`. Child `sutta.$suttaId` must render via `<Outlet />`.
 * Visiting `/sutta` alone redirects to the default corpus id.
 */
export const Route = createFileRoute("/sutta")({
  component: SuttaLayout,
});

function SuttaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/sutta") {
    return <Navigate to="/sutta/$suttaId" params={{ suttaId: DEFAULT_SUTTA_ID }} replace />;
  }
  return <Outlet />;
}
