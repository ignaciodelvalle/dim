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
import { attachments, db, ownerships, petEvents, petServiceDog, pets, profiles } from "@/db";
import { computeConfidence, isAtLeast } from "@/lib/event-confidence";
import { sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { readPoint } from "@/lib/location";
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
      lostDescription,
      lostSince: latestLostEvent?.occurredAt ?? null,
    };
  }

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
          lostSince={lostContext.lostSince ?? new Date()}
          tattooCode={pet.tattooCode}
          tattooLocation={pet.tattooLocation}
          tattooDescription={pet.tattooDescription}
          tattooPhotoUrl={tattooPhotoUrl}
        />
      </>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-950">
      <ScanLogger publicToken={publicToken} />
      <div className="max-w-md mx-auto pt-8 space-y-6">
        {/* Tier 0+ emergency-info banner — owner-toggled. No PII beyond the
            banner text itself. No drug names, no owner name, no contact. */}
        {pet.emergencyInfoVisible && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-center">
            <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
              Esta mascota requiere atención médica
            </p>
            <p className="mt-0.5 text-xs text-rose-800 dark:text-rose-300">
              Por favor contactá al dueño escaneando el QR mientras la cuidás.
            </p>
          </div>
        )}

        {/* Permanent conditions — owner-toggled (disclose_conditions_publicly).
            Helps a finder/vet/visitor understand the pet's lifelong needs at a
            glance. Renders only when both the toggle is on AND there is at
            least one condition recorded. */}
        {pet.discloseConditionsPublicly && pet.permanentConditions.length > 0 && (
          <PermanentConditionsBanner
            codes={pet.permanentConditions}
            other={pet.permanentConditionsOther}
          />
        )}

        {/* Tier 2 público temporal — owner-opt-in widened medical projection.
            Only renders during the active window (set by enableTier2PublicAction
            for 24h in v1). Never exposes owner contact or notes. */}
        {tier2Active && tier2EnabledUntil && (
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
        )}

        {/* Credential header */}
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            MiMAR · Credencial digital
          </p>
          <p className="text-xs font-mono text-neutral-400 dark:text-neutral-600">
            {pet.publicToken}
          </p>
        </div>

        {/* PPP badge — Ley CABA 4078 / Ley Prov 14.107. Renders when the pet is
            subject to the PPP regime. Disclosure is required by law (the public
            has a right to know). Only shown on the active-credential branch —
            lost pets surface this context via LostPublicCredential. */}
        {pet.potentiallyDangerousBreed && (
          <PppPublicBadge petName={pet.name} breed={pet.breed ?? null} />
        )}

        {/* Service dog banner — Ley 26.858. Renders only when the owner opted in
            AND the credential is vigente AND the type is ANDIS-recognized. */}
        {showServiceDogBanner && (
          <section
            aria-label="Banner de acceso — perro de asistencia"
            className="rounded-2xl border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2"
          >
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-indigo-800 dark:text-indigo-200">
              Perro de Asistencia
            </p>
            <p className="text-base font-medium text-indigo-900 dark:text-indigo-100 leading-snug">
              Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este
              establecimiento, espacio privado de acceso público y transporte público.
            </p>
            <p className="text-xs text-indigo-800 dark:text-indigo-200">
              Marco legal: <strong>Arts. 1 y 7, Ley 26.858</strong> · Reg. Decreto 792/2019 ·
              Credencial RUPGA vigente (Res. ANDIS 2588/2022).
            </p>
            {rabiesAtRisk && (
              <p className="text-xs text-amber-800 dark:text-amber-200 border-t border-indigo-200 dark:border-indigo-900 pt-2 mt-2">
                Aviso: la vacunación antirrábica figura vencida en el registro. La credencial
                requiere mantener la vacunación al día (Art. 8, Ley 26.858).
              </p>
            )}
          </section>
        )}

        {/* Photo */}
        <div className="flex justify-center">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-44 h-44 rounded-2xl object-cover ring-4 ring-white dark:ring-neutral-900 shadow-lg"
            />
          ) : (
            <div className="w-44 h-44 rounded-2xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-5xl font-semibold text-neutral-400 dark:text-neutral-600 ring-4 ring-white dark:ring-neutral-900 shadow-lg">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Pet identity */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {speciesLabel(pet.species)}
            {pet.breed && ` · ${pet.breed}`} · {sexLabel(pet.sex)}
            {ageYears !== null && ` · ${ageYears} año${ageYears === 1 ? "" : "s"}`}
          </p>
        </div>

        {/* Status badges */}
        <div className="grid grid-cols-2 gap-3">
          <Badge
            label="Credencial"
            value={pet.status === "active" ? "Válida ✓" : statusLabel(pet.status)}
            tone={pet.status === "active" ? "good" : "warning"}
          />
          <Badge
            label="Vacunación"
            value={hasVaccinations ? "Con registros ✓" : "Sin registros"}
            tone={hasVaccinations ? "good" : "warning"}
          />
          <Badge label="Microchip" value={hasMicrochip ? "Sí" : "No"} />
          <Badge label="Tatuaje" value={hasTattoo ? "Sí" : "No"} />
          <Badge label="Estado" value={statusLabel(pet.status)} />
        </div>

        {/* A.4: Vaccination confidence badge — only shown for institutional or
            professional verified tier. Intentionally silent for self_reported. */}
        {showVaccinationConfidence && latestVaccinationTier && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Vacunación:</span>
            <ConfidenceBadge tier={latestVaccinationTier} />
          </div>
        )}

        {/* Active pet — the "found" form sits behind a disclosure so a casual
            scan doesn't land on an open form. */}
        <details className="group border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-950">
          <summary className="cursor-pointer select-none px-5 py-4 flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-xl transition-colors">
            <div className="text-left space-y-0.5 min-w-0">
              <p className="font-medium text-neutral-900 dark:text-neutral-50">
                ¿Encontraste a esta mascota?
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Tocá acá para avisarle al dueño.
              </p>
            </div>
            <span
              className="text-neutral-400 dark:text-neutral-600 group-open:rotate-90 transition-transform shrink-0"
              aria-hidden
            >
              ›
            </span>
          </summary>
          <div className="px-5 pb-5 pt-1 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
            <FoundPetForm publicToken={publicToken} />
          </div>
        </details>

        {/* Footer */}
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-600">
          Documento de Identificación para Mascotas
        </p>
      </div>
    </main>
  );
}

function Badge({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warning" | "neutral";
}) {
  const toneClasses = {
    good: "text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900",
    warning:
      "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
    neutral:
      "text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800",
  };
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

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
    <section className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 px-4 py-3 space-y-2">
      <p className="text-xs uppercase tracking-wider font-semibold text-indigo-800 dark:text-indigo-200">
        Necesidades especiales
      </p>
      <div className="flex flex-wrap gap-1.5">
        {safe.map((code) => (
          <span
            key={code}
            className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-600 text-white"
          >
            {permanentConditionShortLabel(code)}
          </span>
        ))}
      </div>
      {hasOther && other && <p className="text-xs text-indigo-900 dark:text-indigo-200">{other}</p>}
    </section>
  );
}
