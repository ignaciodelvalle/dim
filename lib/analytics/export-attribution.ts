// Shared attribution footer for every PDF this system hands to a human.
//
// WHY THIS MODULE EXISTS
// ---------------------------------------------------------------------------
// The line "Documento generado por DIM — Trazabilidad: … — mimar.ar" was
// triplicated verbatim across the MPF (fiscalía) denuncia, the PPP certificate
// and the travel document. All three signed the document with "DIM" — the
// INTERNAL codename (CLAUDE.md: "Internal codename DIM (code, schema,
// DIM-XXXX-XXXX tokens); user-facing brand miMAR").
//
// On the Ley 14.346 denuncia that is not a cosmetic slip: the header says
// "miMAR — Mi Mascota Argentina" and the footer of the same page attributed
// the document to a different, unexplained name. A fiscal reading it sees two
// issuers on one instrument.
//
// Triplication is what let one wrong word ship to three legal surfaces, so the
// fix is a single origin, not three edits. scripts/check-brand-casing.ts
// Rule 2 keeps it from coming back.
//
// The codename is NOT a secret — /acerca discloses it deliberately. It simply
// is not the name the product signs documents with.

/** User-facing brand. The codename never appears in document attribution. */
export const PUBLIC_BRAND_NAME = "miMAR";

/** Public domain printed alongside the attribution. */
export const PUBLIC_BRAND_DOMAIN = "mimar.ar";

/**
 * The one-line attribution printed at the foot of every exported PDF.
 *
 * @param traceabilityCode the code that lets the holder trace this exact
 *   document back to its record — a denuncia reference code (MPF) or a pet
 *   public token (PPP / travel).
 */
export function documentAttributionLine(traceabilityCode: string): string {
  return `Documento generado por ${PUBLIC_BRAND_NAME} — Trazabilidad: ${traceabilityCode} — ${PUBLIC_BRAND_DOMAIN}`;
}
