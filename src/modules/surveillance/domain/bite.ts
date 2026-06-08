// Pure domain rules for bite incidents and govt jurisdiction scoping.
//
// Legal framework:
//   - Decreto 4669/1973 (PBA) — biting animal reporting obligations.
//   - Ley 22.953 (rabies control) — govt jurisdiction authority.
//
// Zero runtime imports — pure domain logic.

// ---------------------------------------------------------------------------
// Bite enums
// ---------------------------------------------------------------------------

export const VICTIM_KINDS = ["human", "animal", "unknown"] as const;
export type VictimKind = (typeof VICTIM_KINDS)[number];

export const BITE_SEVERITIES = ["minor", "moderate", "severe"] as const;
export type BiteSeverity = (typeof BITE_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Reporter role mapping
// ---------------------------------------------------------------------------

export type ReporterRole = "vet" | "shelter" | "govt" | "witness";

/**
 * Maps an organization's org_type to the reporter_role enum value used inside
 * incident_reported.payload.reporter_role.
 * Defaults to "witness" for org types that don't fit one of the medical /
 * animal-welfare buckets.
 *
 * Mirrors the orgTypeToReporterRole function in app/actions/bite.ts exactly.
 */
export function orgTypeToReporterRole(orgType: string): ReporterRole {
  switch (orgType) {
    case "clinic":
      return "vet";
    case "shelter":
    case "rescue_network":
      return "shelter";
    case "sanitary_authority":
      return "govt";
    default:
      return "witness";
  }
}

// ---------------------------------------------------------------------------
// Govt jurisdiction scope predicate
// ---------------------------------------------------------------------------

export type CaseJurisdiction = {
  province: string | null;
  locality: string | null;
};

export type GovtJurisdiction = {
  province: string;
  locality: string;
};

/**
 * Returns true when the actor is in scope to act on the given case.
 *
 * Rules (spec scenarios H, I — outbreak; also professional-close D):
 *   - admin → universal (always in scope).
 *   - govt, zero jurisdictions → false (no assignments).
 *   - national case (province = null) → any govt with ≥1 jurisdiction is in scope.
 *   - located case → at least one assigned jurisdiction must match:
 *       province === case.province AND
 *       (case.locality === null OR jurisdiction.locality === case.locality).
 */
export function isInScope(
  actorRole: "admin" | "govt",
  govtJurisdictions: readonly GovtJurisdiction[],
  caseJurisdiction: CaseJurisdiction,
): boolean {
  if (actorRole === "admin") return true;

  // govt with no assignments can never be in scope.
  if (govtJurisdictions.length === 0) return false;

  // National case (no province) → any govt with assignments is in scope.
  if (caseJurisdiction.province === null) return true;

  // Located case: find a matching jurisdiction.
  return govtJurisdictions.some(
    (j) =>
      j.province === caseJurisdiction.province &&
      (caseJurisdiction.locality === null || j.locality === caseJurisdiction.locality),
  );
}
