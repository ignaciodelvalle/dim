// Mandate-scoped resolution of KPI legal citations (red-team CRITICAL,
// PO-approved 2026-07): a government operator whose mandate is e.g.
// CABA + Tierra del Fuego + Santa Cruz used to see "PBA: Ley 14.107"
// (microchip) and "Ley CABA 5470" (mortality) cited on their tiles as THEIR
// legal obligation — laws of provinces NOT in their mandate. This module
// resolves a metric's legal basis against the operator's mandate provinces so
// a province's law is only ever shown to an operator whose mandate includes
// that province.
//
// Rules:
//   - National laws always apply — never province-gated.
//   - A province's laws are included ONLY when that province is in the
//     caller's mandate. Admin/national callers pass "all" and get everything.
//   - When a metric HAS provincial entries but NONE match the mandate, the
//     operator gets neutral es-AR framing ("Según la normativa provincial de
//     tu jurisdicción") — never a foreign province's law, never a blank.
//
// The citations here are the SAME strings already cited in
// lib/metrics/kpi-catalog.ts (target.source / caveats) — that catalog stays
// the canonical full national reference (admin view, info popovers); this
// module only decides WHICH of those citations a jurisdictional operator's
// tile may display. Do NOT add laws here that the catalog/docs do not already
// cite (no invented legal research).
//
// Province keys are the CANONICAL display names stored in govt_assignments'
// jurisdiction_province column (lib/domain/jurisdiction-canonical.ts →
// lib/reference/ar-provincias.ts PROVINCES): "Buenos Aires", "CABA", ….
// Lives in its own module (not kpi-catalog.ts) — the catalog is at its
// file-size ceiling.

import type { KpiId } from "./kpi-catalog";

export type MetricLegalBasis = {
  /** National anchors — always shown, never province-gated. */
  national?: string[];
  /** Canonical province display name → that province's citations. */
  byProvince?: Record<string, string[]>;
};

/**
 * The operator's mandate provinces (distinct canonical province names from
 * the auth guard's `jurisdictions`), or "all" for an admin/national caller
 * with universal scope.
 */
export type MandateProvinces = readonly string[] | "all";

// Per-metric legal basis — populated ONLY from citations that already exist
// in lib/metrics/kpi-catalog.ts today. None of these three metrics has a
// national anchor in the repo's citations; `national` stays absent until the
// catalog cites one.
export const METRIC_LEGAL_BASIS: Partial<Record<KpiId, MetricLegalBasis>> = {
  microchip_penetration: {
    byProvince: { "Buenos Aires": ["Ley Prov. 14.107"] },
  },
  ppp_registry_compliance: {
    byProvince: { CABA: ["Ley 4078"], "Buenos Aires": ["Ley Prov. 14.107"] },
  },
  mortality_disposal_traceability: {
    byProvince: { CABA: ["Ley 5470"] },
  },
};

// Short display prefix for provinces whose canonical name is long — matches
// the abbreviation the tiles already used ("PBA: Ley 14.107").
const PROVINCE_DISPLAY_PREFIX: Record<string, string> = {
  "Buenos Aires": "PBA",
};

/** Neutral es-AR fallback when the metric is province-regulated but none of
 * the mandate's provinces has a registered citation. */
export const PROVINCIAL_GAP_FALLBACK_ES = "Según la normativa provincial de tu jurisdicción";

function matchedProvinceEntries(
  basis: MetricLegalBasis,
  mandateProvinces: MandateProvinces,
): Array<[province: string, laws: string[]]> {
  const entries = Object.entries(basis.byProvince ?? {});
  if (mandateProvinces === "all") return entries;
  return entries.filter(([province]) => mandateProvinces.includes(province));
}

/**
 * Resolve the laws a caller with `mandateProvinces` may be shown for `kpiId`.
 *
 * `hasProvincialGap` is true when the metric HAS provincial entries but NONE
 * of the mandate's provinces matched — the render site should fall back to
 * national/neutral framing, never a foreign province's law.
 */
export function resolveMetricLegalBasis(
  kpiId: KpiId,
  mandateProvinces: MandateProvinces,
): { laws: string[]; hasProvincialGap: boolean } {
  const basis = METRIC_LEGAL_BASIS[kpiId];
  if (!basis) return { laws: [], hasProvincialGap: false };

  const matched = matchedProvinceEntries(basis, mandateProvinces);
  const laws = [...(basis.national ?? []), ...matched.flatMap(([, provinceLaws]) => provinceLaws)];
  const hasProvincialGap = Object.keys(basis.byProvince ?? {}).length > 0 && matched.length === 0;

  return { laws, hasProvincialGap };
}

/**
 * es-AR one-liner for tile/subtitle display, e.g. "CABA: Ley 5470",
 * "PBA: Ley Prov. 14.107", "Ley 22.953 (nacional)". When the metric is
 * province-regulated but no mandate province matched (and no national anchor
 * exists), returns the neutral fallback — NEVER a foreign province's law.
 * Returns null when the metric has no legal basis registered.
 */
export function formatMetricLegalBasis(
  kpiId: KpiId,
  mandateProvinces: MandateProvinces,
): string | null {
  const basis = METRIC_LEGAL_BASIS[kpiId];
  if (!basis) return null;

  const matched = matchedProvinceEntries(basis, mandateProvinces);
  const parts: string[] = (basis.national ?? []).map((law) => `${law} (nacional)`);
  for (const [province, laws] of matched) {
    const prefix = PROVINCE_DISPLAY_PREFIX[province] ?? province;
    parts.push(`${prefix}: ${laws.join(" / ")}`);
  }

  if (parts.length > 0) return parts.join(" · ");
  // Province-regulated metric, no mandate match, no national anchor → neutral
  // framing (never a foreign law, never a blank).
  if (Object.keys(basis.byProvince ?? {}).length > 0) return PROVINCIAL_GAP_FALLBACK_ES;
  return null;
}
