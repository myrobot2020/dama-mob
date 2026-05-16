import { env } from "./env";
import "./sentry";
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";
import { createRoot } from "react-dom/client";
import { App } from "./App";

Sentry.init({
  dsn: env.VITE_SENTRY_DSN || "https://33abf643fadc619993479e203875ace7@o4511341340983296.ingest.de.sentry.io/4511341346619472",
  environment: import.meta.env.MODE,
  integrations: [
    new BrowserTracing({
      tracingOrigins: ["localhost", "https://dama-mob-394934218986.asia-south1.run.app"],
    }),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.exception?.values?.[0]?.value?.includes("429")) {
      return null;
    }
    return event;
  },
});

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

