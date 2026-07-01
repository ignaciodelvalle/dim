// ---------------------------------------------------------------------------
// PET PROFILE v2.1 — reorder + action-hub consolidation (Item 6, 2026-06-18)
// Spec: docs/superpowers/specs/2026-06-18-pet-profile-v21-reorder-and-action-consolidation-design.md
//
// Screen order (normal/active state, spec §3.1):
//   back-link → HERO (identity, ALWAYS first — D2) → <PetAlertStrip>
//   (single prioritized aviso strip BELOW the hero — D3) → vitals →
//   PetQuickActions → Tabs (Resumen · Libreta · Vacunas · Historial).
//
// Inside Resumen (left column): 01 Estado de salud → 02 Cuidados próximos →
//   03 Credenciales (PPP + service-dog cards, only if applicable — D4) → the
//   functional widgets → Logros LAST, only when present (D5).
//
// Avisos (rabies / transit / open-cases / pregnancy) no longer render as
// separate full-width banners above the hero. They are grouped into
// <PetAlertStrip> ordered by urgency (rabies urgent → transit warning →
// open-cases warning → pregnancy info). PPP + perro de servicio are permanent
// CREDENTIALS, not avisos, so they live as cards in Resumen section 03 — not
// in the strip.
//
// Action hubs collapsed (D7): /anotar is the single canonical capture surface.
// /eventos/nuevo (the duplicate catalog index) 308-redirects to /anotar; the
// profile has ONE annotate entry ("Registrar evento" in PetActionsMenu →
// /anotar). The /eventos/nuevo/* form SUB-routes are untouched.
//
// Preserved sections:
//   - <PetReminders>         (C3) — vaccine reminders with Registrar/Eliminar
//                                   actions; THE canonical reminder surface. The
//                                   old duplicate <PetVaccineReminders> (no
//                                   server-action wiring) was deleted in v2.1 (D6).
//   - <UpcomingAppointments> (C3) — confirmed vet appointments for this pet.
//   - <MedicationDosesSection> — pending medication doses with "Marcar dada" action.
//   - <PetOpenCasesSection>  (E) — open cases (now surfaced inside PetAlertStrip).
//   - <PregnancyInProgressCard> — conditional (now inside PetAlertStrip, info tone).
//   - <PpPCard>              — conditional PPP credential card (Resumen §03).
//   - <ServiceDogCredentialCard> — conditional service-dog card (Ley 26.858, Resumen §03).
//   - <AchievementsSection>  — pet achievements panel (rendered LAST in Resumen).
//   - <RabiesObservationBanner> — alert while rabies observation is active (strip, urgent).
//   - <TransitBanner>        — shelter_custody / transit notice (strip, warning).
//   - <DeceasedView>         — early return for deceased pets.
//   - <LostCockpit>          — early return for lost pets (keeps a "ver perfil
//                               completo" link back to this profile — D9).
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
import { fetchPendingReturnProposalForOwner } from "@/app/actions/return-to-owner";
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
import { ComplianceObligationsPanel } from "@/components/pet-profile/ComplianceObligationsPanel";
import { type PetAlert, PetAlertStrip } from "@/components/pet-profile/PetAlertStrip";
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
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSeal, LnSectionHead } from "@/components/ui/DocElements";
import { LnHero } from "@/components/ui/Hero";
import { LnMemorialChip } from "@/components/ui/StatusFlag";
import { LnVitals } from "@/components/ui/Vitals";
import {
  appointments,
  attachments,
  cases,
  db,
  organizations,
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
import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { getPhysicalTagInterest } from "@/lib/physical-tag-interest";
import { deriveComplianceState } from "@/lib/projections/pet-compliance";
import { eventAttachmentSignedUrl, eventAttachmentSignedUrls, petPhotoUrl } from "@/lib/storage";
import { markMedicationDoseTakenAction } from "@/src/modules/events/actions";
import { and, asc, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { EventTimeline } from "./EventTimeline";
import { LostCockpit } from "./LostCockpit";
import { PostCreateModal } from "./PostCreateModal";
import { SheetMounter } from "./SheetMounter";
import { ConvertFosterButton } from "./_components/ConvertFosterButton";
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

// ---------------------------------------------------------------------------
// LnMemorialTimeline — read-only timeline for the deceased memorial view
// ---------------------------------------------------------------------------

type MemorialEvent = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  attachmentUrl: string | null;
};

// Map event types to icon emoji and dot color for the memorial
function memorialEventStyle(eventType: string): { color: string; icon: string } {
  switch (eventType) {
    case "vaccination_administered":
      return { color: "var(--color-ln-azul)", icon: "💉" };
    case "weight_recorded":
      return { color: "var(--color-ln-celeste)", icon: "⚖️" };
    case "sterilization_performed":
      return { color: "var(--color-ln-rosa)", icon: "✂️" };
    case "microchip_implanted":
      return { color: "var(--color-ln-azul)", icon: "🔖" };
    case "vet_visit_logged":
      return { color: "var(--color-ln-ok)", icon: "🩺" };
    case "medication_started":
    case "medication_stopped":
      return { color: "var(--color-ln-violeta)", icon: "💊" };
    case "note_added":
      return { color: "var(--color-ln-memorial-note)", icon: "📝" };
    case "clinical_info_logged":
      return { color: "var(--color-ln-celeste)", icon: "📋" };
    case "death_recorded":
      return { color: "var(--color-ln-memorial)", icon: "🍃" };
    default:
      return { color: "var(--color-ln-mute)", icon: "·" };
  }
}

function LnMemorialTimeline({
  events,
  publicToken: _publicToken,
}: {
  events: MemorialEvent[];
  publicToken: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-ln-mute)" }}>
        Sin eventos registrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {events.map((ev, i) => {
        const { color, icon } = memorialEventStyle(ev.eventType);
        const date = ev.occurredAt instanceof Date ? ev.occurredAt : new Date(ev.occurredAt);
        const monthAbbr = date
          .toLocaleDateString("es-AR", { month: "short" })
          .toUpperCase()
          .replace(".", "");
        const year = date.getFullYear();
        const dateLabel = `${monthAbbr} ${year}`;
        const summary = eventPayloadSummarySimple(ev.eventType, ev.payload);
        const isDeathEvent = ev.eventType === "death_recorded";
        const isLast = i === events.length - 1;

        return (
          <div
            key={ev.id}
            className="grid"
            style={{ gridTemplateColumns: "88px 30px 1fr", gap: "0 0" }}
          >
            {/* Date column */}
            <div
              className="flex items-start justify-end pr-[14px] pt-[10px] font-[var(--font-ln-mono)] text-[11px] leading-[1.3] tracking-[.04em]"
              style={{ color: "var(--color-ln-mute)" }}
            >
              {dateLabel}
            </div>

            {/* Dot + vertical connector */}
            <div className="flex flex-col items-center">
              <div
                className="mt-[12px] flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-full border-2 text-[11px]"
                style={{
                  borderColor: color,
                  color: color,
                  background: "var(--color-ln-card)",
                }}
              >
                {icon}
              </div>
              {!isLast && (
                <div
                  className="w-px flex-1"
                  style={{
                    background: "var(--color-ln-line-2)",
                    minHeight: 20,
                  }}
                />
              )}
            </div>

            {/* Body */}
            <div className="pb-[18px] pl-[14px] pt-[10px]">
              <p
                className={[
                  "m-0 text-[13.5px] font-semibold leading-tight",
                  isDeathEvent ? "font-[var(--font-ln-serif)]" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ color: isDeathEvent ? "var(--color-ln-memorial)" : "var(--color-ln-ink)" }}
              >
                {summary.primary}
              </p>
              {summary.secondary && (
                <p className="mt-[2px] text-sm" style={{ color: "var(--color-ln-mute)" }}>
                  {summary.secondary}
                </p>
              )}
              {ev.notes && (
                <p className="mt-[3px] text-sm italic" style={{ color: "var(--color-ln-mute)" }}>
                  {ev.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Lightweight payload summary (avoids importing heavy lib/events in page.tsx path)
function eventPayloadSummarySimple(
  eventType: string,
  payload: unknown,
): { primary: string; secondary?: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (eventType) {
    case "vaccination_administered":
      return {
        primary: typeof p.vaccine_name === "string" ? `Vacuna · ${p.vaccine_name}` : "Vacunación",
        secondary: typeof p.vet_name === "string" ? p.vet_name : undefined,
      };
    case "weight_recorded":
      return {
        primary: typeof p.weight_kg === "number" ? `Peso · ${p.weight_kg} kg` : "Peso registrado",
      };
    case "sterilization_performed":
      return { primary: "Esterilización" };
    case "microchip_implanted":
      return {
        primary: "Microchip implantado",
        secondary: typeof p.chip_id === "string" ? p.chip_id : undefined,
      };
    case "vet_visit_logged":
      return { primary: "Visita al veterinario" };
    case "medication_started":
      return {
        primary: typeof p.drug_name === "string" ? `Medicación · ${p.drug_name}` : "Medicación",
      };
    case "medication_stopped":
      return {
        primary:
          typeof p.drug_name === "string" ? `Fin medicación · ${p.drug_name}` : "Fin de medicación",
      };
    case "note_added":
      return { primary: "Nota", secondary: typeof p.text === "string" ? p.text : undefined };
    case "death_recorded":
      return {
        primary: "Fallecimiento",
        secondary: typeof p.cause === "string" ? `Causa: ${p.cause}` : undefined,
      };
    default:
      return { primary: eventType };
  }
}

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
  // Derive birth and death years for the subtitle
  const birthYear = pet.dateOfBirth ? new Date(pet.dateOfBirth).getFullYear() : null;
  const deathYear = pet.deceasedAt ? new Date(pet.deceasedAt).getFullYear() : null;
  const subtitle =
    birthYear && deathYear ? `En memoria · ${birthYear} – ${deathYear}` : deceasedSubtitle(pet);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-ln-memorial-bg)", fontFamily: "var(--font-ln-sans)" }}
    >
      {/* Desaturated guilloché */}
      <div
        aria-hidden="true"
        className="h-[4px]"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
          filter: "grayscale(.5)",
          opacity: 0.5,
        }}
      />

      <div className="mx-auto max-w-2xl px-[24px] py-[28px] pb-[64px]">
        {/* Back link */}
        <Link
          href="/mis-mascotas"
          className="mb-[28px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
        >
          ← Mis mascotas
        </Link>

        {/* ---------------------------------------------------------------- */}
        {/* Memorial hero — centered                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-[36px] flex flex-col items-center gap-[14px] pt-[12px] text-center">
          {/* Photo: grayscale + sepia, opacity 0.82 */}
          <div
            className="relative overflow-hidden rounded-full border-2 border-[var(--color-ln-line-strong)]"
            style={{
              width: 150,
              height: 150,
              filter: "grayscale(1) sepia(.35)",
              opacity: 0.82,
            }}
          >
            {photoUrl ? (
              <Image src={photoUrl} alt={pet.name} fill sizes="150px" className="object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-[var(--font-ln-serif)] text-[56px] font-semibold text-[var(--color-ln-mute)]"
                style={{
                  background: "repeating-linear-gradient(135deg,#e7e2d6 0 6px,#f3f0e7 6px 12px)",
                }}
              >
                {pet.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Serif name 52px */}
          <h1
            className="m-0 font-[var(--font-ln-serif)] font-semibold leading-tight tracking-[-0.02em]"
            style={{ fontSize: 52, color: "var(--color-ln-memorial-ink)" }}
          >
            {pet.name}
          </h1>

          {/* Italic subtitle */}
          <p
            className="font-[var(--font-ln-serif)] font-medium"
            style={{ fontSize: 16, color: "var(--color-ln-memorial)", fontStyle: "italic" }}
          >
            {subtitle}
          </p>

          {/* Text links */}
          <p
            className="font-[var(--font-ln-sans)] text-[13px]"
            style={{ color: "var(--color-ln-mute)" }}
          >
            <Link
              href={`/mis-mascotas/${pet.publicToken}/editar`}
              className="text-[var(--color-ln-azul)] underline underline-offset-4 hover:text-[var(--color-ln-azul-700)]"
            >
              Editar mascota
            </Link>
            <span className="mx-[8px]" style={{ color: "var(--color-ln-memorial-faint)" }}>
              ·
            </span>
            <Link
              href={`/p/${pet.publicToken}`}
              target="_blank"
              rel="noopener"
              className="text-[var(--color-ln-azul)] underline underline-offset-4 hover:text-[var(--color-ln-azul-700)]"
            >
              Ver credencial pública
            </Link>
            <span className="mx-[8px]" style={{ color: "var(--color-ln-memorial-faint)" }}>
              ·
            </span>
            <Link
              href={`/mis-mascotas/${pet.publicToken}?sheet=nota`}
              className="text-[var(--color-ln-azul)] underline underline-offset-4 hover:text-[var(--color-ln-azul-700)]"
            >
              + Agregar nota
            </Link>
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Read-only libreta timeline                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[24px] py-[22px]">
          {/* Eyebrow + heading */}
          <p
            className="mb-[4px] font-[var(--font-ln-mono)] text-xs uppercase tracking-[.14em]"
            style={{ color: "var(--color-ln-mute)" }}
          >
            Libreta sanitaria
          </p>
          <h2
            className="m-0 mb-[6px] font-[var(--font-ln-serif)] text-[21px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--color-ln-memorial-ink)" }}
          >
            Historial
          </h2>
          <p className="mb-[20px] text-sm" style={{ color: "var(--color-ln-mute)" }}>
            Solo lectura. Los eventos registrados en vida se conservan.
          </p>

          {/* Memorial timeline */}
          <LnMemorialTimeline
            events={eventsWithAttachments.filter((e) => isLibretaSanitariaEvent(e.eventType))}
            publicToken={pet.publicToken}
          />
        </div>
      </div>
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
  const recienCreado = sp.recienCreado === "true";
  // D9: when lost, the cockpit is shown by default, but it is not a dead end —
  // the owner can open the normal profile via "ver perfil completo"
  // (?fromLost=1), which bypasses the lost early-return below so they can keep
  // logging events / viewing the libreta. Any tab=… param implies the same
  // intent (the owner is navigating the profile's tabs).
  const showFullProfileWhileLost = sp.fromLost === "1" || tabParam !== undefined;

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

  // Stage 1: photo + ownership role + service-dog + cases (all independent).
  // Photo query runs once; both photoUrl and editPhotoUrl are derived from it.
  // allCases: full row select (Case[] required by AchievementInput), capped at 50.
  const [[photoRow], [ownerRow], [serviceDogRow], allCases] = await Promise.all([
    pet.primaryPhotoId
      ? db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
      : (Promise.resolve([]) as Promise<(typeof attachments.$inferSelect)[]>),
    accessPath === "owner"
      ? db
          .select({ role: ownerships.role })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, pet.id),
              eq(ownerships.ownerUserId, user.id),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1)
      : (Promise.resolve([]) as Promise<{ role: string }[]>),
    db.select().from(petServiceDog).where(eq(petServiceDog.petId, pet.id)).limit(1),
    // Capped at 50, most recent first — the cap needs a deterministic order or
    // a pet with >50 cases would silently lose an arbitrary subset.
    db
      .select()
      .from(cases)
      .where(eq(cases.primaryPetId, pet.id))
      .orderBy(desc(cases.openedAt))
      .limit(50),
  ]);

  // Both photoUrl and editPhotoUrl come from the same single row.
  const photoUrl = petPhotoUrl(photoRow?.storagePath);
  const editPhotoUrl = photoUrl;

  // isTransit = true for users with an active foster ownership row.
  // Note: shelter_custody is an org-level role (ownerOrganizationId), not a
  // user-level role, so it cannot appear here via the ownerUserId path.
  let isTransit = false;
  let ownershipRole: string | null = null;
  if (accessPath === "owner") {
    isTransit = ownerRow?.role === "foster";
    ownershipRole = ownerRow?.role ?? null;
  }

  // Stage 2: queries that depend on ownershipRole or are owner-only.
  // hasPendingReturnProposal depends on ownershipRole (must be "owner").
  // viewerContacts and physicalTagInterest are owner-only but independent of each other.
  let hasPendingReturnProposal = false;
  let viewerContacts: {
    preferredVetName: string | null;
    preferredVetPhone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    displayName: string;
  } | null = null;
  let physicalTagInterest: Awaited<ReturnType<typeof getPhysicalTagInterest>> | null = null;

  if (accessPath === "owner") {
    // "Confirmar devolución": only the legal owner, only when a pending return
    // proposal exists. Reuses the same ARCH-B tri-check as /devolucion.
    const returnProposalQuery =
      ownershipRole === "owner"
        ? fetchPendingReturnProposalForOwner(pet.id, user.id)
        : Promise.resolve(false);

    // Emergency / vet contacts from the viewer's profile — J-followup columns (migration 0042).
    const contactsQuery = db
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

    // §4.20 physical-tag-interest — legal owner path only.
    const tagInterestQuery = getPhysicalTagInterest(pet.id, user.id);

    const [returnProposalResult, [profileRow], tagInterest] = await Promise.all([
      returnProposalQuery,
      contactsQuery,
      tagInterestQuery,
    ]);

    hasPendingReturnProposal = returnProposalResult;
    viewerContacts = profileRow ?? null;
    physicalTagInterest = tagInterest;
  }

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

    // Batch-sign all attachment paths in a single Storage round-trip instead
    // of N sequential createSignedUrl calls.
    const pathsToSign = deceasedAttachmentRows
      .filter((a) => a.eventId != null)
      .map((a) => a.storagePath);
    const deceasedUrlByPath = await eventAttachmentSignedUrls(supabase, pathsToSign);

    // Build event-id → signed-url map (one attachment per event).
    const deceasedUrlMap = new Map<string, string>();
    for (const a of deceasedAttachmentRows) {
      if (!a.eventId) continue;
      const url = deceasedUrlByPath.get(a.storagePath);
      if (url) deceasedUrlMap.set(a.eventId, url);
    }

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
  // D9: the cockpit is NOT a dead end. When the owner asks for the full profile
  // (showFullProfileWhileLost: ?fromLost=1 or a tab=… deep link), we fall
  // through to the normal profile so they can keep logging events / viewing the
  // libreta while the pet remains lost. Org-path viewers always see the cockpit.
  if (pet.status === "lost" && !(showFullProfileWhileLost && accessPath === "owner")) {
    // Fetch episode first so we can pass its caseId to the scan feed query.
    // This scopes sighting rows to the current episode and prevents cross-episode
    // pollution when a pet was lost→found→lost again.
    const episode = await fetchLostEpisodeForPet(pet.id);
    const rawScans = await fetchLostScanEvents(pet.id, undefined, episode?.id ?? undefined);

    // P0g: resolve signed URLs for sighting AND finder-in-possession items that
    // carry a photoStoragePath. event-attachments is a private bucket so
    // thumbnails need short-lived signed URLs. We use the SSR supabase client
    // (owner is authenticated at this point).
    const scans = await Promise.all(
      rawScans.map(async (item) => {
        if ((item.kind === "sighting" || item.kind === "finder") && item.photoStoragePath) {
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

  // Parallel data fetching: achievement views + all remaining queries run together.
  // viewsMap is independent of typedEvents result — it only needs pet.id + user.id.
  const [
    achievementViewRows,
    petActiveReminders,
    pendingMedicationReminders,
    upcomingAppointments,
    weightHistory,
    historialCount,
    canonicalIds,
    reservedRabiesTurnoRows,
  ] = await Promise.all([
    // Achievement views — pulse_until rows for the owner; empty for org-path viewers.
    accessPath === "owner"
      ? db
          .select({
            achievementId: petAchievementViews.achievementId,
            pulseUntil: petAchievementViews.pulseUntil,
          })
          .from(petAchievementViews)
          .where(
            and(eq(petAchievementViews.userId, user.id), eq(petAchievementViews.petId, pet.id)),
          )
      : Promise.resolve([] as { achievementId: string; pulseUntil: Date | null }[]),
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
    // Canonical chip/tattoo identifiers (ARCH-Q).
    fetchActiveIdentifications(pet.id),
    // WS-2: the pet's next confirmed rabies appointment (service_kind =
    // vaccination_rabies), if any — drives the "Turno reservado" compliance
    // state. Left-joins the provider (org or individual vet) for the label.
    db
      .select({
        slotStartsAt: timeSlots.startsAt,
        orgName: organizations.displayName,
        vetName: profiles.displayName,
      })
      .from(appointments)
      .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
      .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
      .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
      .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
      .where(
        and(
          eq(appointments.petId, pet.id),
          eq(appointments.status, "confirmed"),
          eq(serviceOfferings.serviceKind, "vaccination_rabies"),
          gt(timeSlots.startsAt, new Date()),
        ),
      )
      .orderBy(asc(timeSlots.startsAt))
      .limit(1),
  ]);

  // Build viewsMap from the co-fetched achievement view rows.
  const viewsMap: Map<string, Date | null> | undefined =
    accessPath === "owner"
      ? new Map(achievementViewRows.map((r) => [r.achievementId, r.pulseUntil]))
      : undefined;

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

  // Build LnHero data from pet fields.
  // pet.status is "active" here, EXCEPT when the owner opened the full profile
  // of a lost pet via ?fromLost=1 (D9) — the lost early-return is bypassed but
  // the pet is still lost, so reflect that honestly in the hero ring. Deceased
  // always early-returns above.
  const lnPetStatus: "ok" | "sick" | "lost" | "pregnant" = (() => {
    if (pet.status === "lost") return "lost";
    if (pet.pregnancyStatus === "in_progress") return "pregnant";
    return "ok";
  })();

  const heroTags: Array<{ key: string; label: string; variant?: "celeste" | "gray" }> = [];
  if (canonicalIds.microchip) heroTags.push({ key: "chip", label: "Microchip verificado" });
  if (pet.jurisdictionLocality)
    heroTags.push({ key: "loc", label: pet.jurisdictionLocality, variant: "gray" });

  const breedLine = [pet.breed, pet.sex ? sexLabel(pet.sex) : null, age, speciesLabel(pet.species)]
    .filter(Boolean)
    .join(" · ");

  // Vitals: weight delta from weightHistory[0] vs weightHistory[1]
  const latestWeight = weightHistory[weightHistory.length - 1];
  const prevWeight = weightHistory[weightHistory.length - 2];
  const weightDelta = latestWeight && prevWeight ? latestWeight.kg - prevWeight.kg : null;

  // Last visit: find latest vet_visit_logged or vaccination event from typedEvents
  const lastVisitEvent = typedEvents
    .filter((e) => e.eventType === "vet_visit_logged" || e.eventType === "vaccination_administered")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
  const lastVisitDate = lastVisitEvent
    ? new Date(lastVisitEvent.occurredAt).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
      })
    : "—";

  // Vaccine count from petActiveReminders
  const vaccineTotal = petActiveReminders.length;
  const vaccineUpToDate = petActiveReminders.filter(
    (r) => r.variant === "due_soon" || r.variant === "upcoming" || r.variant === "success",
  ).length;

  // Compliance projection (comply-first slice §2) — leads the Resumen tab.
  // Pure derivation over data already loaded above: no extra query. The rabies
  // obligation reads the antirrábica reminder's precomputed variant when present.
  const rabiesReminderRow = petActiveReminders.find((r) => /antirr[aá]b|rabi/i.test(r.title));
  const reservedTurnoRow = reservedRabiesTurnoRows[0];
  const complianceState = deriveComplianceState({
    now: new Date(),
    events: typedEvents,
    rabiesReminder: rabiesReminderRow
      ? { variant: rabiesReminderRow.variant, dueAt: rabiesReminderRow.dueAt }
      : null,
    reservedRabiesTurno: reservedTurnoRow
      ? {
          date: reservedTurnoRow.slotStartsAt,
          provider: reservedTurnoRow.orgName ?? reservedTurnoRow.vetName ?? null,
        }
      : null,
    microchipCode: canonicalIds.microchip?.code ?? null,
    pppApplies: Boolean(pet.potentiallyDangerousBreed),
  });

  return (
    <div
      className="mx-auto max-w-4xl pb-[48px] px-[16px] md:px-[32px]"
      style={{ fontFamily: "var(--font-ln-sans)" }}
    >
      {/* Back link */}
      <Link
        href={
          accessPath === "org" && organization
            ? `/org/${organization.publicToken}/mascotas`
            : "/mis-mascotas"
        }
        className="mb-[18px] mt-[16px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
        data-section="back-link"
      >
        ← {accessPath === "org" ? "Animales en custodia" : "Mis mascotas"}
      </Link>

      {/* Org-mediated access notice */}
      {accessPath === "org" && organization && (
        <div className="mb-[14px] rounded-[4px] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-[14px] py-[10px] text-[13px] text-[var(--color-ln-ink-2)]">
          Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
          Cualquier evento que registres queda atribuido a la organización.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LN Hero — identity ALWAYS first (v2.1, spec §3.1 / D2). No          */}
      {/* conditional banner precedes it.                                     */}
      {/* ------------------------------------------------------------------ */}
      <div data-section="hero">
        <LnHero
          name={pet.name}
          status={lnPetStatus}
          breed={breedLine}
          photoSrc={photoUrl ?? undefined}
          tags={heroTags}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PetAlertStrip — single prioritized aviso strip BELOW the hero       */}
      {/* (v2.1, spec §3.2 / D3). Rabies(urgent) → transit(warning) →         */}
      {/* open-cases(warning) → pregnancy(info). Empty → renders nothing.     */}
      {/* PPP + service-dog are NOT here — they are permanent credentials and */}
      {/* live inside Resumen (section 03).                                   */}
      {/* ------------------------------------------------------------------ */}
      <PetAlertStrip
        alerts={(() => {
          const alerts: PetAlert[] = [];
          if (pet.rabiesObservationStatus === "in_progress") {
            alerts.push({
              id: "rabies",
              tone: "urgent",
              node: <RabiesObservationBanner pet={pet} events={typedEvents} />,
            });
          }
          if (isTransit) {
            alerts.push({
              id: "transit",
              tone: "warning",
              node: <TransitBanner petName={pet.name} petPublicToken={pet.publicToken} />,
            });
          }
          // Only add the open-cases alert when the pet actually has open/escalated
          // cases, so the strip can be genuinely empty (D3). PetOpenCasesSection
          // self-hides when empty, but gating here keeps the strip from rendering
          // an empty wrapper. allCases is already fetched above (capped 50).
          if (allCases.some((c) => c.status === "open" || c.status === "escalated")) {
            alerts.push({
              id: "open-cases",
              tone: "warning",
              node: (
                <div data-section="cases">
                  <PetOpenCasesSection petId={pet.id} />
                </div>
              ),
            });
          }
          if (pregnancyCardData) {
            alerts.push({
              id: "pregnancy",
              tone: "info",
              node: (
                <PregnancyInProgressCard
                  petPublicToken={pet.publicToken}
                  pregnancyStartedAt={pregnancyCardData.startedAt}
                  weeksAtDiagnosis={pregnancyCardData.weeksAtDiagnosis}
                  expectedBirthAt={pregnancyCardData.expectedBirthAt}
                  lastClinicalAt={pregnancyCardData.lastClinicalAt}
                />
              ),
            });
          }
          return alerts;
        })()}
      />

      {/* ------------------------------------------------------------------ */}
      {/* LN Vitals strip                                                     */}
      {/* ------------------------------------------------------------------ */}
      <LnVitals
        className="mb-[20px]"
        cells={[
          {
            label: "Peso actual",
            value: latestWeight ? latestWeight.kg : "—",
            unit: latestWeight ? "kg" : undefined,
            meta:
              weightDelta !== null
                ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} vs anterior`
                : undefined,
          },
          {
            label: "Última visita",
            value: lastVisitDate,
          },
          {
            label: "Vacunas",
            value: vaccineTotal > 0 ? `${vaccineUpToDate}` : "—",
            unit: vaccineTotal > 0 ? `/ ${vaccineTotal} al día` : undefined,
          },
          {
            label: "Edad",
            value: age ?? "—",
          },
        ]}
      />

      {/* Quick-action buttons */}
      <PetQuickActions
        petPublicToken={pet.publicToken}
        petStatus={pet.status as "active" | "lost" | "deceased"}
        preferredVetPhone={viewerContacts?.preferredVetPhone ?? null}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Tabs + body                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Suspense
        fallback={<div className="h-12 rounded-[4px] bg-[var(--color-ln-stripe)] animate-pulse" />}
      >
        <PetDetailTabsPanel
          petPublicToken={pet.publicToken}
          historialCount={historialCount}
          initialTab={activeTab}
          isOwner={isOwner}
          resumenContent={
            <div className="grid gap-[24px] py-[20px] lg:grid-cols-[1fr_280px]">
              {/* LEFT: health status + note + functional widgets.
                    v2.1 order (spec §3.1): 01 Estado de salud → 02 Cuidados
                    próximos → 03 Credenciales (only if applicable) → … →
                    Logros (last, only when present). Achievements moved to the
                    end (D5); PPP/service-dog credentials moved here as cards
                    (D4) instead of full-width banners above the hero. */}
              <div className="flex flex-col gap-[20px]">
                {/* Compliance panel — LEADS the Resumen tab (comply-first slice
                      §2 / WS-1). The owner's legal obligations, each a projection
                      over events, above the health detail below. */}
                <div data-section="compliance-panel">
                  <ComplianceObligationsPanel
                    state={complianceState}
                    petPublicToken={pet.publicToken}
                  />
                </div>

                {/* Estado actual */}
                <LnSectionHead num="01" title="Estado de salud" />
                <div data-section="current-state">
                  <PetCurrentStateSection
                    pet={pet}
                    typedEvents={typedEvents}
                    petToken={pet.publicToken}
                    canonicalIds={{
                      microchip: canonicalIds.microchip
                        ? {
                            code: canonicalIds.microchip.code,
                            recordedAt: canonicalIds.microchip.recordedAt ?? null,
                          }
                        : null,
                      tattoo: canonicalIds.tattoo
                        ? {
                            code: canonicalIds.tattoo.code ?? "",
                            tattooLocation: canonicalIds.tattoo.tattooLocation ?? null,
                          }
                        : null,
                    }}
                  />
                </div>

                {/* Cuidados próximos */}
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

                {/* 03 Credenciales — PPP + perro de servicio as credential
                      cards (v2.1, spec §3.1 sec 03 / D4). Only rendered when at
                      least one applies. These used to be full-width banners
                      above the hero; they are permanent credentials, not
                      avisos, so they live here, not in the PetAlertStrip. */}
                {(pet.potentiallyDangerousBreed ||
                  (serviceDogRow?.credentialStatus === "vigente" && serviceDogRow.inService)) && (
                  <div data-section="credentials" className="flex flex-col gap-[14px]">
                    <LnSectionHead num="03" title="Credenciales" />
                    {pet.potentiallyDangerousBreed && (
                      <div data-section="ppp-card">
                        <PpPCard
                          petPublicToken={pet.publicToken}
                          breed={pet.breed}
                          events={typedEvents.map((e) => ({ ...e, attachmentUrl: null }))}
                          isTransit={isTransit}
                        />
                        {accessPath === "owner" &&
                          pet.jurisdictionProvince === "Ciudad Autónoma de Buenos Aires" && (
                            <PppExportCabaButton petPublicToken={pet.publicToken} />
                          )}
                      </div>
                    )}
                    {serviceDogRow &&
                      serviceDogRow.credentialStatus === "vigente" &&
                      serviceDogRow.inService && (
                        <div data-section="service-dog-card">
                          <ServiceDogCredentialCard
                            petPublicToken={pet.publicToken}
                            petName={pet.name}
                            microchipId={canonicalIds.microchip?.code ?? null}
                            serviceDog={serviceDogRow}
                            photoUrl={photoUrl}
                          />
                        </div>
                      )}
                  </div>
                )}

                {/* Health timeline */}
                <div data-section="health-timeline">
                  <PetHealthTimeline
                    recentFive={recentFive}
                    fullHistoryHref={`/mis-mascotas/${pet.publicToken}?tab=historial`}
                    signAttachments={signTimelineAttachmentsForPet.bind(null, pet.publicToken)}
                  />
                </div>

                {/* Actions menu */}
                <div data-section="actions-menu">
                  <PetActionsMenu
                    pet={{ species: pet.species, status: pet.status, publicToken: pet.publicToken }}
                    accessPath={accessPath === "org" ? "org" : "owner"}
                    ownershipRole={ownershipRole}
                    hasPendingReturnProposal={hasPendingReturnProposal}
                  />
                </div>

                {/* Emergency card */}
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

                {/* Medication doses */}
                <MedicationDosesSection
                  pet={pet}
                  reminders={pendingMedicationReminders}
                  sourceEvents={medicationSourceEvents}
                />

                {/* Weight sparkline */}
                <PetWeightChart samples={weightHistory} />

                {/* Link to libreta tab */}
                <Link
                  href={`/mis-mascotas/${pet.publicToken}?tab=libreta`}
                  className="block w-full rounded-[3px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] py-[11px] text-center font-[var(--font-ln-mono)] text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline transition-colors hover:bg-[var(--color-ln-line-2)]"
                >
                  Ver libreta completa →
                </Link>

                {/* Credential card */}
                <PetCredentialCard
                  publicToken={pet.publicToken}
                  qrUrl={`/p/${pet.publicToken}.png`}
                  publicHref={`/p/${pet.publicToken}`}
                  shareHref={`/mis-mascotas/${pet.publicToken}?sheet=compartir-libreta`}
                  medicalViewHref={`/mis-mascotas/${pet.publicToken}?sheet=mostrar-tier2`}
                />

                {/* Physical tag interest */}
                {physicalTagInterest ? (
                  <PhysicalTagInterestCard
                    petPublicToken={pet.publicToken}
                    petName={pet.name}
                    initialInterested={physicalTagInterest.interested}
                    initialRequestedAt={physicalTagInterest.requestedAt}
                  />
                ) : null}

                {/* Tracking placeholder — display-only until the pairing flow ships. */}
                <PetTrackingPlaceholder />

                {/* Travel docs */}
                <PetTravelDocs
                  uploadHref={`/mis-mascotas/${pet.publicToken}/editar?section=docs`}
                  docs={[]}
                />

                {/* Logros — LAST in Resumen, only when there is something to
                      show (v2.1, spec §3.1 / D5). Restores the original v2 plan
                      order; it used to render FIRST, above health status. */}
                {(earnedAchievements.length > 0 || credentialChips.length > 0) && (
                  <div data-section="achievements">
                    <AchievementsSection
                      earned={earnedAchievements}
                      credentials={credentialChips}
                    />
                  </div>
                )}
              </div>

              {/* RIGHT: Identificación + Sello card */}
              <div className="flex flex-col gap-[16px]">
                <LnCard>
                  <LnCardHead title="Identificación" />
                  <LnCardBody>
                    <div className="space-y-[10px] font-[var(--font-ln-mono)] text-sm leading-[1.9]">
                      {canonicalIds.microchip && (
                        <>
                          <p className="text-[var(--color-ln-mute)]">MICROCHIP</p>
                          <p className="mb-[6px] text-[var(--color-ln-ink)]">
                            {canonicalIds.microchip.code}
                          </p>
                        </>
                      )}
                      <p className="text-[var(--color-ln-mute)]">LIBRETA</p>
                      <p className="mb-[6px] text-[var(--color-ln-ink)]">
                        LIB-AR-{pet.publicToken.toUpperCase()}
                      </p>
                      {viewerContacts?.displayName && (
                        <>
                          <p className="text-[var(--color-ln-mute)]">TITULAR</p>
                          <p className="text-[var(--color-ln-ink)]">{viewerContacts.displayName}</p>
                        </>
                      )}
                    </div>
                  </LnCardBody>
                </LnCard>

                {/* Sello "Inscripción válida" */}
                <LnCard>
                  <div className="flex items-center gap-[14px] px-[16px] py-[14px]">
                    <LnSeal line1="Registro" line2="Nacional" size={52} />
                    <div>
                      <p className="font-[var(--font-ln-serif)] text-[13px] font-semibold text-[var(--color-ln-ink)]">
                        Inscripción válida
                      </p>
                      <p className="mt-[2px] text-[11.5px] text-[var(--color-ln-mute)]">
                        MiMAR · Registro Nacional de Mascotas
                      </p>
                    </div>
                  </div>
                </LnCard>
              </div>
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
        tier2PublicPermanent={pet.tier2PublicPermanent}
        markLostData={
          pet.status === "active"
            ? {
                discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
                disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
                discloseEmailWhenLost: pet.discloseEmailWhenLost,
                discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
                allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
                petHasMicrochip: canonicalIds.microchip !== null,
                petHasTattoo: canonicalIds.tattoo !== null,
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

      {/* Post-create modal — shown once after a successful new-pet create.
            Only rendered for the owner on an active pet; deceased + lost paths
            have early returns above and will never reach this point. */}
      {recienCreado && accessPath === "owner" && <PostCreateModal publicToken={pet.publicToken} />}
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
        <h2 className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink)]">
          Próximas dosis
        </h2>
        <Link
          href={`/mis-mascotas/${pet.publicToken}?sheet=medicacion`}
          className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          + Nueva medicación
        </Link>
      </div>
      {allReminders.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ln-mute)]">Sin dosis pendientes.</p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, group]) => (
            <div key={key} className="space-y-2">
              <p className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
                {group.drugName}
              </p>
              <ul className="space-y-2">
                {group.reminders.map((reminder) => {
                  const proximity = formatDoseProximity(reminder.dueAt);
                  const isOverdue = new Date(reminder.dueAt) < new Date();
                  return (
                    <li
                      key={reminder.id}
                      className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--color-ln-line)] px-[14px] py-[12px]"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                          {reminder.description ?? reminder.title}
                        </p>
                        <p
                          className={`mt-[2px] font-[var(--font-ln-mono)] text-[11px] ${
                            isOverdue ? "text-[var(--color-ln-err)]" : "text-[var(--color-ln-mute)]"
                          }`}
                        >
                          {proximity}
                        </p>
                      </div>
                      <form action={boundAction}>
                        <input type="hidden" name="reminderId" value={reminder.id} />
                        <button
                          type="submit"
                          className="flex-shrink-0 rounded-[4px] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-sm font-medium text-[var(--color-ln-azul)] transition-opacity hover:opacity-80"
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
    <section className="rounded-[4px] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-[16px] py-[14px] space-y-[10px]">
      <p className="font-semibold text-[13px] text-[var(--color-ln-warn)]">
        Observación antirrábica en curso
      </p>
      <p className="text-[13px] text-[var(--color-ln-warn)]">
        {biteDate
          ? `Por la mordedura del ${biteDate.toLocaleDateString("es-AR")}, `
          : "Por una mordedura reportada recientemente, "}
        {pet.name} está en observación obligatoria de 10 días.
        {observationUntil && ` Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}.`}
      </p>
      <p className="text-sm text-[var(--color-ln-warn)]">
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
            className="rounded-[4px] border border-[var(--color-ln-warn-100)] bg-white px-[12px] py-[6px] font-[var(--font-ln-sans)] text-[13px] font-medium text-[var(--color-ln-warn)] transition-opacity hover:opacity-80"
          >
            Confirmar fin de observación
          </button>
        </form>
      )}
    </section>
  );
}

function TransitBanner({
  petName,
  petPublicToken,
}: {
  petName: string;
  petPublicToken: string;
}) {
  return (
    <section className="rounded-[4px] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-[16px] py-[14px] space-y-[10px]">
      <p className="text-[13px] text-[var(--color-ln-warn)]">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      <div className="flex flex-wrap gap-[8px]">
        <ConvertFosterButton petPublicToken={petPublicToken} petName={petName} />
        <Link
          href={`/mis-mascotas/${petPublicToken}/buscar-hogar`}
          className="rounded-[4px] border border-[var(--color-ln-warn-100)] px-[10px] py-[5px] text-[13px] text-[var(--color-ln-warn)] no-underline hover:bg-white transition-colors"
        >
          Buscar nuevo hogar
        </Link>
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
      <h2 className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink)]">
        Próximos turnos
      </h2>
      {sorted.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ln-mute)]">
          No hay turnos próximos para {pet.name}.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((apt) => (
            <li
              key={`apt-${apt.publicToken}`}
              className="rounded-[4px] border border-[var(--color-ln-line)] px-[14px] py-[12px] space-y-[6px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-[var(--font-ln-serif)] text-md font-semibold text-[var(--color-ln-ink)]">
                    {apt.offeringDisplayName}
                  </p>
                  <p className="mt-[2px] font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
                    {new Date(apt.slotStartsAt).toLocaleString("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="flex-shrink-0 inline-flex items-center rounded-[2px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-ok)]">
                  turno
                </span>
              </div>
              <Link
                href={`/mis-turnos/${apt.publicToken}`}
                className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
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
      <dt className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
        {label}
      </dt>
      <dd className="mt-[2px] text-[13px] text-[var(--color-ln-ink-2)]">{value || "—"}</dd>
    </div>
  );
}
