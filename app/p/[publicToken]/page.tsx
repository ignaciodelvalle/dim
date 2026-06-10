// Public credential page — Tier 0 view by default. When pet.status === 'lost'
// the page promotes to Tier 1: owner contact info governed by the five
// disclose_*_when_lost preference columns on the pets row, per spec §7 and
// AGENTS.md → "Privacy tiers".
//
// Privacy posture (active pets): NO owner PII, NO microchip number, NO medical
// details, NO scan history.

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
import { computeConfidence, isAtLeast } from "@/lib/event-confidence";
import { sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { resolveOriginOrg, shouldShowOriginOrgBadge } from "@/lib/origin-org";
import {
  type PermanentCondition,
  isPermanentCondition,
  permanentConditionShortLabel,
} from "@/lib/permanent-conditions";
import { petPhotoUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FoundPetForm } from "./FoundPetForm";
import { ScanLogger } from "./ScanLogger";
import { Tier2MedicalView } from "./Tier2MedicalView";

export default async function PublicCredentialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const [result] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(eq(pets.publicToken, publicToken))
    .limit(1);

  if (!result) notFound();
  const { pet, photo } = result;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // Tier 0 rollups — boolean indicators, never the raw data.
  const vaccinations = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")));
  const hasVaccinations = vaccinations.length > 0;
  const hasMicrochip = !!pet.microchipId;
  const hasTattoo = !!pet.tattooCode;

  // A.4: Confidence badge on public credential — only for institutional_verified
  // or professional_verified (no shame on self_reported). Fetch the most recent
  // vaccination's provenance to compute the tier.
  const [latestVaccination] = await db
    .select({
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

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
  // Never parsed from notes text — canonical discriminator only.
  // No owner PII is exposed: only the authority name and a generic disclaimer.
  const [openCustodyEpisode] = await db
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
    .limit(1);

  const isUnderOfficialCustody = !!openCustodyEpisode;

  // Tier 2 público temporal — owner-opt-in window. Active when the
  // timestamp is in the future. The medical summary block fetches a tiny
  // extra projection only when active so the default Tier 0 render stays
  // cheap. See app/actions/tier2-public.ts + migration 0049.
  const tier2EnabledUntil = pet.tier2PublicEnabledUntil
    ? new Date(pet.tier2PublicEnabledUntil)
    : null;
  const tier2Active = !!tier2EnabledUntil && tier2EnabledUntil > new Date();

  let tier2VaccineActive = 0;
  let tier2IsSterilized = false;
  const tier2ActiveMedications: string[] = [];
  if (tier2Active) {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    // Vacunación "vigente" v1: unique vaccine_name applied in the last 12
    // months. Conservative — a future PR can wire computeVaccinationSummary
    // (catalog interval-aware) once the libreta health-status helpers land.
    const recentVaccines = await db
      .select({ payload: petEvents.payload })
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, pet.id),
          eq(petEvents.eventType, "vaccination_administered"),
          sql`${petEvents.occurredAt} >= ${oneYearAgo.toISOString()}`,
        ),
      );
    const seen = new Set<string>();
    for (const row of recentVaccines) {
      const name =
        typeof (row.payload as { vaccine_name?: unknown })?.vaccine_name === "string"
          ? (row.payload as { vaccine_name: string }).vaccine_name.trim().toLowerCase()
          : "";
      if (name) seen.add(name);
    }
    tier2VaccineActive = seen.size;

    const [steril] = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "sterilization_performed")))
      .limit(1);
    tier2IsSterilized = !!steril;

    // Active medications: started without a referencing stop. Same shape
    // as computeMedicationsActive (lib/libreta-health-status.ts) but
    // inlined to avoid coupling this page to that PR until both ship.
    const medRows = await db
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
      );
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
    const [ownerRow] = await db
      .select({ profile: profiles, ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
      .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
      .limit(1);

    // Last-known location from the most recent status_changed → lost event.
    // Filtering on payload->>'to_status' = 'lost' so a later "found" event
    // (to_status='active') does not eclipse the actual lost-event payload.
    const [latestLostEvent] = await db
      .select({
        payload: petEvents.payload,
        locationLat: petEvents.locationLat,
        locationLng: petEvents.locationLng,
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
      .limit(1);
    const payload = (latestLostEvent?.payload ?? {}) as Record<string, unknown>;
    // Prefer the canonical `location_description` key; fall back to the legacy
    // `last_known_location` for events written before the key rename.
    const textLocation =
      typeof payload.location_description === "string" && payload.location_description.length > 0
        ? payload.location_description
        : typeof payload.last_known_location === "string" && payload.last_known_location.length > 0
          ? payload.last_known_location
          : null;
    // Fallback: precise lat/lng captured on the event row itself.
    const eventPoint = latestLostEvent ? readPoint(latestLostEvent) : null;
    const geoLocation =
      !textLocation && eventPoint
        ? `${eventPoint.lat.toFixed(6)}, ${eventPoint.lng.toFixed(6)}`
        : null;

    // Split display_name on first whitespace to get just the first name. We
    // never expose the full legal name on a public credential.
    const firstName = ownerRow?.profile.displayName
      ? ownerRow.profile.displayName.trim().split(/\s+/)[0]
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

    // Extract lost_description from the event payload (spec §8.4).
    // These are animal-identity details — always shown if present, no
    // disclosure pref gates them.
    const lostDesc = payload.lost_description as
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
      phone: ownerRow?.profile.phone ?? null,
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
    let tattooPhotoUrl: string | null = null;
    if (pet.tattooPhotoId) {
      const [tattooPhoto] = await db
        .select({ storagePath: attachments.storagePath })
        .from(attachments)
        .where(eq(attachments.id, pet.tattooPhotoId))
        .limit(1);
      tattooPhotoUrl = petPhotoUrl(tattooPhoto?.storagePath);
    }

    return (
      <>
        <ScanLogger publicToken={publicToken} />
        <LostPublicCredential
          petName={pet.name}
          petPhotoUrl={photoUrl}
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
          tattooCode={pet.tattooCode}
          tattooLocation={pet.tattooLocation}
          tattooDescription={pet.tattooDescription}
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
    <main
      className="min-h-screen"
      style={{ background: "var(--color-ln-paper)", fontFamily: "var(--font-ln-sans)" }}
    >
      <ScanLogger publicToken={publicToken} />

      {/* Guilloché band — LN security stripe */}
      <div
        aria-hidden="true"
        className="h-[4px] flex-shrink-0"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
          opacity: 0.9,
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
            className="sticky top-0 z-30 -mx-[16px] mb-[16px] md:static md:mx-0 md:mb-[16px] md:rounded-[4px]"
            style={{
              background: "var(--color-ln-err-050)",
              borderBottom: "1px solid var(--color-ln-err-100)",
              padding: "13px 18px",
              display: "flex",
              alignItems: "flex-start",
              gap: 11,
            }}
          >
            {/* Heartbeat icon */}
            <span
              aria-hidden="true"
              style={{
                fontSize: 18,
                color: "var(--color-ln-seal)",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              ♥
            </span>
            <div>
              <p
                style={{
                  fontFamily: "var(--font-ln-serif)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--color-ln-ink)",
                  margin: 0,
                }}
              >
                Alerta médica
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-ln-ink-2)",
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
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
            className="mb-[16px] rounded-[4px]"
            style={{
              background: "var(--color-ln-warn-050)",
              border: "1px solid var(--color-ln-warn-100)",
              borderLeft: "3px solid var(--color-ln-warn)",
              padding: "12px 16px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-ln-mono)",
                fontSize: 9.5,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--color-ln-warn)",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Custodia oficial
            </p>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ln-ink)", margin: 0 }}>
              Esta mascota está bajo custodia oficial.
            </p>
            {openCustodyEpisode?.authorityName && (
              <p style={{ fontSize: 12, color: "var(--color-ln-ink-2)", marginTop: 4 }}>
                Autoridad a cargo: {openCustodyEpisode.authorityName}
              </p>
            )}
            <p style={{ fontSize: 11.5, color: "var(--color-ln-mute)", marginTop: 4 }}>
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
        <div
          className="overflow-hidden rounded-[10px]"
          style={{
            background: "var(--color-ln-card)",
            border: "1px solid var(--color-ln-line-strong)",
            boxShadow: "0 6px 18px rgba(20,40,60,.08)",
          }}
        >
          {/* Guilloché top band */}
          <div
            aria-hidden="true"
            style={{
              height: 8,
              background:
                "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
            }}
          />

          {/* Official header row: crest + brand + tier chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-ln-line-2)",
            }}
          >
            {/* Crest circle */}
            <div
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "1.5px solid var(--color-ln-azul)",
                color: "var(--color-ln-azul)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-ln-serif)",
                fontWeight: 600,
                fontSize: 12,
                background: "var(--color-ln-celeste-050)",
                flexShrink: 0,
              }}
            >
              m
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "var(--font-ln-serif)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-ln-ink)",
                }}
              >
                miMAR
              </span>
              <span
                style={{
                  fontFamily: "var(--font-ln-mono)",
                  fontSize: 8,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: "var(--color-ln-mute)",
                  display: "block",
                }}
              >
                Credencial pública
              </span>
            </div>
            {/* Tier chip */}
            <span
              style={{
                fontFamily: "var(--font-ln-mono)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: ".08em",
                color: tier2Active ? "var(--color-ln-ok)" : "var(--color-ln-azul)",
                background: tier2Active ? "var(--color-ln-ok-050)" : "var(--color-ln-celeste-050)",
                border: `1px solid ${tier2Active ? "var(--color-ln-ok-100)" : "var(--color-ln-celeste-100)"}`,
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
              {tier2Active ? "TIER 2 · MÉDICO" : "TIER 0 · IDENTIDAD"}
            </span>
          </div>

          {/* Photo */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "4/3",
                display: "grid",
                placeItems: "center",
                background: "repeating-linear-gradient(135deg,#e7e2d6 0 11px,#f1eee5 11px 22px)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-ln-serif)",
                  fontSize: 56,
                  fontWeight: 600,
                  color: "var(--color-ln-mute)",
                }}
              >
                {pet.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Name bar */}
          <div style={{ padding: "15px 16px 12px" }}>
            <div
              style={{
                fontFamily: "var(--font-ln-serif)",
                fontWeight: 600,
                fontSize: 27,
                letterSpacing: "-.02em",
                lineHeight: 1,
                color: "var(--color-ln-ink)",
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              {pet.name}
              {/* Status dot */}
              <span
                aria-hidden="true"
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "var(--color-ln-ok)",
                  boxShadow: "0 0 0 3px #e8f3ec",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: "var(--color-ln-ink-2)", marginTop: 5 }}>
              {breedLine}
              {ageLabel && ` · ${ageLabel}`}
            </p>
          </div>

          {/* Tier 2 enabled notice */}
          {tier2Active && tier2EnabledUntil && (
            <div
              style={{
                padding: "10px 16px",
                background: "var(--color-ln-celeste-050)",
                borderTop: "1px solid var(--color-ln-celeste-100)",
                fontFamily: "var(--font-ln-mono)",
                fontSize: 10,
                color: "var(--color-ln-azul-700)",
                letterSpacing: ".02em",
                display: "flex",
                alignItems: "center",
                gap: 7,
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden="true">🔓</span>
              {`El dueño habilitó la libreta médica hasta el ${tier2EnabledUntil.toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            </div>
          )}

          {/* Tier 2 medical summary */}
          {tier2Active && tier2EnabledUntil && (
            <div style={{ borderTop: "1px solid var(--color-ln-line-2)" }}>
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
          <div
            style={{
              padding: "13px 16px",
              borderTop: "1px solid var(--color-ln-line-2)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-ln-mono)",
                fontSize: 9.5,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--color-ln-mute)",
                fontWeight: 600,
                marginBottom: 9,
              }}
            >
              Identidad registrada
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "11px 14px",
              }}
            >
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
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--color-ln-line-2)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-ln-mono)",
                  fontSize: 9.5,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--color-ln-mute)",
                  fontWeight: 600,
                }}
              >
                Vacunación:
              </span>
              <ConfidenceBadge tier={latestVaccinationTier} />
            </div>
          )}

          {/* T-4.3: Origin-org badge */}
          {showOriginOrg && originOrg && (
            <div
              data-section="origin-org-badge"
              style={{
                padding: "12px 16px",
                borderTop: "1px solid var(--color-ln-line-2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {originOrg.avatarUrl && (
                <img
                  src={originOrg.avatarUrl}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-ln-mono)",
                    fontSize: 9,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--color-ln-mute)",
                    margin: 0,
                  }}
                >
                  Refugio de origen
                </p>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-ln-ink)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {originOrg.displayName}
                </p>
              </div>
            </div>
          )}

          {/* "Found this pet?" action area */}
          <div
            style={{
              padding: "14px 16px",
              background: "var(--color-ln-stripe)",
              borderTop: "1px solid var(--color-ln-line)",
            }}
          >
            <details className="group">
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  userSelect: "none",
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-ln-serif)",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--color-ln-ink)",
                      margin: 0,
                    }}
                  >
                    ¿Encontraste a esta mascota?
                  </p>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--color-ln-mute)",
                      margin: "2px 0 0",
                    }}
                  >
                    Tocá acá para avisarle al dueño.
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="group-open:rotate-90 transition-transform"
                  style={{ color: "var(--color-ln-mute)", fontSize: 18, flexShrink: 0 }}
                >
                  ›
                </span>
              </summary>
              <div
                style={{
                  paddingTop: 14,
                  marginTop: 12,
                  borderTop: "1px solid var(--color-ln-line)",
                }}
              >
                <FoundPetForm publicToken={publicToken} />
              </div>
            </details>
          </div>

          {/* Credential footer */}
          <div
            style={{
              padding: "12px 16px",
              textAlign: "center",
              fontFamily: "var(--font-ln-mono)",
              fontSize: 9.5,
              color: "var(--color-ln-faint)",
              letterSpacing: ".02em",
              lineHeight: 1.7,
            }}
          >
            CREDENCIAL PÚBLICA · miMAR · Registro Nacional de Mascotas
            <br />
            {pet.publicToken.toUpperCase()} · República Argentina
          </div>
        </div>
        {/* END CREDENTIAL CARD */}
      </div>
    </main>
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
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--color-ln-faint)",
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: mono ? 12 : 13.5,
          fontFamily: mono ? "var(--font-ln-mono)" : "var(--font-ln-sans)",
          fontWeight: 500,
          color: "var(--color-ln-ink)",
          marginTop: 1,
          overflowWrap: "break-word",
        }}
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
      className="mb-[16px] rounded-[4px]"
      style={{
        background: "var(--color-ln-celeste-050)",
        border: "1px solid var(--color-ln-celeste-100)",
        borderLeft: "3px solid var(--color-ln-azul)",
        padding: "14px 16px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--color-ln-azul)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Perro de Asistencia
      </p>
      <p
        style={{
          fontFamily: "var(--font-ln-serif)",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ln-ink)",
          lineHeight: 1.45,
          marginBottom: 6,
        }}
      >
        Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este
        establecimiento, espacio privado de acceso público y transporte público.
      </p>
      <p style={{ fontSize: 11.5, color: "var(--color-ln-ink-2)" }}>
        Marco legal:{" "}
        <strong style={{ color: "var(--color-ln-ink)" }}>Arts. 1 y 7, Ley 26.858</strong> · Reg.
        Decreto 792/2019 · Credencial RUPGA vigente (Res. ANDIS 2588/2022).
      </p>
      {rabiesAtRisk && (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--color-ln-warn)",
            borderTop: "1px solid var(--color-ln-celeste-100)",
            paddingTop: 10,
            marginTop: 10,
          }}
        >
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
    <section
      className="mb-[16px] rounded-[4px]"
      style={{
        background: "var(--color-ln-celeste-050)",
        border: "1px solid var(--color-ln-celeste-100)",
        borderLeft: "3px solid var(--color-ln-azul)",
        padding: "12px 16px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-ln-mono)",
          fontSize: 9.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--color-ln-azul)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Necesidades especiales
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {safe.map((code) => (
          <span
            key={code}
            style={{
              display: "inline-flex",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--color-ln-azul)",
              color: "#fff",
            }}
          >
            {permanentConditionShortLabel(code)}
          </span>
        ))}
      </div>
      {hasOther && other && (
        <p style={{ fontSize: 12, color: "var(--color-ln-ink-2)", marginTop: 6 }}>{other}</p>
      )}
    </section>
  );
}
