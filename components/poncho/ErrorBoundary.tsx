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
//
// Style posture (Poncho PR-C, 2026-05-28): only gob-* tokens, no raw
// Tailwind palette, no dark-mode utility prefixes. The previous draft used
// neutral-900 / amber-100 / amber-950 — all replaced. ErrorBoundary is a
// primitive of components/poncho/ and must cumple its own rule.

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "./Button";

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
    <main className="min-h-screen flex items-center justify-center p-6 bg-gob-surface">
      <div className="max-w-md w-full text-center space-y-4">
        <div
          className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-gob-warning/15 text-gob-warning-text text-3xl"
          aria-hidden="true"
        >
          ⚠
        </div>
        <h1 className="text-2xl font-semibold text-gob-text">Algo salió mal</h1>
        <p className="text-sm text-gob-text-muted">
          Probá de nuevo o volvé al inicio. Si el problema persiste, este es el código que el equipo
          necesita ver:
        </p>
        <p className="font-mono text-xs text-gob-text-muted break-all">
          {error.digest ?? (isProd ? "sin-digest" : error.message)}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="primary" onClick={reset} className="flex-1">
            Reintentar
          </Button>
          <Link href={homeHref} className="flex-1">
            <Button variant="secondary" className="w-full">
              {homeLabel}
            </Button>
          </Link>
        </div>
        {!isProd && (
          <details className="text-left text-xs text-gob-text-muted mt-4 pt-4 border-t border-gob-border">
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
