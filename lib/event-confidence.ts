// Confidence tier — pure projection over pet_events provenance fields.
//
// Decision A1 (plan 2026-05-22): pure function, no schema changes, computes
// on read from existing columns: authorRole, authorVerified, authorOrganizationId,
// and optional payload fields (reporter_role, confirmed_by_lab, triggered_by).
//
// Decision A5: NOT persisted to DB. Computed on read. O(1), trivial cost.

export type ConfidenceTier =
  | "institutional_verified"
  | "professional_verified"
  | "corroborated"
  | "self_reported"
  | "unverified";

// Ascending order of trustworthiness — index 0 = lowest, index 4 = highest.
// Used by isAtLeast() for threshold comparisons.
export const CONFIDENCE_ORDER: ReadonlyArray<ConfidenceTier> = [
  "unverified",
  "self_reported",
  "corroborated",
  "professional_verified",
  "institutional_verified",
];

export interface ConfidenceInput {
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
}

/**
 * Derives the confidence tier for a pet event from its provenance fields.
 * Pure function — no DB calls, no side effects.
 *
 * Rules (applied in priority order):
 *  A4 bumper: confirmed_by_lab=true → institutional_verified (lab = independent third party)
 *  shelter verified + org  → institutional_verified
 *  govt verified           → institutional_verified
 *  vet verified            → professional_verified
 *  owner + corroboration   → corroborated
 *  owner alone             → self_reported
 *  scanner (anon QR)       → unverified
 *  anything else           → self_reported (defensive default)
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceTier {
  const { authorRole, authorVerified, authorOrganizationId, payload } = input;

  // A4 bumper: lab confirmation overrides all lower tiers.
  // A positive lab result is an independent third party regardless of who submitted.
  if (payload.confirmed_by_lab === true) return "institutional_verified";

  // Org-backed institutional actors (verified + has an org ID).
  if (authorRole === "shelter" && authorVerified && authorOrganizationId) {
    return "institutional_verified";
  }
  if (authorRole === "govt" && authorVerified) {
    return "institutional_verified";
  }

  // Licensed veterinarian with verified matriculation.
  if (authorRole === "vet" && authorVerified) {
    return "professional_verified";
  }

  // Owner with supporting evidence.
  if (authorRole === "owner") {
    const hasEvidenceHash =
      typeof (payload as { evidence_hash?: unknown }).evidence_hash === "string";
    const microchipMatched =
      (payload as { matched_chip_number?: unknown }).matched_chip_number != null ||
      payload.microchip_confirmed === true;
    if (hasEvidenceHash || microchipMatched) return "corroborated";
    return "self_reported";
  }

  // Anonymous scanner (QR scan by non-logged user).
  if (authorRole === "scanner") return "unverified";

  // Defensive default: any unmapped role (system events, future roles) → self_reported.
  return "self_reported";
}

/**
 * Returns true when `tier` is at least as trustworthy as `minimum`.
 * Uses CONFIDENCE_ORDER index comparison (higher index = higher trust).
 *
 * Example: isAtLeast("professional_verified", "corroborated") === true
 */
export function isAtLeast(tier: ConfidenceTier, minimum: ConfidenceTier): boolean {
  return CONFIDENCE_ORDER.indexOf(tier) >= CONFIDENCE_ORDER.indexOf(minimum);
}

/**
 * Human-readable es-AR label for a confidence tier.
 * Used at render time only — descriptive, NOT judgmental (decision A7).
 * Never says "high confidence" or "low confidence" — always describes the source.
 */
export function confidenceLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case "institutional_verified":
      return "Verificado institucionalmente";
    case "professional_verified":
      return "Verificado por veterinario matriculado";
    case "corroborated":
      return "Autorreportado con evidencia";
    case "self_reported":
      return "Reportado por el dueño";
    case "unverified":
      return "Sin verificar";
  }
}
