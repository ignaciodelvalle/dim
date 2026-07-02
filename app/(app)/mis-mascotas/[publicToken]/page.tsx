// ---------------------------------------------------------------------------
// PET PROFILE — "two-face" redesign (Credencial | Libreta), 2026-07-01
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
// AGENTS.md "Design rules" #5 documents the shipped block order.
//
// This RSC is now a thin data-fetch + assembly shell. The two faces
// themselves (and everything they render) live in dedicated components:
//   - CredentialFace (Face 1, server, eager)   — components/pet-profile/CredentialFace.tsx
//   - LibretaFace     (Face 2, client, deferred) — components/pet-profile/LibretaFace.tsx
//   - PetDetailTabsPanel — owns the tab switcher + Face 2's deferred fetch.
//
// Screen order (normal/active state, AGENTS.md rule 5):
//   back-link → org notice (org-path only) → PetDetailTabsPanel, whose
//   `credencialContent` (Face 1, eager) is: CredentialFace (identity +
//   compliance stamps + QR + owner-only Emergencia card + compact
//   ppp/service-dog rows) → <PetAlertStrip> (avisos, urgency-ordered,
//   LostCaseBlock leads it when the pet is lost) → a single action row led
//   by Anotar (Compartir · Marcar perdida/encontrada · ⋯ Más). The Libreta
//   face (deferred) is one future+past timeline with a role-scoped lens set
//   (owner: Todo/Vacunas; org: Vacunas/Oficial) — see LibretaFace.
//
// resolvePetFace (lib/domain/pet-face-nav.ts) is the single pure mapper for
// every legacy `?tab=` deep link (resumen/vacunas/historial/libreta) onto
// {face, lens}; the H1 compliance wiring at deriveComplianceState below is
// unchanged by the redesign.
//
// pet-document-redesign (2026-07-02, S2): the pet.status === 'lost' early
// return (LostCockpit, full-screen) was DELETED. The normal profile now
// ALWAYS renders — lost surfaces as <LostCaseBlock> at the top of
// PetAlertStrip, so Credencial/Libreta/action row/Anotar sheet stay usable
// while the pet is lost (spec REQ-5.1/REQ-5.2). The D9 `?fromLost=1` bypass
// is gone too (REQ-6.3 no-op redirect, see the top of this function).
//
// Preserved verbatim:
//   - <PetOpenCasesSection>, <PregnancyInProgressCard> — inside PetAlertStrip.
//   - <RabiesObservationBanner>, <TransitBanner> — page-local, inside PetAlertStrip.
//   - <DeceasedView> — early return for deceased pets.
//
// PPP/service-dog attestation state is read from `typedEvents`
// (PROFILE_V2_TYPED_EVENT_TYPES), which now includes `dangerous_breed_attested`
// (pet-document-redesign REQ-10.1) — both the compliance stamp (derivePpp)
// and the `ppp.attested` prop below read the same fixed whitelist.
// ---------------------------------------------------------------------------

import { fetchPendingReturnProposalForOwner } from "@/app/actions/return-to-owner";
import type { PetState } from "@/components/EventCatcher";
import { Icon } from "@/components/Icon";
import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import { PregnancyInProgressCard } from "@/components/PregnancyInProgressCard";
import { CredentialFace } from "@/components/pet-profile/CredentialFace";
import { LostCaseBlock } from "@/components/pet-profile/LostCaseBlock";
import { type PetAlert, PetAlertStrip } from "@/components/pet-profile/PetAlertStrip";
import { PetAnotarFooterCta } from "@/components/pet-profile/PetAnotarFooterCta";
import { PetDetailTabsPanel } from "@/components/pet-profile/PetDetailTabsPanel";
import {
  appointments,
  attachments,
  cases,
  db,
  organizations,
  ownerships,
  petEvents,
  petServiceDog,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import type { Pet } from "@/db";
import {
  fetchActiveRemindersForPet,
  fetchPetEventsForProfileV2,
} from "@/lib/analytics/owner-dashboard";
import { buildFromLostRedirectTarget, resolvePetFace } from "@/lib/domain/pet-face-nav";
import { excludeSelfScansClause } from "@/lib/events/events";
import { GENERIC_CASE_LIST_EXCLUDED_KINDS } from "@/lib/infra/case-queries";
import { isLibretaSanitariaEvent } from "@/lib/infra/libreta-sanitaria";
import { fetchLostEpisodeForPet, fetchLostScanEvents } from "@/lib/infra/lost-mode";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/infra/service-dog-labels";
import {
  eventAttachmentSignedUrl,
  eventAttachmentSignedUrls,
  petPhotoUrl,
} from "@/lib/infra/storage";
import { deriveComplianceState } from "@/lib/projections/pet-compliance";
import { ageFromDateOfBirth, formatDate, sexLabel, speciesLabel } from "@/lib/utils/format";
import { and, asc, desc, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import type { EventTimeline } from "./EventTimeline";
import { PostCreateModal } from "./PostCreateModal";
import { SheetMounter } from "./SheetMounter";
import { ConvertFosterButton } from "./_components/ConvertFosterButton";

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
  const lenteParam = typeof sp.lente === "string" ? sp.lente : undefined;
  const recienCreado = sp.recienCreado === "true";

  // REQ-6.3 (pet-document-redesign): the D9 `?fromLost=1` bypass has no
  // target anymore — LostCockpit is gone and the normal profile always
  // renders for lost pets (REQ-5.1). Redirect to the plain profile URL
  // (fromLost stripped, every other param preserved) so old deep links /
  // bookmarks don't retain a dead param or error.
  const fromLostRedirectTarget = buildFromLostRedirectTarget(publicToken, sp);
  if (fromLostRedirectTarget) {
    redirect(fromLostRedirectTarget);
  }

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { supabase, user, pet, accessPath, organization } = access;

  const isOwner = accessPath === "owner";

  // Two-face redesign (2026-07-01): resolvePetFace is the single pure mapper
  // for every legacy ?tab= deep link (see lib/domain/pet-face-nav.ts). Org
  // viewers get the same clamp behavior as before, now expressed as a lens
  // clamp (Libreta is reachable, `todo` is not) instead of hiding the face.
  const { face: activeFace, lens: activeLens } = resolvePetFace({
    tab: tabParam,
    lente: lenteParam,
    isOwner,
  });

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
    // Excludes HIDDEN_FROM_SUBJECT_CASE_KINDS (welfare_denuncia) and
    // lost_pet_episode — same predicate as findOpenCasesForPetWithCodes, so
    // the alert-strip trigger below (`allCases.some(open)`) never fires on a
    // case the owner isn't supposed to see, and lost stays single-rendering-
    // path (LostCaseBlock owns it) — pet-document-redesign REQ-1.1/1.4.
    db
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.primaryPetId, pet.id),
          notInArray(cases.caseKind, [...GENERIC_CASE_LIST_EXCLUDED_KINDS]),
        ),
      )
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
  let hasPendingReturnProposal = false;
  let viewerContacts: {
    preferredVetName: string | null;
    preferredVetPhone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    displayName: string;
  } | null = null;

  if (accessPath === "owner") {
    // "Confirmar devolución": only the legal owner, only when a pending return
    // proposal exists. Reuses the same ARCH-B tri-check as /devolucion.
    const returnProposalQuery =
      ownershipRole === "owner"
        ? fetchPendingReturnProposalForOwner(pet.id, user.id)
        : Promise.resolve(false);

    // Emergency / vet contacts from the viewer's profile — J-followup columns
    // (migration 0042). Only displayName feeds Face 1 (titular); the rest is
    // fetched for parity with the pre-redesign query shape.
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

    const [returnProposalResult, [profileRow]] = await Promise.all([
      returnProposalQuery,
      contactsQuery,
    ]);

    hasPendingReturnProposal = returnProposalResult;
    viewerContacts = profileRow ?? null;
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

  // Lost-episode + scans fetch — relocated out of the old early-return into
  // the mainline (pet-document-redesign REQ-5.1/ADR-7): runs unconditionally
  // when `status === 'lost'`, for BOTH owner and org viewers, since the
  // normal profile now always renders and LostCaseBlock (rendered below, in
  // the alert strip) needs this data for both roles — org gets the
  // read-only variant, not a separate cockpit.
  let lostEpisode: Awaited<ReturnType<typeof fetchLostEpisodeForPet>> = null;
  let lostScans: Awaited<ReturnType<typeof fetchLostScanEvents>> = [];
  if (pet.status === "lost") {
    // Fetch episode first so we can pass its caseId to the scan feed query.
    // This scopes sighting rows to the current episode and prevents cross-episode
    // pollution when a pet was lost→found→lost again.
    lostEpisode = await fetchLostEpisodeForPet(pet.id);
    const rawScans = await fetchLostScanEvents(pet.id, undefined, lostEpisode?.id ?? undefined);

    // P0g: resolve signed URLs for sighting AND finder-in-possession items that
    // carry a photoStoragePath. event-attachments is a private bucket so
    // thumbnails need short-lived signed URLs. We use the SSR supabase client
    // (owner is authenticated at this point; org viewers reach here too and
    // share the same signed-URL resolution).
    lostScans = await Promise.all(
      rawScans.map(async (item) => {
        if ((item.kind === "sighting" || item.kind === "finder") && item.photoStoragePath) {
          const url = await eventAttachmentSignedUrl(supabase, item.photoStoragePath);
          return { ...item, photoUrl: url };
        }
        return item;
      }),
    );
  }

  // Derive owner first name from displayName (first word only) — feeds
  // LostCaseBlock's disclosure preview copy for owner viewers only.
  const ownerFirstName = viewerContacts?.displayName
    ? (viewerContacts.displayName.split(" ")[0] ?? viewerContacts.displayName)
    : "el dueño";

  // v2 targeted queries — replaces the old O(N) events + attachment signing.
  const { typedEvents } = await fetchPetEventsForProfileV2(pet.id);

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

  // Remaining parallel queries feeding the compliance projection + hero tags.
  // Achievements, medication doses, upcoming appointments, and weight history
  // moved out of Face 1 entirely (design.md deletion list) — Face 2 re-queries
  // its own future/weight sources inside getLibretaFaceData when it activates.
  const [petActiveReminders, canonicalIds, reservedRabiesTurnoRows] = await Promise.all([
    // Vaccine reminders for owner path only.
    accessPath === "owner"
      ? fetchActiveRemindersForPet(user.id, pet.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchActiveRemindersForPet>>),
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

  const age = ageFromDateOfBirth(pet.dateOfBirth);

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

  // Compliance projection (comply-first slice §2) — leads Face 1's stamp row.
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

  // QR for the credential's Face 1 — same absolute-URL + inline-SVG pattern
  // as /mis-mascotas/nueva/[publicToken]/credencial and /cartel (no separate
  // image route; the previous `/p/{token}.png` route never existed).
  const siteBaseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.ar";
  const credentialQrSvg = await QRCode.toString(`${siteBaseUrl}/p/${pet.publicToken}`, {
    type: "svg",
    margin: 1,
    width: 64,
    errorCorrectionLevel: "M",
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
      {/* Two-face tabs: Credencial (eager) · Libreta (deferred). Face 1     */}
      {/* owns identity/credential + avisos + capture, per the new AGENTS.md */}
      {/* rule 5 block order (design.md ADR-1/ADR-6).                        */}
      {/* ------------------------------------------------------------------ */}
      <Suspense
        fallback={<div className="h-12 rounded-[4px] bg-[var(--color-ln-stripe)] animate-pulse" />}
      >
        <PetDetailTabsPanel
          petPublicToken={pet.publicToken}
          initialFace={activeFace}
          initialLens={activeLens}
          isOwner={isOwner}
          credencialContent={
            <div className="flex flex-col gap-4 py-5">
              {/* 1. Credencial first — identity ALWAYS first. No conditional
                    banner precedes it. H1 provenance gates the stamp row. */}
              <div data-section="hero">
                <CredentialFace
                  heroProps={{
                    name: pet.name,
                    status: lnPetStatus,
                    breed: breedLine,
                    photoSrc: photoUrl ?? undefined,
                    tags: heroTags,
                  }}
                  complianceState={complianceState}
                  qrSvg={credentialQrSvg}
                  publicHref={`/p/${pet.publicToken}`}
                  ppp={
                    pet.potentiallyDangerousBreed
                      ? {
                          attested: typedEvents.some(
                            (e) => e.eventType === "dangerous_breed_attested",
                          ),
                          registerHref: `/mis-mascotas/${pet.publicToken}/eventos/atestar-raza-peligrosa`,
                        }
                      : null
                  }
                  serviceDog={
                    serviceDogRow &&
                    serviceDogRow.credentialStatus === "vigente" &&
                    serviceDogRow.inService
                      ? {
                          serviceTypeLabel:
                            SERVICE_TYPE_LABELS[serviceDogRow.serviceType] ??
                            serviceDogRow.serviceType,
                          manageHref: `/mis-mascotas/${pet.publicToken}/asistencia`,
                          presentHref: buildPresentarHref(pet.publicToken),
                        }
                      : null
                  }
                  emergencyContacts={
                    isOwner
                      ? {
                          preferredVetPhone: viewerContacts?.preferredVetPhone ?? null,
                          emergencyContactName: viewerContacts?.emergencyContactName ?? null,
                          emergencyContactPhone: viewerContacts?.emergencyContactPhone ?? null,
                        }
                      : null
                  }
                  petPublicToken={pet.publicToken}
                />
              </div>

              {/* 2. Avisos — single prioritized strip BELOW the credential.
                    Rabies(urgent) → transit(warning) → open-cases(warning) →
                    pregnancy(info). Empty → renders nothing. */}
              <PetAlertStrip
                alerts={(() => {
                  const alerts: PetAlert[] = [];
                  // Lost — leads the strip (design ADR-6/ADR-7). Pushed first
                  // so same-tone (urgent) stability keeps it above rabies.
                  // LostCaseBlock itself guards on `episode` being non-null,
                  // so this stays safe even if status flips mid-render.
                  if (pet.status === "lost") {
                    alerts.push({
                      id: "lost",
                      tone: "urgent",
                      node: (
                        <LostCaseBlock
                          pet={pet}
                          photoUrl={photoUrl}
                          episode={lostEpisode}
                          scans={lostScans}
                          ownerFirstName={ownerFirstName}
                          isOwner={isOwner}
                        />
                      ),
                    });
                  }
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
                  // Only add the open-cases alert when the pet actually has
                  // open/escalated cases, so the strip can be genuinely empty.
                  // allCases is already fetched above (capped 50).
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

              {/* 3. Capture, then the two faces — Anotar leads a single row
                    of quiet actions (owner-only actions render nothing for
                    org viewers, who get no capture control anywhere on the
                    page). Mark-lost stays always visible here (T2), never
                    buried in ⋯ Más. */}
              <div data-section="action-row" className="flex flex-wrap gap-2">
                {isOwner && (
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}?sheet=anotar`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--color-ln-azul)] px-4 text-sm font-semibold text-white no-underline transition-colors hover:bg-ln-azul-700"
                  >
                    <Icon name="edit" size="sm" decorative />
                    Anotar
                  </Link>
                )}
                <Link
                  href={`/mis-mascotas/${pet.publicToken}?sheet=compartir`}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-[3px] border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-4 text-sm font-semibold text-[var(--color-ln-azul)] no-underline transition-colors hover:border-[var(--color-ln-line-strong)]"
                >
                  <Icon name="share" size="sm" decorative />
                  Compartir
                </Link>
                {pet.status === "active" && (
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}?sheet=marcar-perdida`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-[3px] border-ln-err bg-transparent px-4 text-sm font-semibold text-ln-err no-underline transition-colors hover:bg-ln-err hover:text-white"
                  >
                    <Icon name="alert-triangle" size="sm" decorative />
                    Marcar como perdida
                  </Link>
                )}
                {pet.status === "lost" && (
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}?sheet=marcar-encontrada`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-ln-ok px-4 text-sm font-semibold text-white no-underline transition-colors hover:opacity-90"
                  >
                    <Icon name="check" size="sm" decorative />
                    Marcar encontrada
                  </Link>
                )}
                {isOwner && (
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}?sheet=mas`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-[3px] border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-4 text-sm font-semibold text-[var(--color-ln-azul)] no-underline transition-colors hover:border-[var(--color-ln-line-strong)]"
                  >
                    <Icon name="ellipsis" size="sm" decorative />
                    Más
                  </Link>
                )}
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
        accessPath={accessPath === "org" ? "org" : "owner"}
        ownershipRole={ownershipRole}
        hasPendingReturnProposal={hasPendingReturnProposal}
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

      {/* Sticky Anotar (mobile) — repurposed from the old mark-lost slot
            (design ADR-9); mark-lost is now always visible in the action row
            above. See components/pet-profile/PetAnotarFooterCta.tsx. */}
      <PetAnotarFooterCta
        petPublicToken={pet.publicToken}
        petStatus={pet.status}
        isOwner={isOwner}
      />

      {/* Post-create modal — shown once after a successful new-pet create.
            Only rendered for the owner on an active pet; deceased + lost paths
            have early returns above and will never reach this point. */}
      {recienCreado && accessPath === "owner" && <PostCreateModal publicToken={pet.publicToken} />}
    </div>
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
