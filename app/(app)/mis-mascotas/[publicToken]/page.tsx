// ---------------------------------------------------------------------------
// STRATEGY: Option B — Hybrid swap (Chunk J, 2026-05-21)
//
// v2 components used (PetProfileHero, PetEmergencyCard, PetHealthTimeline,
// PetWeightChart, PetVaccineReminders, PetCredentialCard,
// PetTrackingPlaceholder, PetTravelDocs):
//   - Provide the new visual identity: hero ring, emergency card layout,
//     health timeline with filter chips, sparkline weight chart, vaccine
//     reminder surface, tracking placeholder, credential card, travel docs.
//
// Pre-v2 sections preserved:
//   - <PetReminders>         (C3) — vaccine reminders with Registrar/Eliminar
//                                   actions. Kept instead of <PetVaccineReminders>
//                                   because it has the server-action wiring that
//                                   v2's component doesn't (deleteVaccineReminderAction).
//   - <UpcomingAppointments> (C3) — confirmed vet appointments for this pet.
//   - <MedicationDosesSection> — pending medication doses with "Marcar dada" action.
//   - <PetOpenCasesSection>  (E) — open cases attached to this pet.
//   - <PregnancyInProgressCard> — conditional card when pregnancyStatus='in_progress'.
//   - <PpPCard>              — conditional PPP card for dangerous breeds.
//   - <ServiceDogCredentialCard> — conditional service-dog card (Ley 26.858).
//   - <AchievementsSection>  — pet achievements panel (kept; v2 plan explicitly
//                               says "below the seven sections, only when applicable").
//   - <RabiesObservationBanner> — inline alert while rabies observation is active.
//   - <TransitBanner>        — shelter_custody / transit notice.
//   - <DeceasedView>         — early return for deceased pets.
//   - Info grid + action buttons — compact meta grid + action row.
//
// v2 components NOT used:
//   - <PetVaccineReminders>  — semantically equivalent to <PetReminders> but
//                               lacks the Registrar/Eliminar server-action wiring.
//                               <PetReminders> (C3) is the canonical surface.
//
// Emergency contacts: <PetEmergencyCard> reads from profiles.preferred_vet_*
//   and profiles.emergency_contact_* (migration 0042). Edited at /cuenta/editar
//   under "Contactos para emergencias". One set of contacts per owner, shared
//   across all their pets (consistent with how an owner thinks about it).
//
// TODO(J-followup): Travel docs — no pet_attachments table yet. <PetTravelDocs>
//   renders an empty state until the table / attachment kind is added.
//
// TODO(K): Lost mode branch — when pet.status === "lost", the Chunk K swap
//   will add the lost cockpit layout (LostModeBanner + LostScanFeed etc.) as
//   a server-side branch here. <PetProfileHero> already sets lostMode=true.
// ---------------------------------------------------------------------------

import { markMedicationDoseTakenAction } from "@/app/actions/events";
import { markAchievementSeenAction } from "@/app/actions/achievement-views";
import { signTimelineAttachmentsForPet } from "@/app/actions/sign-timeline-attachments";
import { AchievementsSection } from "@/components/AchievementsSection";
import type { CredentialChip } from "@/components/AchievementsSection";
import { PetActionsMenu } from "@/components/PetActionsMenu";
import { PetCurrentStateSection } from "@/components/PetCurrentStateSection";
import { PetUpcomingCareSection } from "@/components/PetUpcomingCareSection";
import type { PetState } from "@/components/EventCatcher";
import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import { PpPCard } from "@/components/PpPCard";
import { PppExportCabaButton } from "@/components/PppExportCabaButton";
import { PregnancyInProgressCard } from "@/components/PregnancyInProgressCard";
import { ServiceDogCredentialCard } from "@/components/ServiceDogCredentialCard";
import { PetCredentialCard } from "@/components/pet-profile/PetCredentialCard";
import { PetEmergencyCard } from "@/components/pet-profile/PetEmergencyCard";
import { PetHealthTimeline } from "@/components/pet-profile/PetHealthTimeline";
import { type PetHeroPet, PetProfileHero } from "@/components/pet-profile/PetProfileHero";
import { PetTrackingPlaceholder } from "@/components/pet-profile/PetTrackingPlaceholder";
import { PetTravelDocs } from "@/components/pet-profile/PetTravelDocs";
import { PetWeightChart } from "@/components/pet-profile/PetWeightChart";
import { PhysicalTagInterestCard } from "@/components/pet-profile/PhysicalTagInterestCard";
import {
  appointments,
  attachments,
  cases,
  db,
  ownerships,
  petAchievementViews,
  petEvents,
  petServiceDog,
  pets,
  profiles,
  reminders,
  serviceOfferings,
  timeSlots,
} from "@/db";
import type { Pet, Reminder } from "@/db";
import { getEarnedAchievements } from "@/lib/achievements/catalog";
import { excludeSelfScansClause } from "@/lib/events";
import { ageFromDateOfBirth, formatDate, sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { LIBRETA_FILTER_CHIPS, isLibretaSanitariaEvent } from "@/lib/libreta-sanitaria";
import {
  fetchActiveRemindersForPet,
  fetchPetEventsForProfileV2,
  fetchPetWeightHistory,
} from "@/lib/owner-dashboard";
import { requirePetAccess } from "@/lib/pet-access";
import { getPhysicalTagInterest } from "@/lib/physical-tag-interest";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/storage";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventTimeline } from "./EventTimeline";
import { MarkFoundButton } from "./MarkFoundButton";
import { PetReminders } from "./_components/PetReminders";

// NOTE: eventsWithAttachments is fetched only when pet.status === 'deceased'
// (needed by DeceasedView). For active pets, fetchPetEventsForProfileV2 is
// used instead, which runs two targeted queries without attachment signing.

// TODO(K-followup): When pet.status === 'lost', this page should show the
// lost-mode cockpit (LostModeBanner, LostShareCard, LostLastSeenCard,
// LostDisclosureCard, LostScanFeed) instead of the regular sections.
// The cockpit components already exist in components/pet-profile/.
// This requires: fetchLostEpisodeForPet (open lost_pet_episode case),
// fetchScanEvents (credential_scanned events for this pet), and
// fetchFinderMessages (finder contact messages — table TBD).
// Fold into a conditional branch at the top of PetDetailPage once those
// query helpers are in place.

// ---------------------------------------------------------------------------
// Pet state derivation — maps pets fields to the visual state ring convention.
// The same mapping lives in EventCatcher.tsx; when lib/pet-state.ts is
// extracted (follow-up) both will share it.
// ---------------------------------------------------------------------------

function derivePetState(pet: Pet): PetState {
  if (pet.status === "lost") return "urgent";
  if (pet.rabiesObservationStatus === "in_progress") return "attention";
  if (pet.pregnancyStatus === "in_progress") return "info";
  return "ok";
}

function derivePetStateLabel(pet: Pet): string | null {
  if (pet.status === "lost") return "Perdida";
  if (pet.rabiesObservationStatus === "in_progress") return "Obs. antirrábica";
  if (pet.pregnancyStatus === "in_progress") return "Gestación";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

// Returns a human-readable proximity hint for an upcoming medication dose.
// Examples: "Atrasada por 2h", "En 30 min", "Mañana 08:00", "Hoy 14:30".
function formatDoseProximity(dueAt: Date | string): string {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / (1000 * 60));
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMin < 0) {
    const absMins = Math.abs(diffMin);
    if (absMins < 60) return `Atrasada por ${absMins} min`;
    const absHours = Math.round(absMins / 60);
    if (absHours < 24) return `Atrasada por ${absHours}h`;
    const absDays = Math.floor(absHours / 24);
    return `Atrasada ${absDays} día${absDays === 1 ? "" : "s"}`;
  }
  if (diffMin === 0) return "Ahora";
  if (diffMin < 60) return `En ${diffMin} min`;
  if (diffHours < 24) {
    const timeStr = due.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `Hoy ${timeStr}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (
    due.getDate() === tomorrow.getDate() &&
    due.getMonth() === tomorrow.getMonth() &&
    due.getFullYear() === tomorrow.getFullYear()
  ) {
    const timeStr = due.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `Mañana ${timeStr}`;
  }
  return due.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trainingLevelLabel(level: string): string {
  switch (level) {
    case "none":
      return "Ninguno";
    case "basic":
      return "Básico";
    case "intermediate":
      return "Intermedio";
    case "advanced":
      return "Avanzado";
    case "professional":
      return "Profesional";
    default:
      return level;
  }
}

// ---------------------------------------------------------------------------
// Deceased (in-memoriam) view — PRESERVED
// ---------------------------------------------------------------------------

function deceasedSubtitle(pet: Pet): string {
  const deceasedYear = pet.deceasedAt ? new Date(pet.deceasedAt).getFullYear() : null;
  if (pet.dateOfBirth && deceasedYear) {
    const birthYear = new Date(pet.dateOfBirth).getFullYear();
    return `En memoria · ${birthYear} – ${deceasedYear}`;
  }
  if (deceasedYear) {
    const genderedWord = pet.sex === "male" ? "Fallecido" : "Fallecida";
    const fullDate = formatDate(pet.deceasedAt);
    return `En memoria · ${genderedWord} el ${fullDate}`;
  }
  return "En memoria";
}

function DeceasedView({
  pet,
  photoUrl,
  eventsWithAttachments,
}: {
  pet: Pet;
  photoUrl: string | null;
  eventsWithAttachments: Parameters<typeof EventTimeline>[0]["events"];
}) {
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a mis mascotas
        </Link>

        {/* In-memoriam hero — centered, muted */}
        <section className="flex flex-col items-center gap-3 pt-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-24 h-24 rounded-full object-cover opacity-80"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-3xl font-semibold text-neutral-400 dark:text-neutral-600 opacity-80">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {pet.name}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              {deceasedSubtitle(pet)}
            </p>
          </div>

          <p className="text-sm text-neutral-500 dark:text-neutral-500 pt-1">
            <Link
              href={`/mis-mascotas/${pet.publicToken}/editar`}
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Editar mascota
            </Link>
            {" · "}
            <Link
              href={`/p/${pet.publicToken}`}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Ver credencial pública
            </Link>
            {" · "}
            <Link
              href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/nota`}
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              + Agregar nota
            </Link>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Libreta sanitaria
          </h2>
          <EventTimeline
            events={eventsWithAttachments.filter((e) => isLibretaSanitariaEvent(e.eventType))}
            publicToken={pet.publicToken}
            chips={LIBRETA_FILTER_CHIPS}
          />
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { supabase, user, pet, accessPath, organization } = access;

  // Photo: separate small query indexed on primaryPhotoId, only if set.
  const [photo] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];
  const photoUrl = petPhotoUrl(photo?.storagePath);

  let isTransit = false;
  let ownershipRole: string | null = null;
  if (accessPath === "owner") {
    const [ownerRow] = await db
      .select({ role: ownerships.role })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, pet.id),
          eq(ownerships.ownerUserId, user.id),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    isTransit = ownerRow?.role === "shelter_custody";
    ownershipRole = ownerRow?.role ?? null;
  }

  // Emergency / vet contacts from the viewer's profile — only meaningful for
  // accessPath==="owner". Org-side access keeps the card empty (the org
  // viewer is not the pet's owner). J-followup wires these to the columns
  // added in migration 0042.
  let viewerContacts: {
    preferredVetName: string | null;
    preferredVetPhone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  } | null = null;
  if (accessPath === "owner") {
    const [profileRow] = await db
      .select({
        preferredVetName: profiles.preferredVetName,
        preferredVetPhone: profiles.preferredVetPhone,
        emergencyContactName: profiles.emergencyContactName,
        emergencyContactPhone: profiles.emergencyContactPhone,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    viewerContacts = profileRow ?? null;
  }

  // §4.20 physical-tag-interest state — only meaningful for the legal owner
  // path. Org-path viewers (foster, shelter custody) don't see the card.
  const physicalTagInterest =
    accessPath === "owner" ? await getPhysicalTagInterest(pet.id, user.id) : null;

  // Achievements — service dog row + cases needed for getEarnedAchievements.
  const [[serviceDogRow], allCases] = await Promise.all([
    db.select().from(petServiceDog).where(eq(petServiceDog.petId, pet.id)).limit(1),
    db.select().from(cases).where(eq(cases.primaryPetId, pet.id)),
  ]);

  // EARLY RETURN for deceased: need full event list + signed attachments for
  // the DeceasedView (EventTimeline component). Only this branch fetches the
  // heavy O(N) query — active pets use fetchPetEventsForProfileV2 below.
  if (pet.status === "deceased") {
    const deceasedEvents = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
      .orderBy(desc(petEvents.occurredAt));
    const deceasedEventIds = deceasedEvents.map((e) => e.id);
    const deceasedAttachmentRows =
      deceasedEventIds.length > 0
        ? await db.select().from(attachments).where(inArray(attachments.eventId, deceasedEventIds))
        : [];
    const deceasedUrlMap = new Map<string, string>();
    await Promise.all(
      deceasedAttachmentRows.map(async (a) => {
        if (!a.eventId) return;
        const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
        if (url) deceasedUrlMap.set(a.eventId, url);
      }),
    );
    const deceasedEventsWithAttachments = deceasedEvents.map((e) => ({
      ...e,
      attachmentUrl: deceasedUrlMap.get(e.id) ?? null,
    }));
    return (
      <DeceasedView
        pet={pet}
        photoUrl={photoUrl}
        eventsWithAttachments={deceasedEventsWithAttachments}
      />
    );
  }

  // v2 targeted queries — replaces the old O(N) events + attachment signing.
  const { typedEvents, recentFive } = await fetchPetEventsForProfileV2(pet.id);

  // Pregnancy card data — derived from typedEvents (clinical_info_logged events
  // are in the whitelist so they're available here).
  const PREGNANCY_DURATION_WEEKS_BY_SPECIES: Record<string, number> = {
    dog: 9,
    cat: 9,
    other: 9,
  };
  let pregnancyCardData: {
    startedAt: Date;
    weeksAtDiagnosis: number | null;
    expectedBirthAt: Date;
    lastClinicalAt: Date | null;
  } | null = null;
  if (pet.pregnancyStatus === "in_progress") {
    const startedEvent = typedEvents.find((e) => {
      if (e.eventType !== "clinical_info_logged") return false;
      const p = e.payload as { sub_kind?: string; pregnancy_phase?: string };
      return p.sub_kind === "pregnancy" && p.pregnancy_phase === "started";
    });
    if (startedEvent) {
      const payload = startedEvent.payload as { weeks_at_diagnosis?: number | null };
      const speciesWeeks = PREGNANCY_DURATION_WEEKS_BY_SPECIES[pet.species] ?? 9;
      const remaining = Math.max(speciesWeeks - (payload.weeks_at_diagnosis ?? 0), 0);
      const expectedBirthAt = new Date(
        startedEvent.occurredAt.getTime() + remaining * 7 * 86400000,
      );
      const lastClinical = typedEvents.find(
        (e) => e.eventType === "clinical_info_logged" && e.occurredAt > startedEvent.occurredAt,
      );
      pregnancyCardData = {
        startedAt: startedEvent.occurredAt,
        weeksAtDiagnosis: payload.weeks_at_diagnosis ?? null,
        expectedBirthAt,
        lastClinicalAt: lastClinical?.occurredAt ?? null,
      };
    }
  }

  // Achievement views — load pulse_until rows for the current owner session.
  // Only meaningful for the owner path; org-path viewers don't see pulse UX.
  let viewsMap: Map<string, Date | null> | undefined;
  if (accessPath === "owner") {
    const viewRows = await db
      .select({ achievementId: petAchievementViews.achievementId, pulseUntil: petAchievementViews.pulseUntil })
      .from(petAchievementViews)
      .where(and(eq(petAchievementViews.userId, user.id), eq(petAchievementViews.petId, pet.id)));
    viewsMap = new Map(viewRows.map((r) => [r.achievementId, r.pulseUntil]));
  }

  // Achievements — typedEvents ordered ASC from the helper.
  // Pass viewsMap so pulse_until is populated (or defaulted to +7d for new achievements).
  const earnedAchievements = getEarnedAchievements(
    {
      pet,
      events: typedEvents,
      serviceDog: serviceDogRow ?? null,
      cases: allCases,
    },
    viewsMap,
  );

  // Fire markAchievementSeenAction for each newly-earned achievement that has
  // no view row yet (viewsMap missing the key). Swallow errors — this is a
  // best-effort UX pulse, not load-bearing.
  if (accessPath === "owner" && viewsMap !== undefined) {
    const unseenIds = earnedAchievements
      .map((a) => a.id)
      .filter((id) => !viewsMap!.has(id));
    // Fire-and-forget in background — page render must not block on this.
    void Promise.all(
      unseenIds.map((id) =>
        markAchievementSeenAction(pet.publicToken, id).catch((err) =>
          console.warn("[markAchievementSeenAction]", err),
        ),
      ),
    );
  }

  // Credential chips — rendered leftmost in AchievementsSection.
  const credentialChips: CredentialChip[] = [];
  if (pet.potentiallyDangerousBreed) {
    credentialChips.push({ kind: "ppp", label: "PPP", icon: "⚠️" });
  }
  if (
    serviceDogRow &&
    serviceDogRow.credentialStatus === "vigente" &&
    serviceDogRow.inService
  ) {
    credentialChips.push({ kind: "service_dog", label: "Perro de servicio", icon: "🦮" });
  }

  // Parallel data fetching — all remaining queries.
  const [petActiveReminders, pendingMedicationReminders, upcomingAppointments, weightHistory] =
    await Promise.all([
      // Vaccine reminders for owner path only.
      accessPath === "owner"
        ? fetchActiveRemindersForPet(user.id, pet.id)
        : Promise.resolve([] as Awaited<ReturnType<typeof fetchActiveRemindersForPet>>),
      // Pending medication dose reminders, soonest first.
      db
        .select()
        .from(reminders)
        .where(
          and(
            eq(reminders.petId, pet.id),
            eq(reminders.reminderType, "medication"),
            isNull(reminders.completedAt),
          ),
        )
        .orderBy(asc(reminders.dueAt)),
      // Upcoming confirmed appointments for this pet, soonest first (max 10).
      db
        .select({
          publicToken: appointments.publicToken,
          status: appointments.status,
          offeringDisplayName: serviceOfferings.displayName,
          slotStartsAt: timeSlots.startsAt,
        })
        .from(appointments)
        .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
        .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
        .where(
          and(
            eq(appointments.petId, pet.id),
            eq(appointments.status, "confirmed"),
            gt(timeSlots.startsAt, new Date()),
          ),
        )
        .orderBy(asc(timeSlots.startsAt))
        .limit(10),
      // Weight history for PetWeightChart.
      fetchPetWeightHistory(pet.id),
    ]);

  const age = ageFromDateOfBirth(pet.dateOfBirth);

  // Build v2 hero data.
  const heroData: PetHeroPet = {
    name: pet.name,
    publicToken: pet.publicToken,
    photoUrl,
    species: speciesLabel(pet.species),
    breed: pet.breed,
    ageLabel: age ?? "—",
    weightLabel: pet.estimatedWeightKg ? `${pet.estimatedWeightKg} kg` : null,
    state: derivePetState(pet),
    stateLabel: derivePetStateLabel(pet),
    lostMode: pet.status === "lost",
  };

  // Medication doses for MedicationDosesSection.
  // The section needs medication_started payloads to group by drug name.
  // We source them from typedEvents (medication_started is in the whitelist).
  const medicationSourceEvents = typedEvents
    .filter((e) => e.eventType === "medication_started")
    .map((e) => ({ ...e, attachmentUrl: null }));

  return (
    <main className="min-h-screen bg-white p-5 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl space-y-4 pb-12">
        {/* §4.9 (1) Back link */}
        <Link
          href={
            accessPath === "org" && organization
              ? `/org/${organization.publicToken}/mascotas`
              : "/mis-mascotas"
          }
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          data-section="back-link"
        >
          ← {accessPath === "org" ? "Animales en custodia" : "Mis mascotas"}
        </Link>

        {/* Org-mediated access notice */}
        {accessPath === "org" && organization && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
            Cualquier evento que registres queda atribuido a la organización.
          </div>
        )}

        {isTransit && <TransitBanner petName={pet.name} />}

        {pet.rabiesObservationStatus === "in_progress" && (
          <RabiesObservationBanner pet={pet} events={typedEvents} />
        )}

        {/* §4.9 (2) Open cases section */}
        <PetOpenCasesSection petId={pet.id} />

        {/* Pregnancy card — conditional, above hero */}
        {pregnancyCardData && (
          <PregnancyInProgressCard
            petPublicToken={pet.publicToken}
            pregnancyStartedAt={pregnancyCardData.startedAt}
            weeksAtDiagnosis={pregnancyCardData.weeksAtDiagnosis}
            expectedBirthAt={pregnancyCardData.expectedBirthAt}
            lastClinicalAt={pregnancyCardData.lastClinicalAt}
          />
        )}

        {/* §4.9 (3) PPP card — DEFERRED to Slice C */}
        {pet.potentiallyDangerousBreed && (
          <>
            <PpPCard
              petPublicToken={pet.publicToken}
              breed={pet.breed}
              events={typedEvents.map((e) => ({ ...e, attachmentUrl: null }))}
              isTransit={isTransit}
            />
            {/* PPP CABA export CTA */}
            {accessPath === "owner" &&
              pet.jurisdictionProvince === "Ciudad Autónoma de Buenos Aires" && (
                <PppExportCabaButton petPublicToken={pet.publicToken} />
              )}
          </>
        )}

        {/* §4.9 (4) Service Dog credential card — DEFERRED to Slice C */}
        {serviceDogRow &&
          serviceDogRow.credentialStatus === "vigente" &&
          serviceDogRow.inService && (
            <ServiceDogCredentialCard
              petPublicToken={pet.publicToken}
              petName={pet.name}
              microchipId={pet.microchipId}
              serviceDog={serviceDogRow}
              photoUrl={photoUrl}
            />
          )}

        {/* §4.9 (5) Hero — identity header */}
        <PetProfileHero pet={heroData} />

        {/* §4.9 (6) Achievements row + credentials */}
        <AchievementsSection earned={earnedAchievements} credentials={credentialChips} />

        {/* §4.9 (7) Estado actual — new section with tattoo (R5) */}
        <PetCurrentStateSection pet={pet} typedEvents={typedEvents} />

        {/* §4.9 (8) Cuidados próximos — consolidates reminders + appointments + meds */}
        <PetUpcomingCareSection
          reminders={petActiveReminders}
          appointments={upcomingAppointments}
          medicationDoses={pendingMedicationReminders.map((r) => ({
            reminderId: r.id,
            drugName: r.title,
            dueAt: r.dueAt,
          }))}
          petToken={pet.publicToken}
        />

        {/* §4.9 (9) Health timeline — collapsed by default, lazy signing.
            signTimelineAttachmentsForPet is bound to the pet's publicToken so
            the client component receives a (eventIds) => Promise<…> signer
            that satisfies the SignerFn type without server-only imports. */}
        <PetHealthTimeline
          recentFive={recentFive}
          fullHistoryHref={`/mis-mascotas/${pet.publicToken}/historial`}
          signAttachments={signTimelineAttachmentsForPet.bind(null, pet.publicToken)}
        />

        {/* §4.9 (10) Actions menu — replaces inline action buttons */}
        <PetActionsMenu
          pet={{ species: pet.species, status: pet.status, publicToken: pet.publicToken }}
          accessPath={accessPath === "org" ? "org" : "owner"}
          ownershipRole={ownershipRole}
          hasPendingReturnProposal={false}
        />

        {/* Auxiliary cards — below PetActionsMenu per design §5 */}

        {/* v2 Emergency card */}
        <PetEmergencyCard
          editHref="/cuenta/editar"
          vet={
            viewerContacts?.preferredVetName && viewerContacts.preferredVetPhone
              ? {
                  name: viewerContacts.preferredVetName,
                  role: "Vet de cabecera",
                  phone: viewerContacts.preferredVetPhone,
                }
              : null
          }
          emergencyContact={
            viewerContacts?.emergencyContactName && viewerContacts.emergencyContactPhone
              ? {
                  name: viewerContacts.emergencyContactName,
                  role: "Contacto emergencia",
                  phone: viewerContacts.emergencyContactPhone,
                }
              : null
          }
          alerts={[]}
        />

        {/* Medication doses — preserved (needed until MedicationDosesSection is refactored) */}
        <MedicationDosesSection
          pet={pet}
          reminders={pendingMedicationReminders}
          sourceEvents={medicationSourceEvents}
        />

        {/* v2 Weight sparkline */}
        <PetWeightChart samples={weightHistory} />

        <section>
          <Link
            href={`/mis-mascotas/${pet.publicToken}/libreta`}
            className="block w-full text-center px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Ver libreta completa →
          </Link>
        </section>

        {/* v2 Credential card */}
        <PetCredentialCard
          publicToken={pet.publicToken}
          qrUrl={`/p/${pet.publicToken}.png`}
          publicHref={`/p/${pet.publicToken}`}
        />

        {/* §4.20 placeholder — owner-only, captures demand for physical QR tag */}
        {physicalTagInterest ? (
          <PhysicalTagInterestCard
            petPublicToken={pet.publicToken}
            petName={pet.name}
            initialInterested={physicalTagInterest.interested}
            initialRequestedAt={physicalTagInterest.requestedAt}
          />
        ) : null}

        {/* v2 Tracking placeholder */}
        <PetTrackingPlaceholder href={`/mis-mascotas/${pet.publicToken}/tracking`} />

        {/* v2 Travel docs — TODO(J-followup): wire from pet_attachments or
            attachments with kind in ('passport','intl_cert') once table exists. */}
        <PetTravelDocs
          uploadHref={`/mis-mascotas/${pet.publicToken}/editar?section=docs`}
          docs={[]}
        />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// MedicationDosesSection — PRESERVED (no v2 equivalent)
// ---------------------------------------------------------------------------

type SourceEvent = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  attachmentUrl: string | null;
};

function MedicationDosesSection({
  pet,
  reminders: allReminders,
  sourceEvents,
}: {
  pet: Pet;
  reminders: Reminder[];
  sourceEvents: SourceEvent[];
}) {
  const drugNameBySourceId = new Map<string, string>();
  for (const ev of sourceEvents) {
    if (ev.eventType === "medication_started") {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      const name = typeof p.drug_name === "string" ? p.drug_name : null;
      if (name) drugNameBySourceId.set(ev.id, name);
    }
  }

  const groups = new Map<string, { drugName: string; reminders: Reminder[] }>();
  const ungroupedKey = "__ungrouped__";
  for (const reminder of allReminders) {
    const key = reminder.sourceEventId ?? ungroupedKey;
    if (!groups.has(key)) {
      const drugName = reminder.sourceEventId
        ? (drugNameBySourceId.get(reminder.sourceEventId) ?? reminder.title)
        : reminder.title;
      groups.set(key, { drugName, reminders: [] });
    }
    (groups.get(key) as { drugName: string; reminders: Reminder[] }).reminders.push(reminder);
  }

  const boundAction = markMedicationDoseTakenAction;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Próximas dosis
        </h2>
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/medicacion-inicio`}
          className="text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          + Nueva medicación
        </Link>
      </div>
      {allReminders.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin dosis pendientes.</p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, group]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {group.drugName}
              </p>
              <ul className="space-y-2">
                {group.reminders.map((reminder) => {
                  const proximity = formatDoseProximity(reminder.dueAt);
                  const isOverdue = new Date(reminder.dueAt) < new Date();
                  return (
                    <li
                      key={reminder.id}
                      className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm text-neutral-900 dark:text-neutral-50">
                          {reminder.description ?? reminder.title}
                        </p>
                        <p
                          className={`text-xs font-medium ${
                            isOverdue
                              ? "text-red-600 dark:text-red-400"
                              : "text-neutral-500 dark:text-neutral-500"
                          }`}
                        >
                          {proximity}
                        </p>
                      </div>
                      <form action={boundAction}>
                        <input type="hidden" name="reminderId" value={reminder.id} />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shrink-0"
                        >
                          Marcar dada
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Banners — PRESERVED
// ---------------------------------------------------------------------------

type RabiesObservationBannerProps = {
  pet: { name: string; publicToken: string };
  events: Array<{ id: string; eventType: string; occurredAt: Date | string; payload: unknown }>;
};

function RabiesObservationBanner({ pet, events }: RabiesObservationBannerProps) {
  const startedEvent = events.find((e) => e.eventType === "rabies_observation_started");
  const startedPayload = (startedEvent?.payload ?? {}) as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;

  const biteEvent = events.find(
    (e) =>
      e.eventType === "incident_reported" &&
      (e.payload as Record<string, unknown> | null)?.incident_type === "bite_inflicted",
  );
  const biteDate = biteEvent ? new Date(biteEvent.occurredAt) : null;

  const periodClosed =
    observationUntil !== null &&
    Number.isFinite(observationUntil.getTime()) &&
    observationUntil <= new Date();

  return (
    <section className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="font-medium text-amber-900 dark:text-amber-200">
        Observación antirrábica en curso
      </p>
      <p className="text-sm text-amber-800 dark:text-amber-300">
        {biteDate
          ? `Por la mordedura del ${biteDate.toLocaleDateString("es-AR")}, `
          : "Por una mordedura reportada recientemente, "}
        {pet.name} está en observación obligatoria de 10 días.
        {observationUntil && ` Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}.`}
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Si {pet.name} muestra salivación excesiva, agresividad inusual, parálisis o cambios bruscos
        de comportamiento, consultá al veterinario de inmediato.
      </p>
      {periodClosed && (
        <form
          action={async () => {
            "use server";
            const { ownerCloseRabiesObservationAction } = await import("@/app/actions/bite");
            await ownerCloseRabiesObservationAction(pet.publicToken);
          }}
        >
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
          >
            Confirmar fin de observación
          </button>
        </form>
      )}
    </section>
  );
}

function TransitBanner({ petName }: { petName: string }) {
  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 opacity-60 cursor-not-allowed"
        >
          Convertir en mi mascota
        </button>
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 opacity-60 cursor-not-allowed"
        >
          Buscar nuevo hogar
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upcoming appointments — PRESERVED (C3)
// ---------------------------------------------------------------------------

type UpcomingAppointmentRow = {
  publicToken: string;
  status: string;
  offeringDisplayName: string;
  slotStartsAt: Date;
};

function UpcomingAppointments({
  pet,
  upcomingAppointments,
}: {
  pet: Pet;
  upcomingAppointments: UpcomingAppointmentRow[];
}) {
  const sorted = [...upcomingAppointments].sort(
    (a, b) => new Date(a.slotStartsAt).getTime() - new Date(b.slotStartsAt).getTime(),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        Próximos turnos
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          No hay turnos próximos para {pet.name}.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((apt) => (
            <li
              key={`apt-${apt.publicToken}`}
              className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">
                    {apt.offeringDisplayName}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500">
                    {new Date(apt.slotStartsAt).toLocaleString("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                  turno
                </span>
              </div>
              <Link
                href={`/mis-turnos/${apt.publicToken}`}
                className="inline-block text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
              >
                Ver detalle →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail — shared label/value cell
// ---------------------------------------------------------------------------

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </dt>
      <dd className="text-neutral-900 dark:text-neutral-50">{value || "—"}</dd>
    </div>
  );
}
