// Public credential page — Tier 0 view by default. When pet.status === 'lost'
// the page promotes to Tier 1: owner contact info governed by the five
// disclose_*_when_lost preference columns on the pets row, per spec §7 and
// AGENTS.md → "Privacy tiers".
//
// Privacy posture (active pets): NO owner PII, NO microchip number, NO medical
// details, NO scan history.
//
// Security (V1-1): per-IP rate limit enforced before ANY data is fetched.
// Limit: 30 req/min, 200 req/hour per IP. Generous enough that a real QR scan
// (one person refreshing a single page) is never affected; tight enough to stop
// enumeration of the 31^8 token keyspace from a single IP. On rate-limit the
// page renders a soft throttle notice (not a 429 hard error) to preserve UX.
// Token entropy widening is tracked as a follow-up (would invalidate existing tokens).

import { PppPublicBadge } from "@/components/PppPublicBadge";
import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { LostPublicCredential } from "@/components/pet-profile/LostPublicCredential";
import {
  attachments,
  cases,
  db,
  organizations,
  ownerships,
  petEvents,
  petServiceDog,
  pets,
  profiles,
} from "@/db";
import { readPoint } from "@/lib/domain/location";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { resolveOriginOrg, shouldShowOriginOrgBadge } from "@/lib/infra/origin-org";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { petPhotoUrl } from "@/lib/infra/storage";
import {
  type PermanentCondition,
  isPermanentCondition,
  permanentConditionShortLabel,
} from "@/lib/reference/permanent-conditions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANDING } from "@/lib/ui/branding";
import { sexLabel, speciesLabel, statusLabel } from "@/lib/utils/format";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FoundPetForm } from "./FoundPetForm";
import { ScanLogger } from "./ScanLogger";
import { Tier2MedicalView } from "./Tier2MedicalView";

// The page calls headers() at runtime — mark it dynamic explicitly so Next.js
// does not attempt to statically render it (matches the sibling encontre /
// sighting pages that also carry this export).
export const dynamic = "force-dynamic";

/**
 * Open Graph metadata for share previews (task #43, share-first lost flow).
 * When a lost-pet link lands in a WhatsApp chat or a barrio Facebook group,
 * this preview card — photo, urgent title — is what carries the message; a
 * bare URL gets scrolled past.
 *
 * Privacy: name, species and photo only — the same Tier 0 subset the page
 * itself shows to anyone. No owner PII, no location.
 *
 * og:image is NOT set here — deliberately. `opengraph-image.tsx` (sibling
 * file in this route segment) generates the branded SE BUSCA / credencial
 * card automatically via Next's file convention. Setting `openGraph.images`
 * in this config-based metadata would take precedence over that file and
 * silently disable it, so this only carries the non-image OG fields.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const [row] = await db
    .select({
      name: pets.name,
      species: pets.species,
      status: pets.status,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!row) return { title: "Credencial | MiMAR" };

  const isLost = row.status === "lost";
  const title = isLost ? `SE BUSCA: ${row.name} | MiMAR` : `${row.name} | Credencial MiMAR`;
  const description = isLost
    ? `${row.name} (${speciesLabel(row.species)}) está perdida. Si la viste, tocá para avisarle a su familia.`
    : `Credencial pública de ${row.name} (${speciesLabel(row.species)}), verificable por QR.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/p/${publicToken}`,
      siteName: BRANDING.appName,
    },
    twitter: {
      // opengraph-image.tsx always produces an image now (branded fallback
      // even without a real photo), so this is unconditional.
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// Per-IP limit for the public credential read path.
// 60/min: generous enough for a legitimate user refreshing in a noisy carrier-
//   grade NAT environment (many users behind one IP) or a viral lost-pet post
//   getting rapid repeat scans from the same household.
// 400/hr: proportionally raised from 200/hr to match the higher per-minute cap
//   while still blocking sustained enumeration from a single IP.
// A truly viral lost-pet QR gets scans from MANY different IPs, so per-IP
// limiting never blocks that case even at these raised limits.
const PUBLIC_TOKEN_PAGE_LIMIT = { maxPerMinute: 60, maxPerHour: 400 } as const;

async function callerIpFromHeaders(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

export default async function PublicCredentialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  // V1-1: rate-limit per IP before touching any pet data. Renders a soft
  // throttle notice (not a hard 500) so the page gracefully degrades.
  const ip = await callerIpFromHeaders();
  try {
    await enforceRateLimit("public_token_page", ip, PUBLIC_TOKEN_PAGE_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return <ThrottleNotice />;
    }
    throw err;
  }

  const [result] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, publicToken))
    .limit(1);

  if (!result) notFound();
  const { pet, photo } = result;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // ---------------------------------------------------------------------------
  // Stage 1 — independent reads keyed only off pet.id, run concurrently.
  // These were previously four sequential awaits (canonical ids, vaccination
  // existence, latest-vaccination provenance, open custody episode). None
  // depends on another's result, so a single Promise.all collapses four
  // round-trips into one. This is the hottest public path (every QR scan), so
  // the round-trip reduction is the biggest win here. The lost / tier2 / service
  // -dog reads stay in later conditional stages because they gate on derived
  // flags (isLost, tier2Active, species).
  // ---------------------------------------------------------------------------
  const [canonicalIds, vaccinationExists, latestVaccinationRows, openCustodyEpisodeRows] =
    await Promise.all([
      // Canonical identifier rows — boolean indicators + lost-branch display.
      fetchActiveIdentifications(pet.id),
      // Tier 0 vaccination rollup — only a boolean is needed, so LIMIT 1 instead
      // of fetching the pet's entire vaccination history just to test existence.
      db
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(
          and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")),
        )
        .limit(1),
      // A.4: most recent vaccination's provenance to compute the confidence tier.
      db
        .select({
          authorRole: petEvents.authorRole,
          authorVerified: petEvents.authorVerified,
          authorOrganizationId: petEvents.authorOrganizationId,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(
          and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(1),
      // DC13: open custody_episode opened by a sanitary_authority org.
      db
        .select({
          caseId: cases.id,
          authorityName: organizations.displayName,
        })
        .from(cases)
        .innerJoin(
          organizations,
          and(
            eq(organizations.id, cases.openedByOrganizationId),
            eq(organizations.orgType, "sanitary_authority"),
          ),
        )
        .where(
          and(
            eq(cases.primaryPetId, pet.id),
            eq(cases.caseKind, "custody_episode"),
            eq(cases.status, "open"),
          ),
        )
        .limit(1),
    ]);

  const hasVaccinations = vaccinationExists.length > 0;
  const hasMicrochip = canonicalIds.microchip !== null;
  const hasTattoo = canonicalIds.tattoo !== null;

  const [latestVaccination] = latestVaccinationRows;

  const latestVaccinationTier = latestVaccination
    ? computeConfidence({
        authorRole: latestVaccination.authorRole,
        authorVerified: latestVaccination.authorVerified,
        authorOrganizationId: latestVaccination.authorOrganizationId,
        payload: (latestVaccination.payload ?? {}) as Record<string, unknown>,
      })
    : null;

  // Gate: only institutional_verified or professional_verified (plan §A.4)
  const showVaccinationConfidence =
    latestVaccinationTier !== null && isAtLeast(latestVaccinationTier, "professional_verified");

  // Approximate age — year only (Tier 0 doesn't expose exact DOB).
  const ageYears = pet.dateOfBirth
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(pet.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        ),
      )
    : null;

  const isLost = pet.status === "lost";

  // DC13: Public custody disclaimer — rendered when the pet has an open
  // custody_episode case opened by a sanitary_authority org (state seizure).
  // Discriminator: caseKind='custody_episode' + opener.orgType='sanitary_authority'.
  // Never parsed from notes text — canonical discriminator only. No owner PII is
  // exposed: only the authority name and a generic disclaimer. The query itself
  // ran in the Stage 1 Promise.all above (it only needs pet.id).
  const [openCustodyEpisode] = openCustodyEpisodeRows;

  const isUnderOfficialCustody = !!openCustodyEpisode;

  // Tier 2 público — owner-opt-in. Active when either:
  //   • tier2PublicPermanent is true ("siempre" option, no expiry), or
  //   • tier2PublicEnabledUntil is a future timestamp (bounded window).
  // See app/actions/tier2-public.ts + migrations 0049 / 0098.
  const tier2EnabledUntil = pet.tier2PublicEnabledUntil
    ? new Date(pet.tier2PublicEnabledUntil)
    : null;
  const tier2Active =
    pet.tier2PublicPermanent || (!!tier2EnabledUntil && tier2EnabledUntil > new Date());

  let tier2VaccineActive = 0;
  let tier2IsSterilized = false;
  const tier2ActiveMedications: string[] = [];
  if (tier2Active) {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    // Run all three tier2 queries concurrently — none depends on the others.
    const [recentVaccines, sterilRows, medRows] = await Promise.all([
      // Vacunación "vigente" v1: unique vaccine_name applied in the last 12
      // months. Conservative — a future PR can wire computeVaccinationSummary
      // (catalog interval-aware) once the libreta health-status helpers land.
      db
        .select({ payload: petEvents.payload })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "vaccination_administered"),
            sql`${petEvents.occurredAt} >= ${oneYearAgo.toISOString()}`,
          ),
        ),
      db
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "sterilization_performed")))
        .limit(1),
      // Active medications: started without a referencing stop. Same shape
      // as computeMedicationsActive (lib/libreta-health-status.ts) but
      // inlined to avoid coupling this page to that PR until both ship.
      db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            sql`${petEvents.eventType} IN ('medication_started','medication_stopped')`,
          ),
        ),
    ]);

    const seen = new Set<string>();
    for (const row of recentVaccines) {
      const name =
        typeof (row.payload as { vaccine_name?: unknown })?.vaccine_name === "string"
          ? (row.payload as { vaccine_name: string }).vaccine_name.trim().toLowerCase()
          : "";
      if (name) seen.add(name);
    }
    tier2VaccineActive = seen.size;

    tier2IsSterilized = sterilRows.length > 0;

    const stoppedIds = new Set<string>();
    for (const r of medRows) {
      if (r.eventType !== "medication_stopped") continue;
      const sid = (r.payload as { medication_started_event_id?: unknown })
        ?.medication_started_event_id;
      if (typeof sid === "string") stoppedIds.add(sid);
    }
    for (const r of medRows) {
      if (r.eventType !== "medication_started") continue;
      if (stoppedIds.has(r.id)) continue;
      const drug = (r.payload as { drug_name?: unknown })?.drug_name;
      if (typeof drug === "string" && drug.trim()) tier2ActiveMedications.push(drug.trim());
    }
  }

  // Service dog banner (Ley 26.858). Renders ONLY when the owner has opted
  // in to full_banner visibility AND the credential is vigente AND in
  // service AND the type is one of the five ANDIS-recognized categories
  // ('otro' explicitly never banners). The 60-day rabies expiry sub-warning
  // is computed below.
  const [serviceDog] =
    pet.species === "dog"
      ? await db.select().from(petServiceDog).where(eq(petServiceDog.petId, pet.id)).limit(1)
      : [];
  const showServiceDogBanner =
    serviceDog &&
    serviceDog.credentialStatus === "vigente" &&
    serviceDog.inService &&
    serviceDog.publicVisibility === "full_banner" &&
    serviceDog.serviceType !== "otro";

  // Art. 8 risk: rabies vaccination must be up to date for the credential
  // to remain compliant. We surface this as a sub-warning on the banner
  // without auto-revoking (revocation belongs to ANDIS).
  let rabiesAtRisk = false;
  if (showServiceDogBanner) {
    const [latestRabies] = await db
      .select({ occurredAt: petEvents.occurredAt, payload: petEvents.payload })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(50);
    // Heuristic: any vaccine row referencing "rabia" in name + valid_until
    // older than 60 days flags risk. The exact catalog lookup lives in
    // lib/vaccines.ts; we keep this conservative — false negatives are OK,
    // false positives only show a soft warning.
    if (latestRabies) {
      const payload = latestRabies.payload as { vaccine_name?: string; valid_until?: string };
      if (payload?.vaccine_name?.toLowerCase().includes("rabia") && payload.valid_until) {
        const validUntil = new Date(payload.valid_until);
        rabiesAtRisk = !Number.isNaN(validUntil.getTime()) && validUntil < new Date();
      }
    }
  }

  // Tier 1 reveal: only when the pet is marked lost. Each field is gated by
  // the owner's disclosure preference (disclose_*_when_lost columns on pets).
  // Active pets expose NO owner PII — leave lostContext null.
  //
  // lost_description is always visible if present — these are animal details,
  // not owner contact info, so no disclosure pref gates them (spec §8.4 / §10).
  let lostContext: {
    ownerFirstName: string | null;
    phone: string | null;
    email: string | null;
    locationText: string | null;
    lostLat: number | null;
    lostLng: number | null;
    lostDescription: {
      accessoriesWhenLost: string | null;
      behaviorNotes: string | null;
      lastSeenContext: string | null;
    } | null;
    lostSince: Date | null;
  } | null = null;

  if (isLost) {
    // S4 defense-in-depth: only FETCH what the owner opted to disclose. Location
    // (free-text + lat/lng) and phone are pulled from Postgres only when their
    // disclosure flag is set — not fetched-then-redacted. Mirrors the query-level
    // split in lost-listing-read.ts. lost_description (animal identity) and
    // lostSince are always shown, so they are always fetched.
    const showLocation = pet.discloseLastLocationWhenLost;
    const showPhone = pet.disclosePhoneWhenLost;

    const [ownerRows, latestLostEventRows] = await Promise.all([
      db
        .select({
          displayName: profiles.displayName,
          // phone never leaves the DB unless the owner disclosed it.
          phone: showPhone ? profiles.phone : sql<string | null>`null`,
          ownerUserId: ownerships.ownerUserId,
        })
        .from(ownerships)
        .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
        .limit(1),
      // Last-known location from the most recent status_changed → lost event.
      // Filtering on payload->>'to_status' = 'lost' so a later "found" event
      // (to_status='active') does not eclipse the actual lost-event payload.
      // Location keys/columns are projected as SQL NULL when not disclosed, so
      // the raw payload and coordinates never enter server memory.
      db
        .select({
          lostDescriptionJson: sql`${petEvents.payload}->'lost_description'`,
          locationText: showLocation
            ? sql<
                string | null
              >`coalesce(${petEvents.payload}->>'location_description', ${petEvents.payload}->>'last_known_location')`
            : sql<string | null>`null`,
          locationLat: showLocation ? petEvents.locationLat : sql<number | null>`null`,
          locationLng: showLocation ? petEvents.locationLng : sql<number | null>`null`,
          occurredAt: petEvents.occurredAt,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "status_changed"),
            sql`${petEvents.payload}->>'to_status' = 'lost'`,
          ),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(1),
    ]);
    const [ownerRow] = ownerRows;
    const [latestLostEvent] = latestLostEventRows;

    const textLocation =
      typeof latestLostEvent?.locationText === "string" && latestLostEvent.locationText.length > 0
        ? latestLostEvent.locationText
        : null;
    // Fallback: precise lat/lng captured on the event row itself (null unless disclosed).
    const eventPoint = latestLostEvent ? readPoint(latestLostEvent) : null;
    const geoLocation =
      !textLocation && eventPoint
        ? `${eventPoint.lat.toFixed(6)}, ${eventPoint.lng.toFixed(6)}`
        : null;

    // Split display_name on first whitespace to get just the first name. We
    // never expose the full legal name on a public credential.
    // Guard at resolution: only derive when the owner opted in.
    const firstName =
      pet.discloseFirstNameWhenLost && ownerRow?.displayName
        ? ownerRow.displayName.trim().split(/\s+/)[0]
        : null;

    // Email is stored in auth.users (not profiles). Only fetch it when the
    // owner has opted in — avoids an unnecessary admin API call on every
    // credential page load.
    let ownerEmail: string | null = null;
    if (pet.discloseEmailWhenLost && ownerRow?.ownerUserId) {
      try {
        const adminClient = createAdminClient();
        const { data } = await adminClient.auth.admin.getUserById(ownerRow.ownerUserId);
        ownerEmail = data?.user?.email ?? null;
      } catch {
        // Non-fatal: if email fetch fails, fall through to null (same as
        // if the pref were false). The credential renders without email.
        ownerEmail = null;
      }
    }

    // lost_description (spec §8.4) — animal-identity details, always shown if
    // present, no disclosure pref gates them.
    const lostDesc = latestLostEvent?.lostDescriptionJson as
      | {
          accessories_when_lost?: string | null;
          behavior_notes?: string | null;
          last_seen_context?: string | null;
        }
      | null
      | undefined;

    const lostDescription =
      lostDesc &&
      (lostDesc.accessories_when_lost || lostDesc.behavior_notes || lostDesc.last_seen_context)
        ? {
            accessoriesWhenLost: lostDesc.accessories_when_lost ?? null,
            behaviorNotes: lostDesc.behavior_notes ?? null,
            lastSeenContext: lostDesc.last_seen_context ?? null,
          }
        : null;

    lostContext = {
      ownerFirstName: firstName ?? null,
      phone: ownerRow?.phone ?? null,
      email: ownerEmail,
      locationText: textLocation ?? geoLocation,
      lostLat: eventPoint?.lat ?? null,
      lostLng: eventPoint?.lng ?? null,
      lostDescription,
      lostSince: latestLostEvent?.occurredAt ?? null,
    };
  }

  // T-4.3: Origin-org badge — resolved server-side, no PII.
  // Active credential only (lost branch has its own render path).
  const originOrg = isLost ? null : await resolveOriginOrg(pet.id);
  const showOriginOrg = shouldShowOriginOrgBadge(originOrg);

  // Lost branch — v2 public credential. ScanLogger still fires so scan
  // analytics are captured even in lost mode. lostSince falls back to now()
  // when the lost event row is missing (shouldn't happen, but defensive).
  if (isLost && lostContext) {
    const identityLine = [speciesLabel(pet.species), pet.color, pet.distinguishingFeatures]
      .filter(Boolean)
      .join(" · ");

    // Tattoo photo — only resolved here, inside the lost branch. Active
    // credentials never query this attachment to keep the data surface
    // minimal (D3 closed 2026-05-22 — code + location + photo are gated by
    // lost status, mirroring how the chip number is gated).
    // Photo ID is sourced from the canonical tattoo row (ARCH-Q).
    let tattooPhotoUrl: string | null = null;
    if (canonicalIds.tattoo?.photoId) {
      const [tattooPhoto] = await db
        .select({ storagePath: attachments.storagePath })
        .from(attachments)
        .where(eq(attachments.id, canonicalIds.tattoo.photoId))
        .limit(1);
      tattooPhotoUrl = petPhotoUrl(tattooPhoto?.storagePath);
    }

    return (
      <>
        {/* Lost mode: also renders the visible location-consent prompt so a
            finder can share precise GPS (Task #45). Active credentials never
            prompt — the server rejects coords for non-lost pets anyway. */}
        <ScanLogger publicToken={publicToken} isLost petName={pet.name} />
        <LostPublicCredential
          petName={pet.name}
          petPhotoUrl={photoUrl}
          petSex={pet.sex}
          identityLine={identityLine}
          ownerFirstName={pet.discloseFirstNameWhenLost ? lostContext.ownerFirstName : null}
          ownerPhoneE164={pet.disclosePhoneWhenLost ? lostContext.phone : null}
          lastSeenPlaceName={pet.discloseLastLocationWhenLost ? lostContext.locationText : null}
          lastSeenLocality={
            pet.discloseLastLocationWhenLost ? (pet.jurisdictionLocality ?? null) : null
          }
          distinguishingFeatures={pet.distinguishingFeatures}
          finderFormHref={pet.allowFinderFormWhenLost ? `/p/${publicToken}/encontre` : null}
          sightingFormHref={`/p/${publicToken}/sighting`}
          lastSeenLat={pet.discloseLastLocationWhenLost ? lostContext.lostLat : null}
          lastSeenLng={pet.discloseLastLocationWhenLost ? lostContext.lostLng : null}
          lostSince={lostContext.lostSince ?? new Date()}
          tattooCode={canonicalIds.tattoo?.code ?? null}
          tattooLocation={canonicalIds.tattoo?.tattooLocation ?? null}
          tattooDescription={canonicalIds.tattoo?.tattooDescription ?? null}
          tattooPhotoUrl={tattooPhotoUrl}
          lostDescription={lostContext.lostDescription}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Active credential — LN "warm libreta / document credential" render
  // ---------------------------------------------------------------------------

  const breedLine = [speciesLabel(pet.species), pet.breed, sexLabel(pet.sex)]
    .filter(Boolean)
    .join(" · ");
  const ageLabel = ageYears !== null ? `${ageYears} año${ageYears === 1 ? "" : "s"}` : null;

  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="min-h-screen bg-ln-paper font-[var(--font-ln-sans)]">
      <ScanLogger publicToken={publicToken} />

      {/* Guilloché band — LN security stripe */}
      <div
        aria-hidden="true"
        className="h-[4px] flex-shrink-0 opacity-90"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      <div className="mx-auto max-w-[460px] px-[16px] py-[24px] pb-[56px]">
        {/* ------------------------------------------------------------------ */}
        {/* TIER 0+ emergency-info banner — sticky on mobile, always visible.  */}
        {/* Non-hideable by design: the medical alert is the point of 0+.      */}
        {/* Sprint 5 PR-042 / doc 10 §3 punto 4.                               */}
        {/* ------------------------------------------------------------------ */}
        {pet.emergencyInfoVisible && (
          <div
            role="alert"
            data-section="emergency-banner"
            className="sticky top-0 z-30 -mx-[16px] mb-[16px] flex items-start gap-[11px] border-b border-ln-err-100 bg-ln-err-050 px-[18px] py-[13px] md:static md:mx-0 md:mb-[16px] md:rounded-[4px]"
          >
            {/* Heartbeat icon */}
            <span aria-hidden="true" className="mt-[1px] flex-shrink-0 text-lg text-ln-seal">
              ♥
            </span>
            <div>
              <p className="m-0 font-[var(--font-ln-serif)] text-md font-semibold text-ln-ink">
                Alerta médica
              </p>
              <p className="mt-[2px] text-sm leading-[1.45] text-ln-ink-2">
                Esta mascota requiere atención médica. Contactá al dueño escaneando el QR.
              </p>
            </div>
          </div>
        )}

        {/* DC13: Official custody disclaimer */}
        {isUnderOfficialCustody && (
          <div
            role="alert"
            data-section="custody-disclaimer"
            className="mb-[16px] rounded-[4px] border border-ln-warn-100 border-l-[3px] border-l-ln-warn bg-ln-warn-050 px-[16px] py-[12px]"
          >
            <p className="mb-[4px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-warn">
              Custodia oficial
            </p>
            <p className="m-0 text-[13.5px] font-semibold text-ln-ink">
              Esta mascota está bajo custodia oficial.
            </p>
            {openCustodyEpisode?.authorityName && (
              <p className="mt-[4px] text-sm text-ln-ink-2">
                Autoridad a cargo: {openCustodyEpisode.authorityName}
              </p>
            )}
            <p className="mt-[4px] text-[11.5px] text-ln-mute">
              Comunicate con la autoridad sanitaria competente para más información.
            </p>
          </div>
        )}

        {/* Permanent conditions banner */}
        {pet.discloseConditionsPublicly && pet.permanentConditions.length > 0 && (
          <PermanentConditionsBanner
            codes={pet.permanentConditions}
            other={pet.permanentConditionsOther}
          />
        )}

        {/* PPP badge — Ley CABA 4078 / Ley Prov 14.107 */}
        {pet.potentiallyDangerousBreed && (
          <div className="mb-[16px]">
            <PppPublicBadge petName={pet.name} breed={pet.breed ?? null} />
          </div>
        )}

        {/* Service dog banner — Ley 26.858 */}
        {showServiceDogBanner && <ServiceDogBanner rabiesAtRisk={rabiesAtRisk} />}

        {/* ------------------------------------------------------------------ */}
        {/* CREDENTIAL CARD                                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="overflow-hidden rounded-[10px] border border-ln-line-strong bg-ln-card shadow-[0_6px_18px_rgba(20,40,60,.08)]">
          {/* Guilloché top band */}
          <div
            aria-hidden="true"
            className="h-[8px]"
            style={{
              background:
                "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
            }}
          />

          {/* Official header row: crest + brand + tier chip */}
          <div className="flex items-center gap-[8px] border-b border-ln-line-2 px-[16px] py-[10px]">
            {/* Crest circle */}
            <div
              aria-hidden="true"
              className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border-[1.5px] border-ln-azul bg-ln-celeste-050 font-[var(--font-ln-serif)] text-sm font-semibold text-ln-azul"
            >
              m
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-[var(--font-ln-serif)] text-[13px] font-semibold text-ln-ink">
                MiMAR
              </span>
              <span className="block font-[var(--font-ln-mono)] text-[8px] uppercase tracking-[.14em] text-ln-mute">
                Credencial pública
              </span>
            </div>
            {/* Tier chip */}
            <span
              className={`rounded-full border px-[8px] py-[3px] font-[var(--font-ln-mono)] text-[9px] font-semibold tracking-[.08em] ${tier2Active ? "border-ln-ok-100 bg-ln-ok-050 text-ln-ok" : "border-ln-celeste-100 bg-ln-celeste-050 text-ln-azul"}`}
            >
              {tier2Active ? "TIER 2 · MÉDICO" : "TIER 0 · IDENTIDAD"}
            </span>
          </div>

          {/* Photo */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={pet.name}
              width={460}
              height={345}
              loading="eager"
              decoding="sync"
              className="block w-full aspect-[4/3] object-cover"
            />
          ) : (
            <div
              className="grid w-full place-items-center aspect-[4/3]"
              style={{
                background: "repeating-linear-gradient(135deg,#e7e2d6 0 11px,#f1eee5 11px 22px)",
              }}
            >
              <span className="font-[var(--font-ln-serif)] text-[56px] font-semibold text-ln-mute">
                {pet.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Name bar */}
          <div className="px-[16px] pt-[15px] pb-[12px]">
            <div className="flex items-center gap-[9px] font-[var(--font-ln-serif)] text-[27px] font-semibold leading-none tracking-[-0.02em] text-ln-ink">
              {pet.name}
              {/* Status dot */}
              <span
                aria-hidden="true"
                className="inline-block h-[11px] w-[11px] flex-shrink-0 rounded-full bg-ln-ok shadow-[0_0_0_3px_#e8f3ec]"
              />
            </div>
            <p className="mt-[5px] text-[13px] text-ln-ink-2">
              {breedLine}
              {ageLabel && ` · ${ageLabel}`}
            </p>
          </div>

          {/* Tier 2 enabled notice */}
          {tier2Active && (
            <div className="flex items-center gap-[7px] border-t border-ln-celeste-100 bg-ln-celeste-050 px-[16px] py-[10px] font-[var(--font-ln-mono)] text-xs leading-[1.5] tracking-[.02em] text-ln-azul-700">
              <span aria-hidden="true">🔓</span>
              {pet.tier2PublicPermanent
                ? "El dueño habilitó la libreta médica de forma permanente"
                : tier2EnabledUntil
                  ? `El dueño habilitó la libreta médica hasta el ${tier2EnabledUntil.toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : null}
            </div>
          )}

          {/* Tier 2 medical summary */}
          {tier2Active && (
            <div className="border-t border-ln-line-2">
              <Tier2MedicalView
                enabledUntil={tier2EnabledUntil}
                vaccineSummary={{
                  active: tier2VaccineActive,
                  expired: 0,
                  dueSoon: 0,
                  missing: 0,
                }}
                isSterilized={tier2IsSterilized}
                activeMedications={tier2ActiveMedications}
                permanentConditions={pet.permanentConditions ?? []}
                permanentConditionsOther={pet.permanentConditionsOther}
              />
            </div>
          )}

          {/* Identity section */}
          <div className="border-t border-ln-line-2 px-[16px] py-[13px]">
            <p className="mb-[9px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-mute">
              Identidad registrada
            </p>
            <div className="grid grid-cols-2 gap-x-[14px] gap-y-[11px]">
              <CredField label="Credencial" value={statusLabel(pet.status)} mono={false} />
              <CredField
                label="Vacunación"
                value={hasVaccinations ? "Con registros" : "Sin registros"}
                mono={false}
              />
              <CredField label="Microchip" value={hasMicrochip ? "Sí" : "No"} mono={false} />
              <CredField label="Tatuaje" value={hasTattoo ? "Sí" : "No"} mono={false} />
              <CredField label="Libreta" value={`LIB-AR-${pet.publicToken.toUpperCase()}`} mono />
            </div>
          </div>

          {/* A.4: Vaccination confidence badge */}
          {showVaccinationConfidence && latestVaccinationTier && (
            <div className="flex items-center gap-[8px] border-t border-ln-line-2 px-[16px] py-[10px]">
              <span className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.08em] text-ln-mute">
                Vacunación:
              </span>
              <ConfidenceBadge tier={latestVaccinationTier} />
            </div>
          )}

          {/* T-4.3: Origin-org badge */}
          {showOriginOrg && originOrg && (
            <div
              data-section="origin-org-badge"
              className="flex items-center gap-[10px] border-t border-ln-line-2 px-[16px] py-[12px]"
            >
              {originOrg.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={originOrg.avatarUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-[28px] w-[28px] flex-shrink-0 rounded-full object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="m-0 font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-ln-mute">
                  Refugio de origen
                </p>
                <p className="m-0 truncate text-[13px] font-medium text-ln-ink">
                  {originOrg.displayName}
                </p>
              </div>
            </div>
          )}

          {/* "Found this pet?" action area */}
          <div className="border-t border-ln-line bg-ln-stripe px-[16px] py-[14px]">
            <details className="group">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-[12px]">
                <div>
                  <p className="m-0 font-[var(--font-ln-serif)] text-md font-semibold text-ln-ink">
                    ¿Encontraste a esta mascota?
                  </p>
                  <p className="mt-[2px] text-[11.5px] text-ln-mute">
                    Tocá acá para avisarle al dueño.
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 text-lg text-ln-mute transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <div className="mt-[12px] border-t border-ln-line pt-[14px]">
                <FoundPetForm publicToken={publicToken} />
              </div>
            </details>
          </div>

          {/* Credential footer */}
          <div className="px-[16px] py-[12px] text-center font-[var(--font-ln-mono)] text-[9.5px] leading-[1.7] tracking-[.02em] text-ln-faint">
            CREDENCIAL PÚBLICA · MiMAR · Registro Nacional de Mascotas
            <br />
            {pet.publicToken.toUpperCase()} · República Argentina
          </div>
        </div>
        {/* END CREDENTIAL CARD */}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThrottleNotice — shown when a single IP exceeds the per-IP read limit.
// Renders a friendly message instead of a hard error. Spanish (es-AR) copy
// per project convention for user-facing copy on public surfaces.
// ---------------------------------------------------------------------------

function ThrottleNotice() {
  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="flex min-h-screen items-center justify-center bg-ln-paper font-[var(--font-ln-sans)]">
      <div className="mx-auto max-w-[400px] px-[24px] py-[48px] text-center text-ln-ink">
        <p className="mb-[12px] font-[var(--font-ln-serif)] text-lg font-semibold">
          Demasiadas consultas
        </p>
        <p className="text-md leading-[1.6] text-ln-ink-2">
          Estás realizando demasiadas consultas desde esta conexión. Esperá unos minutos y volvé a
          intentarlo.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CredField — mono label + value row inside the identity grid
// ---------------------------------------------------------------------------

function CredField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="m-0 font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-ln-faint">
        {label}
      </p>
      <p
        className={`mt-[1px] break-words font-medium text-ln-ink ${
          mono ? "font-[var(--font-ln-mono)] text-sm" : "font-[var(--font-ln-sans)] text-[13.5px]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceDogBanner — Ley 26.858 access notice (LN tone)
// ---------------------------------------------------------------------------

function ServiceDogBanner({ rabiesAtRisk }: { rabiesAtRisk: boolean }) {
  return (
    <section
      aria-label="Banner de acceso — perro de asistencia"
      className="mb-[16px] rounded-[4px] border border-ln-celeste-100 border-l-[3px] border-l-ln-azul bg-ln-celeste-050 px-[16px] py-[14px]"
    >
      <p className="mb-[6px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-azul">
        Perro de Asistencia
      </p>
      <p className="mb-[6px] font-[var(--font-ln-serif)] text-md font-semibold leading-[1.45] text-ln-ink">
        Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este
        establecimiento, espacio privado de acceso público y transporte público.
      </p>
      <p className="text-[11.5px] text-ln-ink-2">
        Marco legal: <strong className="text-ln-ink">Arts. 1 y 7, Ley 26.858</strong> · Reg. Decreto
        792/2019 · Credencial RUPGA vigente (Res. ANDIS 2588/2022).
      </p>
      {rabiesAtRisk && (
        <p className="mt-[10px] border-t border-ln-celeste-100 pt-[10px] text-[11.5px] text-ln-warn">
          Aviso: la vacunación antirrábica figura vencida en el registro. La credencial requiere
          mantener la vacunación al día (Art. 8, Ley 26.858).
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PermanentConditionsBanner — special-needs chips (LN tone)
// ---------------------------------------------------------------------------

function PermanentConditionsBanner({
  codes,
  other,
}: {
  codes: string[];
  other: string | null;
}) {
  const safe: PermanentCondition[] = codes.filter(isPermanentCondition);
  if (safe.length === 0) return null;
  const hasOther = safe.includes("otra");
  return (
    <section className="mb-[16px] rounded-[4px] border border-ln-celeste-100 border-l-[3px] border-l-ln-azul bg-ln-celeste-050 px-[16px] py-[12px]">
      <p className="mb-[8px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-azul">
        Necesidades especiales
      </p>
      <div className="flex flex-wrap gap-[6px]">
        {safe.map((code) => (
          <span
            key={code}
            className="inline-flex rounded-full bg-ln-azul px-[10px] py-[4px] text-sm font-semibold text-white"
          >
            {permanentConditionShortLabel(code)}
          </span>
        ))}
      </div>
      {hasOther && other && <p className="mt-[6px] text-sm text-ln-ink-2">{other}</p>}
    </section>
  );
}
