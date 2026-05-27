"use client";

// Shared error-boundary surface used by every route-group error.tsx in the
// app (sprint 6 PR-051). Next.js calls the route-level error.tsx with two
// props — error + reset — and this component renders a friendly fallback
// with two actions: Reintentar (invokes reset()) and Volver al inicio.
//
// Privacy posture: we render the error.message in non-production to help
// debugging. In production we surface a stable digest (Next.js's hashed
// error reference) so support can match it against server logs without
// leaking stack traces.

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
};

export function ErrorBoundary({
  error,
  reset,
  homeHref = "/",
  homeLabel = "Volver al inicio",
}: Props) {
  // Log the error so it lands in the browser console + telemetry hooks. The
  // server side already logged it as part of the boundary trip — this is
  // purely for in-tab debugging.
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  const isProd = process.env.NODE_ENV === "production";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md w-full text-center space-y-4">
        <div
          className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40 text-3xl"
          aria-hidden="true"
        >
          ⚠
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Algo salió mal
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Probá de nuevo o volvé al inicio. Si el problema persiste, este es el código que el equipo
          necesita ver:
        </p>
        <p className="font-mono text-xs text-neutral-500 dark:text-neutral-500 break-all">
          {error.digest ?? (isProd ? "sin-digest" : error.message)}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="flex-1 px-5 py-3 rounded-xl bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-semibold text-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Reintentar
          </button>
          <Link
            href={homeHref}
            className="flex-1 px-5 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-sm text-center hover:bg-neutral-50 dark:hover:bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2"
          >
            {homeLabel}
          </Link>
        </div>
        {!isProd && (
          <details className="text-left text-xs text-neutral-500 dark:text-neutral-500 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <summary className="cursor-pointer font-medium">Stack trace (solo dev)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10px]">
              {error.stack ?? "(sin stack)"}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
