// The credential union -> `PublicCredentialV1` projection.
//
// WHY THIS IS A SEPARATE FILE AND NOT PART OF THE ROUTE
// ---------------------------------------------------------------------------
// The route's job is HTTP: two limiters, four status codes, one envelope. The
// projection's job is a privacy decision made field by field, and it is the
// part a reviewer has to read line by line. Mixing them produces a handler
// where the interesting question — "is this field on the public page?" — is
// buried between `NextResponse.json` calls.
//
// WHY IT LIVES UNDER app/ AND NOT IN src/modules/pets/
// ---------------------------------------------------------------------------
// It needs `isObservationOpen` from the surveillance module, and `pets ->
// surveillance` is not an allowed edge in check-dependency-direction.ts.
// Adding the edge to publish a read projection would legitimise a module
// dependency that does not exist, so this composes the derivations in app/ —
// the same escape the caretakers module documents for the owner cockpit, and
// the same place the page composes them today. If a native client ever needs
// the projection itself (it does not: it needs the TYPE, which lives in
// `@dim/contract/api`), that is the moment to revisit the edge on purpose.
//
// THE RULE THIS FILE FOLLOWS
// ---------------------------------------------------------------------------
// A field is in the payload if and only if `app/(public)/p/[publicToken]/
// page.tsx` RENDERS it, under the same gate the page applies. Not "if the
// loader fetched it" — `CredentialViewData` is what the page FETCHES, and the
// page fetches several things it only uses to derive one boolean. What is
// deliberately dropped, and why:
//
//   canonicalIds.microchip.*      the page shows "Microchip: Sí/No" and never
//                                 the number. A chip needs a reader, so
//                                 publishing it helps nobody standing over the
//                                 animal and hands a scraper a national
//                                 identifier. (The tattoo is the deliberate
//                                 exception, lost-mode only — a mark you read
//                                 OFF the animal.)
//   canonicalIds.*.photoId        an internal attachment UUID. The page
//                                 resolves it to a URL server-side; the id
//                                 never reaches a client.
//   canonicalIds.*.recordedAt,
//   recordedByLabel,
//   isoCountryCode,
//   implantationSite              fetched with the identifier row, rendered
//                                 nowhere on the credential.
//   latestVaccinationRows         four columns fetched to compute ONE gated
//                                 tier. The rows carry the dose payload and the
//                                 signing organisation's UUID.
//   rabiesEvents                  up to 50 vaccination rows plus every
//                                 amendment. The page derives a tri-state
//                                 semaphore and one at-risk boolean from them.
//                                 Shipping the events is Tier-2 medical history
//                                 on a Tier-0 surface.
//   openCustodyEpisodeRows[].caseId   an internal case UUID; only the
//                                 authority's display name is rendered.
//   serviceDog (the row)          serviceType, rupgaCredential, trainingCenter,
//                                 the three dates, notes, verifiedByUserId,
//                                 revocation fields. The page renders the
//                                 banner's PRESENCE and one rabies sub-warning.
//   registryClaim.identityHeading es-AR copy. `registryBacked` is the fact
//                                 behind it; a native client owns its strings.
//   pet.id, pet.primaryPhotoId    internal UUIDs.
//   pet.dateOfBirth, deceasedAt   the page shows whole years only ("Tier 0
//                                 doesn't expose exact DOB") — `ageYears`
//                                 carries the same information the card does.
//   pet.jurisdictionProvince      not on the public card. The LOCALITY appears
//                                 only in lost mode and only under
//                                 discloseLastLocationWhenLost.
//
// Every disclosure gate is re-applied HERE rather than trusted from the loader.
// The loader already projects undisclosed columns as SQL NULL (defence in
// depth, S4) and the page re-gates them at the render site anyway; a third
// application costs nothing and means this file can be read on its own.

import type {
  CredentialLostSection,
  CredentialNoticesSection,
  CredentialSection,
  PublicCredentialSituation,
  PublicCredentialV1,
  PublicCredentialV1Degraded,
} from "@dim/contract/api";
import { PUBLIC_CREDENTIAL_PAYLOAD_VERSION } from "@dim/contract/api";

import type { Pet } from "@/db";
import { deriveRabiesSemaphore, isRabiesAtRisk } from "@/lib/domain/credential-badges";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { isPermanentCondition } from "@/lib/reference/permanent-conditions";
import { derivePetSituation } from "@/lib/ui/pet-situation";
import type { PublicCredentialLookup } from "@/src/modules/pets/application/read/lookup-public-credential";
import { isObservationOpen } from "@/src/modules/surveillance/domain/rabies-observation";

/**
 * How long a snapshot may be presented as current.
 *
 * The web surface answers this question with `Cache-Control: no-store` on every
 * response, because the credential FLIPS: a pet goes lost, an owner marks it
 * found, a disclosure preference changes, and a stale copy showed "SE BUSCA" +
 * the owner's phone for a pet that was already home (the privacy class closed
 * 2026-07-07). A native client holding a copy has no CDN to invalidate, so it
 * gets an explicit expiry instead.
 *
 * Five minutes is the trade: short enough that a lost->found flip reaches a
 * finder while it still matters, long enough that a client is not re-fetching
 * on every glance. It is NOT a cache-control directive — the response is
 * `no-store` regardless — it is what a client shows the user next to "esto es
 * lo que el servidor sabía a las 14:32".
 */
export const PUBLIC_CREDENTIAL_STALE_AFTER_MS = 5 * 60_000;

/** The three envelope fields §6 requires on every read, success or degraded. */
function envelope(publicToken: string, now: Date) {
  return {
    payloadVersion: PUBLIC_CREDENTIAL_PAYLOAD_VERSION,
    issuedAt: now.toISOString(),
    staleAfter: new Date(now.getTime() + PUBLIC_CREDENTIAL_STALE_AFTER_MS).toISOString(),
    publicToken,
  } as const;
}

const UNAVAILABLE = { status: "unavailable" } as const satisfies CredentialSection<never>;

/**
 * Whole years, counted to the DEATH date when there is one.
 *
 * `Date.now()` alone kept ageing the dead — Hachikō (died 1935) read "102
 * años" on his own credential. A life stops at its end.
 */
function ageYearsOf(pet: Pet, now: Date): number | null {
  if (!pet.dateOfBirth) return null;
  const endsAt = pet.deceasedAt ? new Date(pet.deceasedAt).getTime() : now.getTime();
  const years = Math.floor(
    (endsAt - new Date(pet.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  );
  return Math.max(0, years);
}

/**
 * The public-safe masthead situation, narrowed to what this surface can emit.
 *
 * `derivePetSituation` is fed ONLY public-safe signals (status, rabies
 * observation, official custody), so the medical and household keys are
 * STRUCTURALLY unreachable — their inputs are never passed. The switch states
 * that rather than assuming it: if a new key ever becomes reachable, this stops
 * compiling instead of quietly publishing a situation the contract's union does
 * not declare.
 */
function situationOf(pet: Pet, underOfficialCustody: boolean): PublicCredentialSituation | null {
  const derived = derivePetSituation({
    status: pet.status,
    rabiesObservationStatus: pet.rabiesObservationStatus,
    underOfficialCustody,
  });
  if (derived.isDefault) return null;
  switch (derived.key) {
    case "perdida":
    case "custodia-oficial":
    case "observacion-antirrabica":
    case "fallecida":
      return derived.key;
    // Medical / household states. Unreachable here because their inputs are
    // never read on a Tier-0 surface, and `al-dia` is the isDefault case above.
    case "al-dia":
    case "en-tratamiento":
    case "prenada":
    case "en-adopcion":
    case "en-transito":
      return null;
    default: {
      const unhandled: never = derived.key;
      throw new Error(`Unhandled public situation: ${String(unhandled)}`);
    }
  }
}

/**
 * The welfare-safety disclosure, gated by `discloseConditionsPublicly`.
 *
 * ONE field for what the page renders in two places — the active-credential
 * banner and the lost-mode special-conditions box — because they are the same
 * data under the same gate, and which box it lands in is a layout decision a
 * client makes for itself. Unrecognized codes are filtered out, mirroring the
 * banner's own `isPermanentCondition` filter, so a client can never render one
 * the web credential would have dropped.
 */
function permanentConditionsOf(pet: Pet): CredentialNoticesSection["permanentConditions"] {
  if (!pet.discloseConditionsPublicly) return null;
  const codes = (pet.permanentConditions ?? []).filter(isPermanentCondition);
  if (codes.length === 0) return null;
  const hasOther = codes.includes("otra");
  return { codes: [...codes], other: hasOther ? pet.permanentConditionsOther : null };
}

/** The Tier-1 lost reveal, or `null` for a pet nobody is looking for. */
function lostSectionOf(
  pet: Pet,
  data: Extract<PublicCredentialLookup, { status: "ok" }>["data"],
  lostTattooPhotoUrl: string | null,
): CredentialLostSection | null {
  const { lostContext, canonicalIds } = data;
  if (pet.status !== "lost" || !lostContext) return null;

  // D2 hardening (red-team 2026-07): while titularidad is under review the
  // system must not relay a finder's contact to the contested owner, and must
  // not publish that owner's own contact. Both report actions go with it —
  // each ends in an owner-directed notification, which takes sides.
  const disputed = pet.inCustodyDispute;
  const showLocation = pet.discloseLastLocationWhenLost;

  return {
    since: lostContext.lostSince?.toISOString() ?? null,
    color: pet.color,
    distinguishingFeatures: pet.distinguishingFeatures,
    owner: {
      firstName: pet.discloseFirstNameWhenLost && !disputed ? lostContext.ownerFirstName : null,
      phoneE164: pet.disclosePhoneWhenLost && !disputed ? lostContext.phone : null,
      email: pet.discloseEmailWhenLost && !disputed ? lostContext.email : null,
    },
    // Already null unless BOTH keys hold and no dispute is open — resolved once
    // in the loader so there is exactly one place the rule can be got wrong.
    caretakerContact: lostContext.caretakerContact,
    lastSeen: showLocation
      ? {
          placeName: lostContext.locationText,
          locality: pet.jurisdictionLocality ?? null,
          coords: lostContext.lastSeenCoords,
          lat: lostContext.lostLat,
          lng: lostContext.lostLng,
          at: lostContext.lastSeenAt?.toISOString() ?? null,
        }
      : null,
    description: lostContext.lostDescription,
    tattoo: canonicalIds.tattoo
      ? {
          code: canonicalIds.tattoo.code ?? null,
          location: canonicalIds.tattoo.tattooLocation ?? null,
          description: canonicalIds.tattoo.tattooDescription ?? null,
          photoUrl: lostTattooPhotoUrl,
        }
      : null,
    allowFinderForm: pet.allowFinderFormWhenLost && !disputed,
    allowSighting: !disputed,
  };
}

/**
 * Project a resolved credential onto the v1 wire shape.
 *
 * Every section reports `ok` here by construction: the loader is ONE budgeted
 * unit, so either the whole fan-out resolved or the door answered `degraded`.
 * The wrapper is not ceremony — it is what makes the degraded response below
 * describable in the SAME type, which is the only way a client can write one
 * parser for both.
 */
export function buildPublicCredentialV1(
  lookup: Extract<PublicCredentialLookup, { status: "ok" }>,
  now: Date,
): PublicCredentialV1 {
  const { pet, photoUrl, data } = lookup;
  const {
    canonicalIds,
    hasVaccinations,
    latestVaccinationRows,
    openCustodyEpisodeRows,
    rabiesEvents,
    serviceDog,
    lostTattooPhotoUrl,
    registryClaim,
  } = data;

  const [latestVaccination] = latestVaccinationRows;
  const latestTier = latestVaccination
    ? computeConfidence({
        authorRole: latestVaccination.authorRole,
        authorVerified: latestVaccination.authorVerified,
        authorOrganizationId: latestVaccination.authorOrganizationId,
        payload: (latestVaccination.payload ?? {}) as Record<string, unknown>,
      })
    : null;

  const [openCustodyEpisode] = openCustodyEpisodeRows;

  // Ley 26.858 — the banner fires only for a vigente, in-service, opted-in
  // credential of one of the five ANDIS-recognized types ('otro' never banners).
  const showServiceDogBanner =
    serviceDog !== undefined &&
    serviceDog.credentialStatus === "vigente" &&
    serviceDog.inService &&
    serviceDog.publicVisibility === "full_banner" &&
    serviceDog.serviceType !== "otro";

  const tier2EnabledUntil = pet.tier2PublicEnabledUntil
    ? new Date(pet.tier2PublicEnabledUntil)
    : null;

  return {
    ...envelope(pet.publicToken, now),
    identity: {
      status: "ok",
      data: {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        ageYears: ageYearsOf(pet, now),
        photoUrl,
        libretaCode: `LIB-AR-${pet.publicToken.toUpperCase()}`,
        hasMicrochip: canonicalIds.microchip !== null,
        hasTattoo: canonicalIds.tattoo !== null,
        registryBacked: registryClaim.registryBacked,
      },
    },
    status: {
      status: "ok",
      data: {
        status: pet.status,
        situation: situationOf(pet, !!openCustodyEpisode),
      },
    },
    vaccination: {
      status: "ok",
      data: {
        hasRecords: hasVaccinations,
        rabies: (() => {
          const semaphore = deriveRabiesSemaphore(rabiesEvents, now);
          return { vigencia: semaphore.estado, provenance: semaphore.respaldo };
        })(),
        // Gated exactly as the page's badge is: below professional_verified the
        // tier is withheld, because a weak tier rendered as a badge reads as a
        // verification this registry never performed.
        confidence:
          latestTier !== null && isAtLeast(latestTier, "professional_verified") ? latestTier : null,
      },
    },
    notices: {
      status: "ok",
      data: {
        emergencyMedical: pet.emergencyInfoVisible,
        officialCustody: openCustodyEpisode
          ? { authorityName: openCustodyEpisode.authorityName ?? null }
          : null,
        custodyDispute: pet.inCustodyDispute,
        potentiallyDangerousBreed: pet.potentiallyDangerousBreed,
        rabiesObservation: isObservationOpen(pet.rabiesObservationStatus)
          ? { windowExpired: pet.rabiesObservationStatus === "window_expired_unclosed" }
          : null,
        serviceDog: showServiceDogBanner
          ? { rabiesAtRisk: isRabiesAtRisk(rabiesEvents, now) }
          : null,
        permanentConditions: permanentConditionsOf(pet),
      },
    },
    lost: { status: "ok", data: lostSectionOf(pet, data, lostTattooPhotoUrl) },
    tier2: {
      status: "ok",
      data: {
        enabled: pet.tier2PublicPermanent || (!!tier2EnabledUntil && tier2EnabledUntil > now),
        permanent: pet.tier2PublicPermanent,
        enabledUntil: tier2EnabledUntil?.toISOString() ?? null,
        medical: "not_included",
      },
    },
  };
}

/**
 * Project the degraded arm onto the same envelope.
 *
 * The alternative — a bare `{ error: "temporarily_unavailable" }` — would hand
 * a native client strictly less than the web already gets. The page renders a
 * `DegradedCredentialCard` carrying the animal's name and its aviso CTAs,
 * because those routes run their OWN reads and may still work while this one is
 * down; a finder standing over a lost dog can still reach the owner. Answering
 * the JSON caller with nothing turns a partial outage into a total one for the
 * client that most needs the fallback.
 *
 * `pet` is present only when the pet ROW resolved before the failure. When it
 * did not, the token is genuinely all that is known and identity is
 * `unavailable` too — which is the honest answer, and is NOT "no findings".
 */
export function buildDegradedPublicCredentialV1(
  lookup: Extract<PublicCredentialLookup, { status: "degraded" }>,
  now: Date,
): PublicCredentialV1Degraded {
  return {
    error: "temporarily_unavailable",
    ...envelope(lookup.publicToken, now),
    identity: lookup.pet ? { status: "ok", data: lookup.pet } : UNAVAILABLE,
    status: UNAVAILABLE,
    vaccination: UNAVAILABLE,
    notices: UNAVAILABLE,
    lost: UNAVAILABLE,
    tier2: UNAVAILABLE,
  };
}
