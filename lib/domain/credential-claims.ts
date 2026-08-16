// ---------------------------------------------------------------------------
// Credential claim tiering (ADR-7, jurisdiction-compliance spec CT1/CT2).
//
// The public credential MUST NOT imply state registration in a province with
// no registry rule backing that claim. The jurisdiction's registry mandate is
// expressed through the `microchip_required` business rule (the
// identification/registration rule): when a row RESOLVES for the pet's
// jurisdiction and the obligation applies (the OR5 gate — an explicit
// `mandatory` tier, or a pre-tier row whose payload requires the chip), the
// credential keeps its full, unqualified "Identidad registrada" language.
//
// When NO row resolves anywhere in the cascade — or the resolved tier says
// the jurisdiction does not regulate — the heading scopes the claim to miMAR
// ("Identidad registrada en miMAR"): the same qualified claim the landing
// chrome already makes for every /p page ("the only claim this chrome can
// honestly make", AppShell variant=landing). Registration IN miMAR is true
// for every credential; registration with THE registry needs a rule to back
// it.
//
// The resolver's DEFAULT payload ({required: true}) deliberately does NOT
// back the full claim: it is a product stopgap (RG2, ratification-gated), not
// a law of the pet's province — hence the matchedRow requirement. Pure
// module: the caller resolves the rule (RSC), this only maps it to language.
// ---------------------------------------------------------------------------

import type { RequirementLevel } from "@/db/schema";
import { microchipObligationApplies } from "@/lib/domain/business-rules-defaults";

/** Full claim — preserved verbatim for mandatory + registry-backed (CT2). */
export const IDENTITY_HEADING_REGISTRY_BACKED = "Identidad registrada";
/** Neutral claim — scoped to miMAR, no state-registration implication (CT1). */
export const IDENTITY_HEADING_NEUTRAL = "Identidad registrada en miMAR";

export type CredentialRegistryClaim = {
  /** True only when a registry rule row resolved AND the obligation applies. */
  registryBacked: boolean;
  /** es-AR heading for the credential's identity section. */
  identityHeading: string;
};

export function deriveCredentialRegistryClaim(
  rule: {
    requirementLevel?: RequirementLevel | null;
    payload: { required?: boolean };
    matchedRow: unknown | null;
  } | null,
): CredentialRegistryClaim {
  const registryBacked =
    rule != null && rule.matchedRow != null && microchipObligationApplies(rule);
  return {
    registryBacked,
    identityHeading: registryBacked ? IDENTITY_HEADING_REGISTRY_BACKED : IDENTITY_HEADING_NEUTRAL,
  };
}
