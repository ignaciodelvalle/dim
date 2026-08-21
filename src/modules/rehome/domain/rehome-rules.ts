// Pure rules of the rehome-by-titular flow — no DB, no framework.
//
// Two moments, two rule sets:
//   - REQUEST (spec REQ-1, REQ-16): whom a titular may ask, and when.
//   - ACCEPT (design ADR-1 steps 1-4): what must still be true, under the
//     case lock, before the org is granted a custody row alongside the
//     titular's owner row. The use-case runs these INSIDE the transaction on
//     freshly re-read rows; a pre-transaction read is stale by construction.
//
// Every rule returns the es-AR refusal the user reads. The ORDER inside
// validateAcceptPreconditions is the design's order and is pinned by a test:
// the earliest failing step is the one reported, because "this request was
// already answered" is more actionable than "the pet is in observation".

export type RuleResult = { ok: true } | { ok: false; error: string };

/** Org types allowed to sponsor a listing. Mirrors the adoption catalog's filter. */
export const REHOME_ELIGIBLE_ORG_TYPES: readonly string[] = ["shelter", "rescue_network"];

export type SponsorTargetSnapshot = { orgType: string; verified: boolean };

export function validateSponsorTarget(org: SponsorTargetSnapshot | null): RuleResult {
  if (!org) return { ok: false, error: "Organización no encontrada." };
  if (!REHOME_ELIGIBLE_ORG_TYPES.includes(org.orgType)) {
    return {
      ok: false,
      error:
        "La organización no puede acompañar adopciones: tiene que ser un refugio o una red de rescate.",
    };
  }
  if (!org.verified) return { ok: false, error: "La organización no está verificada." };
  return { ok: true };
}

export type RequestOpenSnapshot = {
  petStatus: string;
  /** An open `rehome_request` case already exists for the pet. */
  hasOpenRequest: boolean;
  /** An accepted sponsorship is still running (unmatched `rehome_sponsorship_started`). */
  hasOpenSponsorship: boolean;
};

/** REQ-16: one open request OR one running sponsorship per pet, never both, never two. */
export function validateRequestOpen(s: RequestOpenSnapshot): RuleResult {
  if (s.petStatus === "deceased") {
    return { ok: false, error: "Esta mascota está registrada como fallecida." };
  }
  if (s.hasOpenSponsorship) {
    return {
      ok: false,
      error:
        "Esta mascota ya tiene una organización acompañando su adopción. Dá de baja ese acompañamiento antes de pedir otro.",
    };
  }
  if (s.hasOpenRequest) {
    return {
      ok: false,
      error:
        "Ya hay una solicitud de nuevo hogar pendiente para esta mascota. Esperá la respuesta o cancelala antes de enviar otra.",
    };
  }
  return { ok: true };
}

export type RequestAnswerSnapshot = {
  caseKind: string;
  caseStatus: string;
  caseReceiverOrganizationId: string | null;
  actingOrganizationId: string;
};

/** ADR-1 step 1: an OPEN rehome_request addressed to the acting org. */
export function validateDeclinePreconditions(s: RequestAnswerSnapshot): RuleResult {
  if (s.caseKind !== "rehome_request") {
    return { ok: false, error: "Este caso no es una solicitud de nuevo hogar." };
  }
  if (s.caseStatus !== "open") return { ok: false, error: "Esta solicitud ya fue respondida." };
  if (s.caseReceiverOrganizationId !== s.actingOrganizationId) {
    return { ok: false, error: "Esta solicitud está dirigida a otra organización." };
  }
  return { ok: true };
}

export type AcceptPetSnapshot = {
  status: string;
  inCustodyDispute: boolean | null;
  rabiesObservationStatus: string | null;
};

export type AcceptSnapshot = RequestAnswerSnapshot & {
  /** Step 2: the consenting titular still holds a live `owner` row. */
  titularOwnerRowLive: boolean;
  /** Step 3: live `shelter_custody` rows on the pet, any org. Must be 0. */
  liveShelterCustodyCount: number;
  /** Step 4: the catalog's own preconditions, failed here with a reason. */
  pet: AcceptPetSnapshot;
};

export function validateAcceptPreconditions(s: AcceptSnapshot): RuleResult {
  const step1 = validateDeclinePreconditions(s);
  if (!step1.ok) return step1;

  // Consent expires with title: a request accepted after a transfer would
  // grant custody on the word of an ex-owner.
  if (!s.titularOwnerRowLive) {
    return {
      ok: false,
      error: "La persona que pidió el acompañamiento ya no es titular de la mascota.",
    };
  }

  // One org at a time. Also excludes a pet already under decomiso or intake.
  if (s.liveShelterCustodyCount > 0) {
    return { ok: false, error: "Esta mascota ya está bajo custodia de una organización." };
  }

  if (s.pet.status === "lost") {
    return { ok: false, error: "Esta mascota está reportada como perdida." };
  }
  if (s.pet.status === "deceased") {
    return { ok: false, error: "Esta mascota está registrada como fallecida." };
  }
  if (s.pet.inCustodyDispute === true) {
    return { ok: false, error: "Esta mascota está en disputa de custodia." };
  }
  if (s.pet.rabiesObservationStatus === "in_progress") {
    return { ok: false, error: "Esta mascota está en período de observación sanitaria." };
  }
  return { ok: true };
}
