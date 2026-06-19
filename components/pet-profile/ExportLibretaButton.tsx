"use client";

// ExportLibretaButton — Item 14.3.
//
// Triggers the server-side on-the-fly libreta PDF export by opening
// /api/mis-mascotas/[publicToken]/libreta-export in a new tab. The route
// returns print-ready HTML; the browser's auto-print script lets the user
// save it as PDF. No persistence (pet_attachments deferred).
//
// Empty libreta edge: the export route renders an empty-state section —
// no broken PDF.

export function ExportLibretaButton({ petPublicToken }: { petPublicToken: string }) {
  function handleExport() {
    const url = `/api/mis-mascotas/${petPublicToken}/libreta-export`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="cursor-pointer font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] hover:underline print:hidden"
    >
      Exportar libreta (PDF)
    </button>
  );
}
