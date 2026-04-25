import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "../BottomNav";

let pathname = "/";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname }),
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    pathname = "/";
    document.documentElement.style.removeProperty("--dama-bottom-pad");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the four primary tabs without the next-sutta strip", () => {
    render(<BottomNav />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Sutta")).toBeInTheDocument();
    expect(screen.getByText("Tree")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.queryByText(/next/i)).not.toBeInTheDocument();
  });

  it("marks sutta detail routes as the Sutta tab", () => {
    pathname = "/sutta/1.48";
    render(<BottomNav />);

    expect(screen.getByText("Sutta")).toHaveClass("text-primary");
    expect(screen.getByText("Home")).toHaveClass("text-muted-foreground");
  });
});
