// The projection from the owner-face domain read onto its wire shape.
//
// It lives beside the route, not inside the reader, for the reason the public
// credential's `payload.ts` gives: the reader answers "what is true about this
// animal", and this answers "what may a client hold, and in what form". Those
// are different questions with different reasons to change, and the page — which
// consumes the same reader and none of this — is the proof they are separable.
//
// WHAT THIS DELIBERATELY DROPS. `OwnerPetDetail` is wider than `OwnerPetDetailV1`
// on purpose: `typedEvents` (the pet's clinical spine), `lost.lostScans` (scan
// geolocation and finder photos), `viewerContacts` (the viewer's own phone
// numbers) and `canonicalIds` (the microchip code) are all read for the page's
// own components and NONE of them cross here. A payload a device caches to disk
// carries what the owner face SHOWS, not everything the server touched to build
// it.

import { apiV1Envelope } from "@/lib/infra/api-v1";
import type { OwnerPetDetail } from "@/src/modules/pets/application/read/load-owner-pet-detail";
import type {
  OwnerPetAlertsSection,
  OwnerPetBannersSection,
  OwnerPetCarouselSection,
  OwnerPetCasesSection,
  OwnerPetComplianceSection,
  OwnerPetDetailV1,
  OwnerPetDetailViewerRole,
  OwnerPetIdentitySection,
  OwnerPetObligationCardV1,
  OwnerPetPregnancySection,
  OwnerPetRemindersSection,
  OwnerPetStatusSection,
  PublicPetStatus,
} from "@dim/contract/api";
import {
  OWNER_PET_DETAIL_PAYLOAD_VERSION,
  OWNER_PET_DETAIL_STALE_AFTER_MS,
  PUBLIC_PET_STATUSES,
} from "@dim/contract/api";

/**
 * `pets.status` narrowed to the three states a client knows.
 *
 * Anything else is reported as `active`, which is the same clamp the public
 * credential applies. A status this contract has no word for must not become an
 * undefined field a client branches on.
 */
function toPublicPetStatus(status: string): PublicPetStatus {
  return (PUBLIC_PET_STATUSES as readonly string[]).includes(status)
    ? (status as PublicPetStatus)
    : "active";
}

/**
 * The viewer's role.
 *
 * The organization path has no ownership row of its own — the ORGANIZATION
 * holds the animal and the caller is a member of it — so it reports
 * `org_member` rather than borrowing the org's ownership role, which would tell
 * a client that a volunteer is the titular.
 */
function toViewerRole(
  accessPath: "owner" | "org",
  ownershipRole: string | null,
): OwnerPetDetailViewerRole {
  if (accessPath === "org") return "org_member";
  switch (ownershipRole) {
    case "owner":
    case "co_owner":
    case "foster":
    case "caretaker":
      return ownershipRole;
    default:
      // An owner-path access with a role this contract has no word for. It
      // still HELD the pet (requirePetAccess proved that), so refuse the
      // titular affordances rather than the read: `caretaker` is the least
      // privileged holder word available, and isTitular below is false anyway.
      return "caretaker";
  }
}

function toObligationCard(
  card: OwnerPetDetail["compliance"]["cards"][number],
): OwnerPetObligationCardV1 {
  return {
    key: card.key,
    label: card.label,
    state: card.state,
    tone: card.tone,
    detail: card.detail,
    legalFootnote: card.legalFootnote,
    // The projection leaves these undefined when they do not apply. Over a
    // network an absent key and a null value are the same thing, so they are
    // normalised to null here rather than left for a client to guess at.
    currencyKnown: card.currencyKnown ?? null,
    currencyUntil: card.currencyUntil ?? null,
    dataUnknown: card.dataUnknown ?? false,
    requirementTier: card.requirementTier ?? null,
  };
}

/** How many reminders a single read hands a client. */
export const OWNER_PET_REMINDERS_CAP = 20;

export function buildOwnerPetDetailV1(input: {
  publicToken: string;
  petStatus: string;
  pregnancyStatus: string | null;
  accessPath: "owner" | "org";
  detail: OwnerPetDetail;
  now: Date;
}): OwnerPetDetailV1 {
  const { detail, now } = input;

  const identity: OwnerPetIdentitySection = {
    name: detail.identity.name,
    species: detail.identity.species,
    // The contract types sex as the shared `PetSex` vocabulary; a row carrying
    // anything else reports null rather than widening the union.
    sex:
      detail.identity.sex === "male" || detail.identity.sex === "female"
        ? detail.identity.sex
        : null,
    breed: detail.identity.breed,
    breedLine: detail.identity.breedLine,
    photoUrl: detail.identity.photoUrl,
    jurisdictionProvince: detail.identity.jurisdictionProvince,
    jurisdictionLocality: detail.identity.jurisdictionLocality,
    tags: detail.identity.tags.map((t) => ({ key: t.key, label: t.label })),
  };

  const status: OwnerPetStatusSection = {
    petStatus: toPublicPetStatus(input.petStatus),
    ringStatus: detail.ringStatus,
    // The MASTHEAD situation, which is the one that also tints for a deceased
    // animal — the face body's `situation` is null there because the memorial
    // skin owns it and the two skins never stack. A client rendering a header
    // wants the band's version; nothing on the wire wants the other one.
    situation: detail.chromeSituation,
    memorial: detail.memorial,
    pregnancyStatus: input.pregnancyStatus,
  };

  const alerts: OwnerPetAlertsSection = { items: detail.alerts };

  const compliance: OwnerPetComplianceSection = {
    cards: detail.compliance.cards.map(toObligationCard),
    summary: detail.compliance.summary,
    worstTone: detail.compliance.worstTone,
    worstIsUnknown: detail.compliance.worstIsUnknown,
  };

  const shownReminders = detail.reminders.slice(0, OWNER_PET_REMINDERS_CAP);
  const reminders: OwnerPetRemindersSection = {
    items: shownReminders.map((r) => ({
      reminderId: r.reminderId,
      title: r.title,
      dueAt: r.dueAt.toISOString(),
      daysUntilDue: r.daysUntilDue,
      variant: r.variant,
      isReportable: r.isReportable,
    })),
    total: detail.reminders.length,
    // Derived, never assumed: a client must not have to know the cap to tell a
    // complete list from a capped one.
    truncated: shownReminders.length < detail.reminders.length,
  };

  const caretakerActive = detail.caretakerState?.active ?? null;
  const banners: OwnerPetBannersSection = {
    transit: detail.isTransit
      ? { canManageFosterActions: detail.ownershipRole === "foster" }
      : null,
    caretaker: detail.caretakerState
      ? detail.caretakerState.active
        ? {
            state: "active",
            caretakerName: caretakerActive?.caretakerName ?? null,
            publicContactName: detail.caretakerConsentName,
          }
        : detail.caretakerState.pending
          ? { state: "pending", caretakerName: null, publicContactName: null }
          : detail.caretakerState.recentlyEnded
            ? { state: "recently_ended", caretakerName: null, publicContactName: null }
            : null
      : null,
    rehome:
      detail.rehomeState && detail.rehomeState.kind !== "none"
        ? {
            kind: detail.rehomeState.kind,
            orgDisplayName: detail.rehomeState.orgDisplayName ?? null,
          }
        : null,
  };

  const cases: OwnerPetCasesSection = {
    openCount: detail.cases.openCount,
    truncated: detail.cases.truncated,
  };

  const pregnancy: OwnerPetPregnancySection = detail.pregnancy
    ? {
        startedAt: detail.pregnancy.startedAt.toISOString(),
        weeksAtDiagnosis: detail.pregnancy.weeksAtDiagnosis,
        expectedBirthAt: detail.pregnancy.expectedBirthAt.toISOString(),
        lastClinicalAt: detail.pregnancy.lastClinicalAt?.toISOString() ?? null,
      }
    : null;

  const carousel: OwnerPetCarouselSection = {
    items: detail.carousel.items.map((p) => ({
      publicToken: p.token,
      name: p.name,
      photoUrl: p.photoUrl,
      status: toPublicPetStatus(p.status),
    })),
    total: detail.carousel.total,
    truncated: detail.carousel.truncated,
  };

  return {
    ...apiV1Envelope({
      payloadVersion: OWNER_PET_DETAIL_PAYLOAD_VERSION,
      issuedAt: now,
      staleAfterMs: OWNER_PET_DETAIL_STALE_AFTER_MS,
    }),
    publicToken: input.publicToken,
    viewer: {
      role: toViewerRole(input.accessPath, detail.ownershipRole),
      // TITULAR means the legal owner and nothing else. A foster holds the
      // animal; a caretaker is trusted with it; neither gets to see who else the
      // owner trusts, and an org member never does.
      isTitular: input.accessPath === "owner" && detail.ownershipRole === "owner",
    },
    identity: { status: "ok", data: identity },
    status: { status: "ok", data: status },
    alerts: { status: "ok", data: alerts },
    compliance: { status: "ok", data: compliance },
    reminders: { status: "ok", data: reminders },
    banners: { status: "ok", data: banners },
    cases: { status: "ok", data: cases },
    pregnancy: { status: "ok", data: pregnancy },
    carousel: { status: "ok", data: carousel },
  };
}
