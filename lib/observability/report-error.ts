// Single entry point for reporting errors caught at a global error boundary
// (app/error.tsx → components/ErrorBoundary.tsx, app/global-error.tsx). Every
// boundary calls this instead of `console.error` directly, so wiring a real
// telemetry sink later is a one-file change instead of a search-and-replace
// across every boundary.
//
// TODO(PO): pick a sink (Sentry / Vercel Observability / LogRocket / etc.) and
// forward `payload` there. Deliberately dependency-free until that choice is
// made — no external SDK is imported here.
//
// Scope: this is the APP-WIDE seam (route error.tsx + shared ErrorBoundary).
// It does not cover panorama's inline WebGL recovery
// (components/panorama/MapErrorBoundary.tsx) — that boundary is owned by a
// different lane and keeps its own console.error for now.

export type ReportErrorContext = {
  /** Where the error was caught — a route segment or boundary name, e.g. "/gob/panorama" or "ErrorBoundary". */
  route?: string;
  /** Any other structured context worth attaching (boundary name, homeHref, etc.). */
  [key: string]: unknown;
};

export type ReportedErrorPayload = {
  message: string;
  stack: string | undefined;
  digest: string | undefined;
} & ReportErrorContext;

/**
 * Reports a client-side error in a consistent structured shape. Currently
 * logs to `console.error`; the sink is deferred (see module TODO above).
 */
export function reportError(
  error: Error & { digest?: string },
  context?: ReportErrorContext,
): void {
  const payload: ReportedErrorPayload = {
    message: error.message,
    stack: error.stack,
    digest: error.digest,
    ...context,
  };

  // TODO(PO): forward `payload` to the chosen telemetry sink here.
  console.error("[reportError]", payload);
}
