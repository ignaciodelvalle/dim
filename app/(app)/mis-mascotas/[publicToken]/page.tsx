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
// TODO(spec-later): Travel docs — see docs/superpowers/plans/2026-05-27-spec-later-tracker.md#travel-docs.
//   The `pet_attachments` table / attachment kind decision is open; <PetTravelDocs>
//   renders an empty state until it lands.
//
// ---------------------------------------------------------------------------

import { markAchievementSeenAction } from "@/app/actions/achievement-views";
import { markMedicationDoseTakenAction } from "@/app/actions/events";
import { signTimelineAttachmentsForPet } from "@/app/actions/sign-timeline-attachments";
import { AchievementsSection } from "@/components/AchievementsSection";
import type { CredentialChip } from "@/components/AchievementsSection";
import type { PetState } from "@/components/EventCatcher";
import { PetActionsMenu } from "@/components/PetActionsMenu";
import { PetCurrentStateSection } from "@/components/PetCurrentStateSection";
import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import { PetUpcomingCareSection } from "@/components/PetUpcomingCareSection";
import { PpPCard } from "@/components/PpPCard";
import { PppExportCabaButton } from "@/components/PppExportCabaButton";
import { PregnancyInProgressCard } from "@/components/PregnancyInProgressCard";
import { ServiceDogCredentialCard } from "@/components/ServiceDogCredentialCard";
import { PetCredentialCard } from "@/components/pet-profile/PetCredentialCard";
import type { TabKey } from "@/components/pet-profile/PetDetailTabs";
import { PetDetailTabsPanel } from "@/components/pet-profile/PetDetailTabsPanel";
import { PetEmergencyCard } from "@/components/pet-profile/PetEmergencyCard";
import { PetHealthTimeline } from "@/components/pet-profile/PetHealthTimeline";
import { PetMarkLostFooterCta } from "@/components/pet-profile/PetMarkLostFooterCta";
import { type PetHeroPet, PetProfileHero } from "@/components/pet-profile/PetProfileHero";
import { PetQuickActions } from "@/components/pet-profile/PetQuickActions";
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
import { fetchLostEpisodeForPet, fetchLostScanEvents } from "@/lib/lost-mode";
import {
  fetchActiveRemindersForPet,
  fetchPetEventsForProfileV2,
  fetchPetWeightHistory,
} from "@/lib/owner-dashboard";
import { requirePetAccess } from "@/lib/pet-access";
import { getPhysicalTagInterest } from "@/lib/physical-tag-interest";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/storage";
import { and, asc, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventTimeline } from "./EventTimeline";
import { LostCockpit } from "./LostCockpit";
import { SheetMounter } from "./SheetMounter";
import { PetReminders } from "./_components/PetReminders";

// NOTE: eventsWithAttachments is fetched only when pet.status === 'deceased'
// (needed by DeceasedView). For active pets, fetchPetEventsForProfileV2 is
// used instead, which runs two targeted queries without attachment signing.

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
    <div className="max-w-2xl mx-auto pt-6 space-y-8">
      <Link
        href="/mis-mascotas"
        className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
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
          <div className="w-24 h-24 rounded-full bg-gob-surface-alt flex items-center justify-center text-3xl font-semibold text-gob-text-muted opacity-80">
            {pet.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">{pet.name}</h1>
          <p className="text-sm text-gob-text-muted">{deceasedSubtitle(pet)}</p>
        </div>

        <p className="text-sm text-gob-text-muted pt-1">
          <Link
            href={`/mis-mascotas/${pet.publicToken}/editar`}
            className="underline underline-offset-4 hover:text-gob-text-gray"
          >
            Editar mascota
          </Link>
          {" · "}
          <Link
            href={`/p/${pet.publicToken}`}
            target="_blank"
            rel="noopener"
            className="underline underline-offset-4 hover:text-gob-text-gray"
          >
            Ver credencial pública
          </Link>
          {" · "}
          <Link
            href={`/mis-mascotas/${pet.publicToken}?sheet=nota`}
            className="underline underline-offset-4 hover:text-gob-text-gray"
          >
            + Agregar nota
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-gob-text">Libreta sanitaria</h2>
        <EventTimeline
          events={eventsWithAttachments.filter((e) => isLibretaSanitariaEvent(e.eventType))}
          publicToken={pet.publicToken}
          chips={LIBRETA_FILTER_CHIPS}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { supabase, user, pet, accessPath, organization } = access;

  const isOwner = accessPath === "owner";

  // Clamp tab: org-path viewers can only see resumen/vacunas.
  const activeTab: TabKey = (() => {
    if (tabParam === "vacunas") return "vacunas";
    if (tabParam === "libreta") return isOwner ? "libreta" : "resumen";
    if (tabParam === "historial") return isOwner ? "historial" : "resumen";
    return "resumen";
  })();

  // Photo: separate small query indexed on primaryPhotoId, only if set.
  const [photo] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // Edit photo — same query, reused for the editar-mascota sheet.
  const [editPhotoRow] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];
  const editPhotoUrl = petPhotoUrl(editPhotoRow?.storagePath);

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
    displayName: string;
  } | null = null;
  if (accessPath === "owner") {
    const [profileRow] = await db
      .select({
        preferredVetName: profiles.preferredVetName,
        preferredVetPhone: profiles.preferredVetPhone,
        emergencyContactName: profiles.emergencyContactName,
        emergencyContactPhone: profiles.emergencyContactPhone,
        displayName: profiles.displayName,
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

  // EARLY RETURN for lost: show the lost cockpit instead of the normal sections.
  // Runs before the heavy fetchPetEventsForProfileV2 / weight / reminder queries
  // since those are irrelevant when the pet is lost.
  if (pet.status === "lost") {
    // Fetch episode first so we can pass its caseId to the scan feed query.
    // This scopes sighting rows to the current episode and prevents cross-episode
    // pollution when a pet was lost→found→lost again.
    const episode = await fetchLostEpisodeForPet(pet.id);
    const rawScans = await fetchLostScanEvents(pet.id, undefined, episode?.id ?? undefined);

    // P0g: resolve signed URLs for sighting items that have a photoStoragePath.
    // event-attachments is a private bucket so thumbnails need short-lived signed URLs.
    // We use the SSR supabase client (owner is authenticated at this point).
    const scans = await Promise.all(
      rawScans.map(async (item) => {
        if (item.kind === "sighting" && item.photoStoragePath) {
          const url = await eventAttachmentSignedUrl(supabase, item.photoStoragePath);
          return { ...item, photoUrl: url };
        }
        return item;
      }),
    );

    const heroPet = {
      name: pet.name,
      publicToken: pet.publicToken,
      photoUrl,
      species: speciesLabel(pet.species),
      breed: pet.breed,
      ageLabel: ageFromDateOfBirth(pet.dateOfBirth) ?? "—",
      weightLabel: pet.estimatedWeightKg ? `${pet.estimatedWeightKg} kg` : null,
      state: "urgent" as const,
      stateLabel: "Perdida",
      lostMode: true,
    };

    // Derive owner first name from displayName (first word only).
    const ownerFirstName = viewerContacts?.displayName
      ? (viewerContacts.displayName.split(" ")[0] ?? viewerContacts.displayName)
      : "el dueño";

    return (
      <LostCockpit
        pet={pet}
        petHeroProps={heroPet}
        photoUrl={photoUrl}
        episode={episode}
        scans={scans}
        ownerFirstName={ownerFirstName}
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
      .select({
        achievementId: petAchievementViews.achievementId,
        pulseUntil: petAchievementViews.pulseUntil,
      })
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
    const unseenIds = earnedAchievements.map((a) => a.id).filter((id) => !viewsMap?.has(id));
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
  if (serviceDogRow && serviceDogRow.credentialStatus === "vigente" && serviceDogRow.inService) {
    credentialChips.push({ kind: "service_dog", label: "Perro de servicio", icon: "🦮" });
  }

  // Parallel data fetching — all remaining queries.
  const [
    petActiveReminders,
    pendingMedicationReminders,
    upcomingAppointments,
    weightHistory,
    historialCount,
  ] = await Promise.all([
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
    // Historial event count — used by PetDetailTabs badge. Uses excludeSelfScansClause
    // for consistency with the historial page's own query.
    db
      .select({ value: count() })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
      .then((rows) => rows[0]?.value ?? 0),
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
    lostMode: false,
  };

  // Medication doses for MedicationDosesSection.
  // The section needs medication_started payloads to group by drug name.
  // We source them from typedEvents (medication_started is in the whitelist).
  const medicationSourceEvents = typedEvents
    .filter((e) => e.eventType === "medication_started")
    .map((e) => ({ ...e, attachmentUrl: null }));

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-12">
      {/* §4.9 (1) Back link */}
      <Link
        href={
          accessPath === "org" && organization
            ? `/org/${organization.publicToken}/mascotas`
            : "/mis-mascotas"
        }
        className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
        data-section="back-link"
      >
        ← {accessPath === "org" ? "Animales en custodia" : "Mis mascotas"}
      </Link>

      {/* Org-mediated access notice */}
      {accessPath === "org" && organization && (
        <div className="rounded border border-gob-info/30 bg-gob-info/10 px-3 py-2 text-sm text-gob-text">
          Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
          Cualquier evento que registres queda atribuido a la organización.
        </div>
      )}

      {isTransit && <TransitBanner petName={pet.name} />}

      {pet.rabiesObservationStatus === "in_progress" && (
        <RabiesObservationBanner pet={pet} events={typedEvents} />
      )}

      {/* §4.9 (2) Open cases section */}
      <div data-section="cases">
        <PetOpenCasesSection petId={pet.id} />
      </div>

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

      {/* §4.9 (3) PPP card — provincial export deferred. See
            docs/superpowers/plans/2026-05-27-spec-later-tracker.md#ppp-card. */}
      {pet.potentiallyDangerousBreed && (
        <div data-section="ppp-card">
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
        </div>
      )}

      {/* §4.9 (4) Service Dog credential card — issuance model deferred. See
            docs/superpowers/plans/2026-05-27-spec-later-tracker.md#service-dog-card. */}
      {serviceDogRow && serviceDogRow.credentialStatus === "vigente" && serviceDogRow.inService && (
        <div data-section="service-dog-card">
          <ServiceDogCredentialCard
            petPublicToken={pet.publicToken}
            petName={pet.name}
            microchipId={pet.microchipId}
            serviceDog={serviceDogRow}
            photoUrl={photoUrl}
          />
        </div>
      )}

      {/* §4.9 (5) Hero — identity header */}
      <div data-section="hero">
        <PetProfileHero pet={heroData} />
      </div>

      {/* Quick-action buttons (Modo perdido / Compartir QR / Llamar vet) */}
      <PetQuickActions
        petPublicToken={pet.publicToken}
        petStatus={pet.status as "active" | "lost" | "deceased"}
        preferredVetPhone={viewerContacts?.preferredVetPhone ?? null}
      />

      {/* In-page tabs — Resumen / Libreta / Vacunas / Historial.
            PetDetailTabsPanel is a client component; the resumen content is
            rendered server-side and passed as an RSC node (composition pattern).
            Suspense boundary is required because PetDetailTabsPanel uses
            useSearchParams() — Next 15 needs a boundary or it bails static rendering. */}
      <Suspense fallback={<div className="h-12 bg-gob-surface-alt rounded animate-pulse" />}>
        <PetDetailTabsPanel
          petPublicToken={pet.publicToken}
          historialCount={historialCount}
          initialTab={activeTab}
          isOwner={isOwner}
          resumenContent={
            <div className="space-y-4">
              {/* §4.9 (6) Achievements row + credentials */}
              <div data-section="achievements">
                <AchievementsSection earned={earnedAchievements} credentials={credentialChips} />
              </div>

              {/* §4.9 (7) Estado actual — new section with tattoo (R5) */}
              <div data-section="current-state">
                <PetCurrentStateSection pet={pet} typedEvents={typedEvents} />
              </div>

              {/* §4.9 (8) Cuidados próximos — consolidates reminders + appointments + meds */}
              <div data-section="upcoming-care">
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
              </div>

              {/* §4.9 (9) Health timeline — collapsed by default, lazy signing.
                  signTimelineAttachmentsForPet is bound to the pet's publicToken so
                  the client component receives a (eventIds) => Promise<…> signer
                  that satisfies the SignerFn type without server-only imports. */}
              <div data-section="health-timeline">
                <PetHealthTimeline
                  recentFive={recentFive}
                  fullHistoryHref={`/mis-mascotas/${pet.publicToken}?tab=historial`}
                  signAttachments={signTimelineAttachmentsForPet.bind(null, pet.publicToken)}
                />
              </div>

              {/* §4.9 (10) Actions menu — replaces inline action buttons */}
              <div data-section="actions-menu">
                <PetActionsMenu
                  pet={{ species: pet.species, status: pet.status, publicToken: pet.publicToken }}
                  accessPath={accessPath === "org" ? "org" : "owner"}
                  ownershipRole={ownershipRole}
                  hasPendingReturnProposal={false}
                />
              </div>

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
                  href={`/mis-mascotas/${pet.publicToken}?tab=libreta`}
                  className="block w-full text-center px-4 py-3 rounded-lg border border-gob-border text-sm font-medium text-gob-text-gray hover:bg-gob-surface-alt transition-colors"
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

              {/* v2 Travel docs — TODO(spec-later): wire from pet_attachments or
                  attachments with kind in ('passport','intl_cert') once the table
                  decision lands. See docs/superpowers/plans/2026-05-27-spec-later-tracker.md#travel-docs. */}
              <PetTravelDocs
                uploadHref={`/mis-mascotas/${pet.publicToken}/editar?section=docs`}
                docs={[]}
              />
            </div>
          }
        />
      </Suspense>

      {/* Quick-capture sheets — driven by ?sheet=<id> URL param.
            Renders nothing when the param is absent or unknown.
            Lives outside PetDetailTabsPanel so it's always mounted. */}
      <SheetMounter
        petToken={pet.publicToken}
        petName={pet.name}
        species={pet.species}
        petStatus={pet.status as "active" | "lost" | "deceased"}
        tier2PublicEnabledUntil={
          pet.tier2PublicEnabledUntil ? new Date(pet.tier2PublicEnabledUntil).toISOString() : null
        }
        markLostData={
          pet.status === "active"
            ? {
                discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
                disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
                discloseEmailWhenLost: pet.discloseEmailWhenLost,
                discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
                allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
                petHasMicrochip: !!pet.microchipId,
                petHasTattoo: !!pet.tattooCode,
                petColor: pet.color ?? null,
                petDistinguishingFeatures: pet.distinguishingFeatures ?? null,
                petJurisdictionProvince: pet.jurisdictionProvince ?? null,
                petJurisdictionLocality: pet.jurisdictionLocality ?? null,
              }
            : null
        }
        editPetData={{ existingPet: pet, existingPhotoUrl: editPhotoUrl }}
      />

      {/* Mobile-only sticky footer CTA — surfaces "Marcar como perdida" without
            making the owner dig into the Acciones panel. Hidden on desktop and
            for non-active pets. See components/pet-profile/PetMarkLostFooterCta.tsx. */}
      {accessPath === "owner" ? (
        <PetMarkLostFooterCta petPublicToken={pet.publicToken} petStatus={pet.status} />
      ) : null}
    </div>
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
        <h2 className="text-lg font-semibold tracking-tight text-gob-text">Próximas dosis</h2>
        <Link
          href={`/mis-mascotas/${pet.publicToken}?sheet=medicacion`}
          className="text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
        >
          + Nueva medicación
        </Link>
      </div>
      {allReminders.length === 0 ? (
        <p className="text-sm text-gob-text-muted">Sin dosis pendientes.</p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, group]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-gob-text-gray">{group.drugName}</p>
              <ul className="space-y-2">
                {group.reminders.map((reminder) => {
                  const proximity = formatDoseProximity(reminder.dueAt);
                  const isOverdue = new Date(reminder.dueAt) < new Date();
                  return (
                    <li
                      key={reminder.id}
                      className="border border-gob-border rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm text-gob-text">
                          {reminder.description ?? reminder.title}
                        </p>
                        <p
                          className={`text-xs font-medium ${
                            isOverdue ? "text-gob-danger" : "text-gob-text-muted"
                          }`}
                        >
                          {proximity}
                        </p>
                      </div>
                      <form action={boundAction}>
                        <input type="hidden" name="reminderId" value={reminder.id} />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-gob-primary text-white text-xs font-medium hover:bg-gob-primary/90 transition-colors shrink-0"
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
    <section className="rounded-xl border border-gob-warning/40 bg-gob-warning/10 p-4 space-y-3">
      <p className="font-medium text-gob-warning-text">Observación antirrábica en curso</p>
      <p className="text-sm text-gob-warning-text">
        {biteDate
          ? `Por la mordedura del ${biteDate.toLocaleDateString("es-AR")}, `
          : "Por una mordedura reportada recientemente, "}
        {pet.name} está en observación obligatoria de 10 días.
        {observationUntil && ` Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}.`}
      </p>
      <p className="text-xs text-gob-warning-text">
        Si {pet.name} muestra salivación excesiva, agresividad inusual, parálisis o cambios bruscos
        de comportamiento, consultá al veterinario de inmediato.
      </p>
      {periodClosed && (
        <form
          action={async () => {
            "use server";
            const { ownerCloseRabiesObservationAction } = await import(
              "@/src/modules/surveillance/actions"
            );
            await ownerCloseRabiesObservationAction(pet.publicToken);
          }}
        >
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-gob-warning text-white text-sm font-medium hover:bg-gob-warning/90 transition-colors"
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
    <section className="rounded-xl border border-gob-warning/30 bg-gob-warning/10 p-4 space-y-3">
      <p className="text-sm text-gob-warning-text">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-gob-warning/40 text-sm text-gob-warning-text opacity-60 cursor-not-allowed"
        >
          Convertir en mi mascota
        </button>
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-gob-warning/40 text-sm text-gob-warning-text opacity-60 cursor-not-allowed"
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
      <h2 className="text-lg font-semibold tracking-tight text-gob-text">Próximos turnos</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-gob-text-muted">No hay turnos próximos para {pet.name}.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((apt) => (
            <li
              key={`apt-${apt.publicToken}`}
              className="border border-gob-border rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-gob-text">{apt.offeringDisplayName}</p>
                  <p className="text-xs text-gob-text-muted">
                    {new Date(apt.slotStartsAt).toLocaleString("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gob-success/10 text-gob-success">
                  turno
                </span>
              </div>
              <Link
                href={`/mis-turnos/${apt.publicToken}`}
                className="inline-block text-xs text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
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
      <dt className="text-xs uppercase tracking-wider text-gob-text-muted">{label}</dt>
      <dd className="text-gob-text">{value || "—"}</dd>
    </div>
  );
}
