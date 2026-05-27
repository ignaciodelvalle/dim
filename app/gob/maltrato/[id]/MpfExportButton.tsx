"use client";

// Client component: "Generar PDF MPF" button for the welfare detail page.
// Calls generateMpfExportAction and opens the signed URL in a new tab.
// Visible to admin and govt in scope (the detail page already enforces scope).

import { useState } from "react";

import { generateMpfExportAction } from "@/app/actions/welfare-export-mpf";

type Props = {
  welfareReportId: string;
};

export function MpfExportButton({ welfareReportId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setSuccess(false);
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
        setSuccess(true);
        window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Error inesperado. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
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
      </button>

      {error && <p className="text-xs text-gob-danger">{error}</p>}
      {success && (
        <p className="text-xs text-gob-success">
          PDF generado. Se abrió en una nueva pestaña. El link expira en 24 horas.
        </p>
      )}
      <p className="text-[10px] text-gob-text-muted">
        PDF formal para presentar ante la Unidad Fiscal de Maltrato Animal del MPF CABA (Ley
        14.346).
      </p>
    </div>
  );
}
