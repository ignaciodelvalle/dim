// Who may open a rabies observation on somebody else's animal.
//
// WHY THIS EXISTS (H1, top-10 review 2026-08-22)
// ---------------------------------------------------------------------------
// `reportBiteFromOrgAction` was gated by ONE fact: the caller holds the
// `bite.report` capability in some organization. Creating an organization asks
// for a DNI that nothing verifies and makes the creator its admin, so that one
// fact was reachable by any self-registered citizen in about a minute. With it,
// and the DIM token off a collar, they could declare that a stranger's dog bit
// somebody: red banner on the public credential, alert to the pet's sanitary
// authorities, rehome and adoption blocked — and since 2026-08-17 the owner
// cannot lift it, only a professional or the State can.
//
// Two skeptics walked the chain independently and neither found a guard the
// original author had merely overlooked: there was none. The sibling channel
// (welfare derivation to an org) already demands `organization.verified`; the
// bite report was the only consequential org write with neither a verification
// gate nor a relationship gate.
//
// THE RULE IS A CONJUNCTION OF TWO FACTS, AND THE SECOND IS A DISJUNCTION
//
//   verified  AND  (attended/held this animal  OR  works where the bite happened)
//
// `verified` alone is not enough: a verified shelter in Ushuaia would still be
// able to open an observation on a pet in Salta it has never seen. A
// relationship alone is not enough either: an unverified "organization" would
// still be able to report the animal it claims to be holding.
//
// The second half MUST be a disjunction, because a real flow dies otherwise: a
// verified shelter reporting a bite by an animal it does NOT hold — someone
// else's dog bit a volunteer at its door — has no attendance and no custody row
// for that pet. Its standing comes from the INCIDENT being inside the zone it
// works in. That is what `organization_coverage` already models, so this reads
// it through lib/domain/org-coverage.ts rather than inventing a second
// coverage predicate next to the one rehome and foster share.
//
// The zone compared is the INCIDENT's, not the pet's home. A bite is the
// incident authority's problem (the same LEGAL-ROUTING rule the case and the
// authority fan-out already follow in report-bite-from-org.ts). Comparing the
// pet's home instead would authorize a stranger org for every animal registered
// in the one locality it covers, wherever in the country they were bitten.
//
// Pure — no DB, no framework. The two facts arrive as data.

import { type CoverageArea, type PetZone, orgCoversZone } from "@/lib/domain/org-coverage";

export type OrgBiteAuthorityInput = {
  /** `organizations.verified` for the REPORTING org. */
  orgVerified: boolean;
  /**
   * Has this org ever attended or held this animal? Any live-or-past ownership
   * row (custody, foster, shelter custody) or any pet_event this org authored.
   * Historical on purpose: the clinic that treated the dog last year is exactly
   * the reporter this gate must keep.
   */
  hasPetRelation: boolean;
  /** The org's `organization_coverage` rows. Empty = covers nothing. */
  coverageAreas: readonly CoverageArea[];
  /** Where the bite happened (province/locality), NOT where the pet lives. */
  incidentZone: PetZone;
};

export type OrgBiteAuthorityResult = { ok: true } | { ok: false; error: string };

export function assertOrgMayReportBite(input: OrgBiteAuthorityInput): OrgBiteAuthorityResult {
  if (!input.orgVerified) {
    // Same voice as the sibling refusals (welfare/actions.ts:565, 1194): the
    // subject is the caller's OWN organization, and the sentence says what to
    // do about it rather than only that the door is shut.
    return {
      ok: false,
      error:
        "Tu organización todavía no está verificada por miMAR. Solo una organización verificada puede iniciar una observación antirrábica.",
    };
  }

  if (input.hasPetRelation) return { ok: true };
  if (orgCoversZone(input.coverageAreas, input.incidentZone)) return { ok: true };

  return {
    ok: false,
    error:
      "Tu organización no atendió a esta mascota ni tiene cobertura en la jurisdicción del incidente. Reportá la mordedura a la autoridad sanitaria de esa zona.",
  };
}
