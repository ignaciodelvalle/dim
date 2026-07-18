// panorama-ia-v2 §3.6 — export/share provenance helpers (pure).
//
// The PNG export embeds an auditable metadata footer so a slide handed to an
// intendente carries its own provenance (data-as-of, source, scope, period,
// and how many cells were privacy-suppressed). Kept framework-free and pure so
// the footer text is unit-testable without a canvas or maplibre.

/** es-AR short date: "4 jul 2026". */
export function formatAsOfDate(date: Date): string {
  // es-AR renders "4 de jul. de 2026"; the footer uses the compact "4 jul 2026"
  // form, so drop the "de" connectors and abbreviation dots.
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/\bde\b/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExportFooterInput = {
  /** The data-as-of date (scrub time), or null for "live" current data. */
  asOf: Date | null;
  /** es-AR scope label, e.g. "Nacional" or "Provincia de Buenos Aires". */
  scopeLabel: string;
  /** es-AR period label, e.g. "últimos 90 días" or "estado actual". */
  periodLabel: string;
  /** Number of k-anon-suppressed cells in the current view (audit trail). */
  suppressedCount: number;
  /** Injectable "now" for deterministic tests; defaults to new Date(). */
  now?: Date;
};

/**
 * Build the export footer string. Always includes data-as-of, source (miMAR),
 * scope and period; appends the suppressed-cell count so the provenance is
 * complete (PO recommendation: always include the suppressed count for audit).
 *
 * Example:
 *   "Datos al 4 jul 2026 · miMAR · Nacional · últimos 90 días · 3 celdas protegidas por privacidad"
 */
export function buildExportFooter(input: ExportFooterInput): string {
  const asOfDate = input.asOf ?? input.now ?? new Date();
  const parts = [
    `Datos al ${formatAsOfDate(asOfDate)}`,
    "miMAR",
    input.scopeLabel,
    input.periodLabel,
  ];
  if (input.suppressedCount > 0) {
    const phrase =
      input.suppressedCount === 1
        ? "1 celda protegida por privacidad"
        : `${input.suppressedCount} celdas protegidas por privacidad`;
    parts.push(phrase);
  }
  return parts.join(" · ");
}
