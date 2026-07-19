// MPF (Ministerio Público Fiscal) export jurisdiction gate.
//
// Reusable pattern (engram: pattern/locality-variable-capability-gating): any
// capability that depends on per-jurisdiction configuration must, when NOT
// configured for the report's jurisdiction, be DISABLED with a visible
// explanation — never offered as an action that would route to the wrong
// destination.
//
// First instance: the welfare denuncia export to fiscalía. The generated PDF
// hardcodes "Unidad Fiscal de Maltrato Animal del MPF CABA" (see
// lib/analytics/welfare-exports.ts) — there is no per-province routing logic.
// Offering the button in a province other than CABA would generate a PDF
// addressed to the wrong prosecutor's office. Today only CABA has an MPF
// integration; adding a province is a CONFIG change here, not new gating code.
//
// `jurisdiction_province` is stored as the display name from
// lib/reference/ar-provincias.ts (e.g. "CABA", "Buenos Aires", "Mendoza") —
// see lib/domain/jurisdiction-canonical.ts. "CABA" (not the long form) is the
// canonical province name for the City of Buenos Aires.
export const MPF_CONFIGURED_PROVINCES: ReadonlySet<string> = new Set(["CABA"]);

/**
 * True when the MPF export is wired up for this province — i.e. the export
 * would reach the correct fiscalía. False (including for null/unset
 * jurisdiction) means the export must be disabled, never offered.
 */
export function isMpfConfiguredForProvince(province: string | null | undefined): boolean {
  if (!province) return false;
  return MPF_CONFIGURED_PROVINCES.has(province);
}
