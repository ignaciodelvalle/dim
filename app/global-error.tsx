"use client";

// Root-level error boundary (Next.js App Router convention). Renders ONLY when
// an error escapes the root layout itself — it must supply its own <html>/<body>
// because the root layout did not render. Kept dependency-free and self-styled
// (no app providers, no shared chrome) so it works even when the app shell is
// the thing that crashed. The richer per-segment errors are handled by nested
// error.tsx boundaries; this is the last-resort fallback. Colors reference the
// design-system CSS variables (globals.css is loaded at the document level).

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console; production digests are also logged
    // server-side by Next so support can correlate via the digest.
    console.error("global-error boundary:", error);
  }, [error]);

  return (
    <html lang="es-AR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "var(--color-ln-paper)",
          color: "var(--color-ln-ink)",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-ln-mute)",
              margin: "0 0 8px",
            }}
          >
            Algo salió mal
          </p>
          <h1 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 12px" }}>
            No pudimos cargar la página
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--color-ln-mute)",
              margin: "0 0 20px",
            }}
          >
            Ocurrió un error inesperado. Probá de nuevo; si el problema persiste, volvé al inicio.
            {error.digest ? (
              <span style={{ display: "block", marginTop: "8px", fontSize: "12px" }}>
                Código de referencia: <code>{error.digest}</code>
              </span>
            ) : null}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: "44px",
                padding: "0 20px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-ln-card)",
                background: "var(--color-ln-azul)",
              }}
            >
              Reintentar
            </button>
            <a
              href="/"
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 20px",
                borderRadius: "8px",
                border: "1px solid var(--color-ln-line)",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-ln-ink)",
              }}
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
