import * as Sentry from "@sentry/react";

// Initialize Sentry - minimal config to avoid conflicts
Sentry.init({
  dsn: "https://33abf643fadc619993479e203875ace7@o4511341340983296.ingest.de.sentry.io/4511341346619472",
  environment: "production",
  integrations: [],  // Empty array = no router integration
  tracesSampleRate: 0.2,
});

export { Sentry };
