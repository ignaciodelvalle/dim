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

import Link from "next/link";

import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { EventCatcher, type EventCatcherPet, type PetState } from "@/components/EventCatcher";
import { LnButton } from "@/components/ui/Button";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnEmptyState } from "@/components/ui/EmptyState";
import type { DashboardPet } from "@/lib/analytics/owner-dashboard";
import {
  fetchActiveReminders,
  fetchComplianceStatesForPets,
  fetchOpenWorkflows,
  fetchPetsForOwner,
  fetchUpcomingAppointments,
} from "@/lib/analytics/owner-dashboard";
import { countProximosReminders } from "@/lib/domain/vaccine-reminder-state";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { fetchPetHealthNudges } from "@/lib/infra/owner-nudges";
import { getProfileCached } from "@/lib/infra/request-cache";
import { petPhotoUrl } from "@/lib/infra/storage";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";
import { BRANDING } from "@/lib/ui/branding";
import { capCount } from "@/lib/utils/format";
import { greetingFirstName } from "@/lib/utils/greeting";
import { IntentApplyBanner } from "./_components/IntentApplyBanner";
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

  // getProfileCached is warmed by (app)/layout.tsx in the same render pass —
  // this is a memoized hit, not an extra DB round-trip.
  const [profileRow, petsResult, openWf, appointments, reminders, healthStatus] = await Promise.all(
    [
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
    ],
  );

  const { pets } = petsResult;

  // Compliance projection for the health-status pets — the SAME source the pet
  // profile and /mis-mascotas read (deriveComplianceState). The strip renders
  // the AL DÍA / REGISTRADA chip from this so /inicio and the profile can never
  // disagree about whether a pet is compliant (UX gate M5b). One extra bounded
  // read (4 indexed queries) after the fan-out, since it needs the pet ids.
  const complianceByPet = new Map<string, PetComplianceSummary>();
  const healthPetIds = healthStatus.map((h) => h.petId);
  if (healthPetIds.length > 0) {
    const complianceStates = await fetchComplianceStatesForPets(user.id, healthPetIds);
    const petMetaById = new Map(pets.map((p) => [p.id, p]));
    for (const h of healthStatus) {
      const c = complianceStates.get(h.petId);
      if (!c) continue;
      const meta = petMetaById.get(h.petId);
      complianceByPet.set(h.petId, {
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

      {/* RemindersSection stays above EventCatcher (keeps visibility gate) */}
      <RemindersSection reminders={reminders} />

      {/* ------------------------------------------------------------------ */}
      {/* Capture block — EventCatcher restyled as "Asentar un hecho".       */}
      {/* wave-3 P5 (PO decision #645 point 4): dropped the rotated "ASIENTO */}
      {/* {appName}" seal that used to sit top-right of the header — pure    */}
      {/* decoration, no behavior. Outer wrapper is now the real LnCard      */}
      {/* component instead of a hand-copied duplicate of its own classes.  */}
      {/* ------------------------------------------------------------------ */}
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
          ) : (
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
          )}
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
                      })}
                    />
                  ))}
                </div>
              </LnCardBody>
            </LnCard>
          )}

          {/* Casos abiertos — CasesWidget has its own card frame */}
          {cases.length > 0 && <CasesWidget cases={cases} historyHref="/cuenta/casos" />}
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
