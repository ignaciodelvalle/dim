// panorama-ia-v2 §3.6 — export/share provenance helpers (pure).
//
// The PNG export embeds an auditable metadata footer so a slide handed to an
// intendente carries its own provenance (data-as-of, source, scope, period,
// and how many cells were privacy-suppressed). Kept framework-free and pure so
// the footer text is unit-testable without a canvas or maplibre.

import { type ViewScopeDescriptor, viewScopeDigest } from "@/lib/ui/view-scope-descriptor";
import { formatAsOfDayLong } from "@/src/modules/panorama/domain/time-scrub";

/**
 * es-AR day label for the footer: "4 de julio de 2026".
 *
 * T2.4: delegates to THE one UTC-pinned as-of formatter (time-scrub.ts) — the
 * old local bare formatter used the runtime timezone (server UTC vs browser
 * ART could disagree by a day) and its own compact shape, so the exported
 * footer date could drift from the dock/context-bar rendering of the SAME cut.
 */
export function formatAsOfDate(date: Date): string {
  return formatAsOfDayLong(date);
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
  /**
   * V2 — the serializable scope this frame was cut from. A 34-pixel footer strip
   * cannot hold the descriptor itself (nor could a reader retype it), so the PNG
   * carries its DIGEST: an identity handle that ties the image to the full
   * descriptor printed in the informe and in the CSV header block.
   *
   * Be precise about what that buys: the digest lets you PROVE two artifacts
   * describe the same view, and lets you find the descriptor that regenerates
   * this frame. It does NOT reconstruct anything on its own, and it is a
   * non-cryptographic hash — never read it as tamper evidence. A PNG that must
   * stand alone as evidence needs the signature/expediente work, not a longer
   * footer. Omitted → the footer is exactly what it was before V2.
   */
  viewScope?: ViewScopeDescriptor | null;
};

/**
 * Build the export footer string. Always includes data-as-of, source (miMAR),
 * scope and period; appends the suppressed-cell count so the provenance is
 * complete (PO recommendation: always include the suppressed count for audit).
 *
 * Example:
 *   "Datos al 4 de julio de 2026 · miMAR · Nacional · últimos 90 días · 3 celdas protegidas por privacidad"
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
  // Last, so the human-readable provenance keeps the front of the strip and the
  // machine handle never displaces a word an operator actually reads.
  if (input.viewScope) {
    parts.push(`vista ${viewScopeDigest(input.viewScope)}`);
  }
  return parts.join(" · ");
}
