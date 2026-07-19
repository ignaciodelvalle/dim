"use client";

// Client component: "Generar PDF MPF" button for the welfare detail page.
// Calls generateMpfExportAction and renders the signed URL as a visible link.
// Visible to admin and govt in scope (the detail page already enforces scope).
//
// WHY a visible <a> instead of window.open(url) after the await: the browser
// popup blocker kills a window.open() call that isn't inside the direct click
// gesture (this one runs after an async server action), so the tab silently
// never opens while the UI still claimed success — the único fiscal output
// could vanish behind a green check. Mirrors TravelExportButton.tsx's pattern
// (H3 backlog fix).

import { useState } from "react";

import { OpButton } from "@/components/ui/dashboard";
import { generateMpfExportAction } from "@/src/modules/welfare/actions";

type Props = {
  welfareReportId: string;
};

export function MpfExportButton({ welfareReportId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    try {
      const result = await generateMpfExportAction(welfareReportId);
      if (!result.ok) {
        setError(
          result.error === "pdf_render_failed"
            ? "Error al generar el PDF. Intentá de nuevo."
            : result.error === "storage_upload_failed"
              ? "Error al subir el PDF. Verificá la conectividad con el servidor."
              : "Error al generar el export. Intentá de nuevo.",
        );
      } else {
        setSignedUrl(result.signedUrl);
      }
    } catch {
      setError("Error inesperado. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <OpButton type="button" onClick={handleClick} disabled={loading} variant="primary">
        {loading ? (
          <>
            <svg
              className="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generando PDF...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            Generar PDF MPF
          </>
        )}
      </OpButton>

      {error && <p className="text-[11px] text-ln-op-danger">{error}</p>}
      {signedUrl && (
        <p className="text-[11px] text-ln-op-ok">
          PDF generado.{" "}
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ln-op-azul hover:underline font-medium"
          >
            Abrir/Descargar el informe
          </a>{" "}
          — el link expira en 24 horas.
        </p>
      )}
      <p className="text-xs text-ln-op-mute">
        PDF formal para presentar ante la Unidad Fiscal de Maltrato Animal del MPF CABA (Ley
        14.346).
      </p>
    </div>
  );
}
