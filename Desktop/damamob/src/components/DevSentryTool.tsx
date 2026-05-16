// src/components/DevSentryTool.tsx
import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";

export function DevSentryTool() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const loadInitAndTest = async () => {
    setStatus("loading");
    setMessage("Loading Sentry...");

    try {
      const Sentry = await import("@sentry/react");
      const { BrowserTracing } = await import("@sentry/tracing");

      Sentry.init({
        dsn: "https://33abf643fadc619993479e203875ace7@o4511341340983296.ingest.de.sentry.io/4511341346619472",
        environment: "development",
        integrations: [new BrowserTracing()],
        tracesSampleRate: 1.0,
      });

      setMessage("Sentry initialized! Sending test error...");
      
      Sentry.captureException(new Error("🧪 Dev test from dama-mob - Sentry is working!"));
      Sentry.addBreadcrumb({
        category: "dev",
        message: "Sentry enabled via dev button",
        level: "info",
      });

      setStatus("success");
      setMessage("✅ Test error sent! Check your Sentry dashboard");
      (window as any).__SENTRY__ = Sentry;

    } catch (error: any) {
      setStatus("error");
      setMessage(`Failed: ${error.message}`);
    }
  };

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium">🧪 Sentry Dev Tool</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <Button
          onClick={loadInitAndTest}
          disabled={status === "loading"}
          className="w-full"
          variant={status === "error" ? "destructive" : "default"}
        >
          {status === "loading" ? "Loading..." : "🚀 Load, Init & Test Sentry"}
        </Button>
        {message && (
          <p className={`text-xs mt-3 ${
            status === "error" ? "text-destructive" : "text-muted-foreground"
          }`}>
            {message}
          </p>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground pt-0 pb-3">
        Click once, then check Sentry dashboard
      </CardFooter>
    </Card>
  );
}

export default DevSentryTool;
