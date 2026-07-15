// Owner home — Libreta Nacional redesign (leaned, task #34).
//
// Layout: greeting (serif h1 + date mono right) → RemindersSection (the ONE
// reminder surface — actionable: Posponer/Agendar/Registrar) → capture block
// (EventCatcher restyled as "Asentar un hecho" card) → 2-col grid:
//   left:  Estado sanitario — the ONE per-pet surface (status + nudges)
//   right: stacked cards — Próximos turnos, Casos abiertos
//
// Leaned on PO request: the "01 Mis mascotas" registry duplicated the top-nav
// destination /mis-mascotas and listed every pet the health strip already
// shows; the read-only "Vencimientos" card rendered the same reminders array
// RemindersSection already renders with actions. One pet list, one reminder
// surface. The strip's nudges never duplicate reminders (C3 dedup,
// lib/infra/owner-nudges.ts).
//
// Data fetching, server actions, routes, and EventCatcher behavior unchanged.
// Auth + role gates enforced by (app)/layout.tsx.

import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { EventCatcher, type EventCatcherPet, type PetState } from "@/components/EventCatcher";
import { LnButton } from "@/components/ui/Button";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type { LnPetStatus } from "@/components/ui/Chip";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { approvalRequests, db } from "@/db";
import type { DashboardPet } from "@/lib/analytics/owner-dashboard";
import {
  countPendingApplications,
  countPendingTransfers,
  fetchActiveReminders,
  fetchComplianceStatesForPets,
  fetchOpenWorkflows,
  fetchPetsForOwner,
  fetchUpcomingAppointments,
  fetchVaccinationSummariesForPets,
} from "@/lib/analytics/owner-dashboard";
import { hasAnyVaccineRecord } from "@/lib/domain/libreta-health-status";
import { deriveOwnerFirstRunState } from "@/lib/domain/owner-first-run";
import { countProximosReminders } from "@/lib/domain/vaccine-reminder-state";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { fetchPetHealthNudges } from "@/lib/infra/owner-nudges";
import { getProfileCached } from "@/lib/infra/request-cache";
import { petPhotoUrl } from "@/lib/infra/storage";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";
import { BRANDING } from "@/lib/ui/branding";
import { AR_TIME_ZONE } from "@/lib/utils/format";
import { capCount } from "@/lib/utils/format";
import { greetingFirstName } from "@/lib/utils/greeting";
import type { CredCardData } from "./_components/CredCard";
import { CredentialRail } from "./_components/CredentialRail";
import { FirstRunEmptyState } from "./_components/FirstRunEmptyState";
import { IntentApplyBanner } from "./_components/IntentApplyBanner";
import { OpenCyclesSection } from "./_components/OpenCyclesSection";
import type { PetComplianceSummary } from "./_components/PetHealthStatusStrip";
import { PetHealthStatusStrip } from "./_components/PetHealthStatusStrip";
import { RemindersSection } from "./_components/RemindersSection";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Adapters: DB row shapes → presentational props
// ---------------------------------------------------------------------------

function petStateFromDashboard(p: DashboardPet): PetState {
  if (p.status === "lost") return "urgent";
  return "ok";
}

function adaptPet(p: DashboardPet): EventCatcherPet {
  return {
    id: p.id,
    name: p.name,
    publicToken: p.publicToken,
    photoUrl: p.primaryPhotoStoragePath ? petPhotoUrl(p.primaryPhotoStoragePath) : null,
    status: (p.status === "active" || p.status === "lost" || p.status === "deceased"
      ? p.status
      : "active") as EventCatcherPet["status"],
    state: petStateFromDashboard(p),
  };
}

// WORKFLOW_KIND_ICON + adaptWorkflow live in components/CasesWidget.tsx
// (shared by /inicio and /cuenta/casos).

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InicioPage() {
  const { user } = await requireUserOrRedirect();

  // Email drives the email-branch of countPendingTransfers (a transfer can be
  // addressed to a not-yet-registered recipient by email). Optional on the
  // narrowed session type and absent under test mocks — tolerate undefined.
  const ownerEmail = (user.email ?? "").toLowerCase();

  // getProfileCached is warmed by (app)/layout.tsx in the same render pass —
  // this is a memoized hit, not an extra DB round-trip.
  const [
    profileRow,
    petsResult,
    openWf,
    appointments,
    reminders,
    healthStatus,
    pendingApplications,
    pendingTransfers,
  ] = await Promise.all([
    getProfileCached(user.id),
    // fetchPetsForOwner is bounded (DASHBOARD_PETS_LIMIT = 50); rows feed the
    // EventCatcher pet chips only — the per-pet surface is healthStatus.
    fetchPetsForOwner(user.id),
    fetchOpenWorkflows(user.id),
    fetchUpcomingAppointments(user.id, 5),
    fetchActiveReminders(user.id),
    // Item 5 — per-pet health-status nudges, derived from the owner's own
    // events/reminders only (no surveillance/authority data).
    fetchPetHealthNudges(user.id),
    // Task #19 (Lens 3): the owner's open cycles — pending adoption
    // applications and incoming transfers. Both carried a badge only on the
    // secondary /mis-mascotas page; surface them on the default landing too.
    countPendingApplications(user.id),
    countPendingTransfers(user.id, ownerEmail),
  ]);

  const { pets } = petsResult;

  // Task #19 (Lens 1): first-run detection. A zero-pet owner used to see a
  // reassuring "Todo en orden" over a dead capture card; instead we lead with
  // "Cargá tu primera mascota". `firstRunState` is null once the owner has any
  // manageable (non-deceased) pet.
  const firstRunState = deriveOwnerFirstRunState(pets);
  const hasManageablePets = firstRunState === null;

  // In-flight vet-upgrade indicator (task #17): a user who submitted a matrícula
  // upgrade request otherwise sees zero sign of it on /inicio — the status lived
  // only in two buried /cuenta subpages. One bounded, indexed lookup (limit 1)
  // for their latest request; the band renders only while it is pending.
  const [latestVetRequest] = await db
    .select({ status: approvalRequests.status })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.applicantUserId, user.id),
        eq(approvalRequests.type, "role_upgrade_vet"),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);
  const vetUpgradePending = latestVetRequest?.status === "pending";

  // Compliance projection — the SAME source the pet profile and /mis-mascotas
  // read (deriveComplianceState). The strip renders the AL DÍA / REGISTRADA
  // chip from this so /inicio and the profile can never disagree about
  // whether a pet is compliant (UX gate M5b).
  //
  // Fetched over the UNION of the health-nudges pet ids (fetchPetHealthNudges
  // — owner-role only, lib/infra/owner-nudges.ts) and the carousel's full pet
  // set (fetchPetsForOwner — no role filter, includes transit/foster pets).
  // Without the union, a transit-role pet had no entry in complianceByPet, so
  // the carousel's carouselStatusOf() fell back to the raw "registered"
  // placeholder even when the pet's REAL compliance was "ok" — while
  // /mis-mascotas (which computes compliance over every active pet) showed
  // the true AL DÍA status for the SAME pet (review canon-C2, task #9
  // follow-up). Unioning here means the "registered" fallback is now reached
  // only for a pet with genuinely no compliance data.
  const complianceByPet = new Map<string, PetComplianceSummary>();
  const healthPetIds = healthStatus.map((h) => h.petId);
  const carouselPetIds = pets.filter((p) => p.status !== "deceased").map((p) => p.id);
  const compliancePetIds = Array.from(new Set([...healthPetIds, ...carouselPetIds]));
  if (compliancePetIds.length > 0) {
    const complianceStates = await fetchComplianceStatesForPets(user.id, compliancePetIds);
    const petMetaById = new Map(pets.map((p) => [p.id, p]));
    for (const petId of compliancePetIds) {
      const c = complianceStates.get(petId);
      if (!c) continue;
      const meta = petMetaById.get(petId);
      complianceByPet.set(petId, {
        status: lnPetStatusFromCompliance(
          { status: meta?.status ?? "active", pregnancyStatus: meta?.pregnancyStatus ?? null },
          c,
        ),
        ok: c.summary.ok,
        total: c.summary.total,
      });
    }
  }

  // Deactivated profiles greet generically — parity with the pre-cache query,
  // which filtered deactivated_at IS NULL.
  const firstName =
    profileRow && profileRow.deactivatedAt === null
      ? greetingFirstName(profileRow.displayName)
      : "amigo";

  const eventCatcherPets = pets.map(adaptPet);
  const cases = openWf.map(adaptWorkflow);

  // -------------------------------------------------------------------------
  // Credential carousel (task #9) — per-pet cards, most-urgent first, capped.
  // Status comes from the SAME single mapper the profile + /mis-mascotas read
  // (lnPetStatusFromCompliance, already stored in complianceByPet — including
  // transit/foster pets, see the compliancePetIds union above). The raw-status
  // fallback below now only fires for a pet with genuinely no compliance data.
  // -------------------------------------------------------------------------
  const OWNER_CAROUSEL_CAP = 8;
  const carouselSource = pets.filter((p) => p.status !== "deceased");
  const carouselStatusOf = (p: DashboardPet): LnPetStatus =>
    complianceByPet.get(p.id)?.status ??
    (p.status === "lost"
      ? "lost"
      : p.pregnancyStatus === "in_progress"
        ? "pregnant"
        : "registered");
  const carouselPets = [...carouselSource]
    .sort((a, b) => credRank(carouselStatusOf(a)) - credRank(carouselStatusOf(b)))
    .slice(0, OWNER_CAROUSEL_CAP);

  // Vaccine-vigencia summaries only for the non-lost cards that render them
  // (lost cards show a reassurance line instead). One bounded query (≤ cap pets).
  const vacByPet = await fetchVaccinationSummariesForPets(
    carouselPets
      .filter((p) => carouselStatusOf(p) !== "lost")
      .map((p) => ({ petId: p.id, species: p.species })),
  );

  const credCards: CredCardData[] = carouselPets.map((p) => {
    const status = carouselStatusOf(p);
    const photoUrl = p.primaryPhotoStoragePath ? petPhotoUrl(p.primaryPhotoStoragePath) : null;
    if (status === "lost") {
      return {
        token: p.publicToken,
        name: p.name,
        photoUrl,
        status,
        credentialId: p.publicToken,
        vac: null,
        lost: {
          line: `${p.name} está reportada como perdida. Su credencial pública está activa para quien la encuentre.`,
        },
      };
    }
    const summary = vacByPet.get(p.id);
    return {
      token: p.publicToken,
      name: p.name,
      photoUrl,
      status,
      credentialId: p.publicToken,
      vac: summary
        ? {
            vigente: summary.active,
            porVencer: summary.dueSoon,
            vencida: summary.expired,
            hasRecords: hasAnyVaccineRecord(summary),
          }
        : null,
      lost: null,
    };
  });

  // "Vencimientos próximos" counts only reminders due within the horizon (plus
  // overdue) — a dose due in ~1 year is NOT "próximo" and must not inflate the
  // greeting's urgency count (#45, PO QA §2). The full list (RemindersSection)
  // still renders every active reminder, near and far.
  const proximosCount = countProximosReminders(reminders);

  // Compliance summary derived from the SAME source the health strip's
  // "N de M al día" label reads (complianceByPet / deriveComplianceState) —
  // NOT a new projection. The greeting previously derived "Todo en orden" only
  // from proximosCount + open cases, ignoring compliance entirely: a pet fully
  // registered but with vaccine slots not yet up to date (no near-term active
  // reminder) yields proximosCount=0, so the greeting read "Todo en orden"
  // while the strip showed "0 de N al día" — a direct contradiction. Matching
  // the strip's exact computation (pets whose compliance status is "ok", over
  // the total pets the strip renders) keeps the two honest.
  const petsTracked = healthStatus.length;
  const alDiaCount = healthStatus.filter(
    (h) => complianceByPet.get(h.petId)?.status === "ok",
  ).length;
  const compliancePending = petsTracked - alDiaCount;

  // Today's date for the greeting datestamp
  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-7 pb-12 md:px-8">
      {/* ------------------------------------------------------------------ */}
      {/* Greeting                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Buen día, {firstName}.
          </h1>
          {proximosCount > 0 || cases.length > 0 ? (
            // UX 3.5 item 6: cap large aggregate counts at "99+" so the greeting
            // does not read as alarming personal debt for high-volume owners.
            // "requieren atención" is also softened to "con novedades".
            <p className="mt-1.5 text-md text-[var(--color-ln-ink-2)]">
              {proximosCount > 0 && (
                <>
                  Tenés{" "}
                  <strong>
                    {capCount(proximosCount)} vencimiento
                    {proximosCount !== 1 ? "s" : ""} próximo
                    {proximosCount !== 1 ? "s" : ""}
                  </strong>
                  {cases.length > 0 ? " y " : "."}
                </>
              )}
              {cases.length > 0 && (
                <>
                  {cases.length === 1
                    ? "un caso abierto"
                    : `${capCount(cases.length)} casos abiertos`}{" "}
                  con novedades.
                </>
              )}
            </p>
          ) : !hasManageablePets ? (
            // Task #19 (Lens 1): a zero-pet owner must NOT read "Todo en orden"
            // (reassurance over an empty libreta). Say the true state; the
            // FirstRunEmptyState below carries the directing CTA.
            <p className="mt-1.5 text-md text-[var(--color-ln-mute)]">
              {firstRunState === "fresh"
                ? "Todavía no cargaste ninguna mascota."
                : "No tenés mascotas activas en tu libreta."}
            </p>
          ) : compliancePending > 0 ? (
            // No imminent vencimientos and no open cases, but not every pet is
            // al día — say so truthfully instead of "Todo en orden", mirroring
            // the health strip's "N de M al día".
            <p className="mt-1.5 text-md text-[var(--color-ln-ink-2)]">
              Tenés{" "}
              <strong>
                {capCount(alDiaCount)} de {capCount(petsTracked)} mascotas
              </strong>{" "}
              al día.
            </p>
          ) : (
            // Genuinely nothing pending: no próximos vencimientos, no open
            // cases, and every tracked pet is al día.
            <p className="mt-1.5 text-md text-[var(--color-ln-mute)]">Todo en orden.</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right font-[var(--font-ln-mono)] text-[11px] uppercase leading-[1.6] tracking-[.06em] text-[var(--color-ln-mute)]">
          <div className="font-semibold text-[var(--color-ln-ink-2)]">
            {dateLabel.toUpperCase()}
          </div>
        </div>
      </div>

      <IntentApplyBanner />

      {/* In-flight vet-upgrade band (task #17): keeps the open cycle visible on
          the home surface instead of only inside /cuenta subpages. Links to the
          request detail where the applicant can track or withdraw it. */}
      {vetUpgradePending && (
        <Link
          href="/cuenta/upgrade"
          className="mb-6 flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3 no-underline transition-colors hover:bg-[var(--color-ln-warn-050)]/70"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--color-ln-warn-100)] text-[var(--color-ln-warn)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[var(--text-md)] font-semibold text-[var(--color-ln-ink)]">
              Tu solicitud de veterinario/a está en revisión
            </span>
            <span className="block text-sm text-[var(--color-ln-mute)]">
              La autoridad de tu localidad la está evaluando. Tocá para ver el estado.
            </span>
          </span>
          <span aria-hidden="true" className="flex-shrink-0 text-base text-[var(--color-ln-mute)]">
            ›
          </span>
        </Link>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Open cycles (task #19, Lens 3) — pending adoption applications and   */}
      {/* incoming transfers, surfaced on the default landing (not only on     */}
      {/* /mis-mascotas). Renders nothing when both counts are zero.           */}
      {/* ------------------------------------------------------------------ */}
      <OpenCyclesSection
        pendingApplications={pendingApplications}
        pendingTransfers={pendingTransfers}
      />

      {/* First-run (task #19, Lens 1): a zero-pet owner leads with the real
          first action instead of a reassuring "Todo en orden" over a dead
          capture card. Null once the owner has any manageable pet. */}
      {firstRunState && <FirstRunEmptyState state={firstRunState} />}

      {/* ------------------------------------------------------------------ */}
      {/* Credential carousel (task #9) — "la mascota es la credencial". The  */}
      {/* per-pet glance surface, most-urgent first. Glance-and-go: a card    */}
      {/* navigates to its pet; it drives nothing below it (PO #1).           */}
      {/* ------------------------------------------------------------------ */}
      {credCards.length > 0 && (
        <CredentialRail cards={credCards} totalCount={carouselSource.length} />
      )}

      {/* RemindersSection stays above EventCatcher (keeps visibility gate) */}
      <RemindersSection reminders={reminders} />

      {/* ------------------------------------------------------------------ */}
      {/* Capture block — EventCatcher restyled as "Asentar un hecho".       */}
      {/* wave-3 P5 (PO decision #645 point 4): dropped the rotated "ASIENTO */}
      {/* {appName}" seal that used to sit top-right of the header — pure    */}
      {/* decoration, no behavior. Outer wrapper is now the real LnCard      */}
      {/* component instead of a hand-copied duplicate of its own classes.  */}
      {/* ------------------------------------------------------------------ */}
      {/* id=asentar: the bottom-tab "Asentar un hecho" action (CitizenTabBar,
          mobile) deep-links here so capture lives in the EXISTING tab bar slot
          rather than a second stacked fixed bar (PO 2026-07-12 #4). Hidden
          pre-first-pet (task #19, Lens 1): nothing to asentar against yet. */}
      {hasManageablePets && (
        <div id="asentar" className="scroll-mt-24">
          <LnCard className="mb-6 border-t-[3px] border-t-[var(--color-ln-azul)]">
            {/* Card header */}
            <div className="flex items-center gap-3 px-[18px] pb-3 pt-4">
              <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]">
                {/* pencil/edit glyph */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 font-[var(--font-ln-serif)] text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
                  Asentar un hecho en la libreta
                </h2>
                <p className="mt-0.5 text-sm text-[var(--color-ln-mute)]">
                  Escribí en lenguaje natural — abrimos el formulario que corresponda.
                </p>
              </div>
            </div>

            {/* EventCatcher body — behavior untouched, only outer container styled above */}
            <div className="border-t border-[var(--color-ln-line-2)] px-[18px] pb-[18px] pt-3.5">
              <EventCatcher pets={eventCatcherPets} />
            </div>
          </LnCard>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2-col grid                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* LEFT — Estado sanitario: the single per-pet surface (Item 5).
            Pet navigation lives in the top nav (/mis-mascotas); each strip row
            links to its pet. Zero pets → the "Cargar una mascota" CTA. */}
        <div>
          {healthStatus.length > 0 ? (
            <PetHealthStatusStrip pets={healthStatus} complianceByPet={complianceByPet} />
          ) : hasManageablePets ? (
            <LnEmptyState
              variant="dashed"
              title="Todavía no cargaste ninguna mascota."
              action={
                <Link href="/mis-mascotas/nueva">
                  <LnButton variant="primary" size="sm">
                    Cargar una mascota
                  </LnButton>
                </Link>
              }
            />
          ) : // First-run (task #19): the FirstRunEmptyState above is the single
          // directing surface; don't repeat a second "cargar mascota" box.
          null}
        </div>

        {/* RIGHT — stacked cards */}
        <div className="flex flex-col gap-5">
          {/* Próximos turnos */}
          {appointments.length > 0 && (
            <LnCard>
              <LnCardHead title="Próximos turnos" label="agenda" />
              <LnCardBody>
                <div className="flex flex-col gap-2.5">
                  {appointments.map(({ appointment, slot, offering, pet }) => (
                    <ApptRow
                      key={appointment.publicToken}
                      token={appointment.publicToken}
                      date={new Date(slot.startsAt)}
                      title={`${pet.name} · ${offering.displayName}`}
                      meta={new Date(slot.startsAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        // Server renders in UTC on Vercel — without the pin a
                        // 14:00 ART turno displays as 17:00 on the owner home.
                        timeZone: AR_TIME_ZONE,
                      })}
                    />
                  ))}
                </div>
              </LnCardBody>
            </LnCard>
          )}

          {/* Casos abiertos — CasesWidget has its own card frame. id="casos" is
              the anchor target for /cuenta/casos's redirect (owner-ia-redesign
              P1 item 5), so the wrapper must ALWAYS render — with zero open
              cases the hash would otherwise target nothing and the redirect
              lands unanchored. No `historyHref` because there is no distinct
              history destination anymore (closed/past cases have no home
              until P5's real inbox); linking one would just bounce back here. */}
          <div id="casos">{cases.length > 0 && <CasesWidget cases={cases} />}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-3.5 font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Documento sincronizado</span>
        <Link
          href="/denuncias/nueva"
          className="text-[var(--color-ln-azul)] normal-case no-underline hover:underline"
        >
          + Denunciar maltrato animal
        </Link>
        <span>{BRANDING.appName} · Registro Nacional de Mascotas</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Urgency rank for the credential carousel (PO 2026-07-12 #2): perdido →
// (en tratamiento) → preñada → por vencer → al día → registrada. "sick" is not
// produced by lnPetStatusFromCompliance today, so it never occurs here; it is
// kept in the switch so the ordering contract stays explicit. "registered"
// means the pet has pending obligations (ok < total) — the "por vencer" bucket.
function credRank(status: LnPetStatus): number {
  switch (status) {
    case "lost":
      return 0;
    case "sick":
      return 1;
    case "pregnant":
      return 2;
    case "registered":
      return 3;
    case "ok":
      return 4;
    default:
      return 5;
  }
}

const MONTH_ABBR = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function ApptRow({
  date,
  title,
  meta,
  token,
}: {
  date: Date;
  title: string;
  meta: string;
  token: string;
}) {
  return (
    <Link
      href={`/mis-turnos/${token}`}
      className="flex items-center gap-3 rounded-[var(--radius-sm)] hover:bg-[var(--color-ln-stripe)] transition-colors no-underline -mx-1.5 px-1.5 py-1"
    >
      <div className="flex h-[44px] w-[44px] flex-shrink-0 flex-col items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] text-center">
        <span className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
          {MONTH_ABBR[date.getMonth()]}
        </span>
        <span className="font-[var(--font-ln-serif)] text-base font-semibold leading-tight text-[var(--color-ln-ink)]">
          {date.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[var(--color-ln-ink)]">{title}</p>
        <p className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">{meta}</p>
      </div>
    </Link>
  );
}
