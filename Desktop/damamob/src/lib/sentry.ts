// src/lib/sentry.ts
import * as Sentry from "@sentry/react";

export function setSentryUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

export function trackEvent(name: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({
    category: "user",
    message: name,
    data: data,
    level: "info",
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

export async function trackPerformance<T>(
  name: string,
  operation: () => Promise<T>,
  data?: Record<string, any>
): Promise<T> {
  const transaction = Sentry.startTransaction({ name, op: "function" });
  try {
    const result = await operation();
    transaction.setStatus("ok");
    return result;
  } catch (error) {
    transaction.setStatus("internal_error");
    Sentry.captureException(error, { extra: data });
    throw error;
  } finally {
    transaction.finish();
  }
}

export const ErrorBoundary = Sentry.ErrorBoundary;
