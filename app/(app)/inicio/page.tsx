// Owner home — Libreta Nacional redesign.
//
// Layout: greeting (serif h1 + date/place mono right) → capture block
// (EventCatcher restyled as "Asentar un hecho" card) → 2-col grid:
//   left:  01 Mis mascotas registry (LnRegRow)
//   right: stacked cards — Vencimientos, Próximos turnos, Casos abiertos
//
// Data fetching, server actions, routes, and EventCatcher behavior unchanged.
// Auth + role gates enforced by (app)/layout.tsx.

import Link from "next/link";

import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { EventCatcher, type EventCatcherPet, type PetState } from "@/components/EventCatcher";
import { LnButton } from "@/components/ui/Button";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnRegRow, LnRegistry } from "@/components/ui/RegRow";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { BRANDING } from "@/lib/branding";
import { speciesLabel } from "@/lib/format";
import type { DashboardPet } from "@/lib/owner-dashboard";
import {
  fetchActiveReminders,
  fetchOpenWorkflows,
  fetchPetsForOwner,
  fetchUpcomingAppointments,
} from "@/lib/owner-dashboard";
import { fetchPetHealthNudges } from "@/lib/owner-nudges";
import { getProfileCached } from "@/lib/request-cache";
import { petPhotoUrl } from "@/lib/storage";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";
import { IntentApplyBanner } from "./_components/IntentApplyBanner";
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

/** Map DB pet status to LnPetStatus for registry rows. */
function toLnStatus(status: string): "ok" | "lost" {
  if (status === "lost") return "lost";
  return "ok";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InicioPage() {
  const { user } = await requireUserOrRedirect();

  // getProfileCached is warmed by (app)/layout.tsx in the same render pass —
  // this is a memoized hit, not an extra DB round-trip.
  const [profileRow, pets, openWf, appointments, reminders, healthStatus] = await Promise.all([
    getProfileCached(user.id),
    fetchPetsForOwner(user.id),
    fetchOpenWorkflows(user.id),
    fetchUpcomingAppointments(user.id, 5),
    fetchActiveReminders(user.id),
    // Item 5 — per-pet health-status nudges, derived from the owner's own
    // events/reminders only (no surveillance/authority data).
    fetchPetHealthNudges(user.id),
  ]);
  // Deactivated profiles greet generically — parity with the pre-cache query,
  // which filtered deactivated_at IS NULL.
  const firstName =
    profileRow && profileRow.deactivatedAt === null
      ? (profileRow.displayName ?? "").trim().split(/\s+/)[0] || "amigo"
      : "amigo";

  const eventCatcherPets = pets.map(adaptPet);
  const cases = openWf.map(adaptWorkflow);

  // Visible pets for the registry (no deceased)
  const registryPets = pets.filter((p) => p.status !== "deceased");

  // Today's date for the greeting datestamp
  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-[32px] py-[28px] pb-[48px] md:px-[32px]">
      {/* ------------------------------------------------------------------ */}
      {/* Greeting                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-[24px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Buen día, {firstName}.
          </h1>
          {reminders.length > 0 || cases.length > 0 ? (
            <p className="mt-[6px] text-[14px] text-[var(--color-ln-ink-2)]">
              {reminders.length > 0 && (
                <>
                  Tenés{" "}
                  <strong>
                    {reminders.length} vencimiento{reminders.length !== 1 ? "s" : ""} próximo
                    {reminders.length !== 1 ? "s" : ""}
                  </strong>
                  {cases.length > 0 ? " y " : "."}
                </>
              )}
              {cases.length > 0 && (
                <>
                  {cases.length > 1 ? `${cases.length} casos abiertos` : "un caso abierto"} que{" "}
                  {cases.length !== 1 ? "requieren" : "requiere"} atención.
                </>
              )}
            </p>
          ) : (
            <p className="mt-[6px] text-[14px] text-[var(--color-ln-mute)]">Todo en orden.</p>
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
      {/* Capture block — EventCatcher restyled as "Asentar un hecho"        */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-[24px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] border-t-[3px] border-t-[var(--color-ln-azul)] bg-[var(--color-ln-card)] shadow-[0_1px_0_rgba(0,0,0,.02)]">
        {/* Card header */}
        <div className="relative flex items-center gap-[12px] px-[18px] pb-[12px] pt-[16px]">
          <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[8px] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]">
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
            <p className="mt-[2px] text-[12px] text-[var(--color-ln-mute)]">
              Escribí en lenguaje natural — abrimos el formulario que corresponda.
            </p>
          </div>
          {/* ASIENTO seal */}
          <div
            aria-hidden="true"
            className="-rotate-9 grid h-[44px] w-[44px] flex-shrink-0 place-items-center rounded-full border-2 border-[var(--color-ln-azul)] font-[var(--font-ln-mono)] text-[6.5px] uppercase leading-[1.2] tracking-[.08em] text-[var(--color-ln-azul)] opacity-70"
          >
            <span className="text-center">
              ASIENTO
              <br />
              {BRANDING.appName}
            </span>
          </div>
        </div>

        {/* EventCatcher body — behavior untouched, only outer container styled above */}
        <div className="border-t border-[var(--color-ln-line-2)] px-[18px] pb-[18px] pt-[14px]">
          <EventCatcher pets={eventCatcherPets} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2-col grid                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-[24px] lg:grid-cols-[1fr_320px]">
        {/* LEFT — registry */}
        <div>
          <LnSectionHead
            num="01"
            title="Mis mascotas"
            meta={
              <Link
                href="/mis-mascotas"
                className="text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                {registryPets.length} inscripta{registryPets.length !== 1 ? "s" : ""} · ver todas →
              </Link>
            }
          />
          {registryPets.length > 0 ? (
            <LnRegistry>
              {registryPets.map((p) => (
                <LnRegRow
                  key={p.id}
                  name={p.name}
                  status={toLnStatus(p.status)}
                  breed={speciesLabel(p.species)}
                  species={speciesLabel(p.species)}
                  photoSrc={petPhotoUrl(p.primaryPhotoStoragePath) ?? undefined}
                  photoSize={64}
                  href={`/mis-mascotas/${p.publicToken}`}
                />
              ))}
            </LnRegistry>
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
        <div className="flex flex-col gap-[20px]">
          {/* Estado sanitario — per-pet owner health-status nudges (Item 5) */}
          <PetHealthStatusStrip pets={healthStatus} />

          {/* Vencimientos */}
          {reminders.length > 0 && (
            <LnCard>
              <LnCardHead
                title="Vencimientos"
                label={`${reminders.length} próximo${reminders.length !== 1 ? "s" : ""}`}
              />
              <LnCardBody>
                <div className="flex flex-col gap-[10px]">
                  {reminders.slice(0, 4).map((r) => (
                    <DueRow key={r.reminderId} reminder={r} />
                  ))}
                </div>
              </LnCardBody>
            </LnCard>
          )}

          {/* Próximos turnos */}
          {appointments.length > 0 && (
            <LnCard>
              <LnCardHead title="Próximos turnos" label="agenda" />
              <LnCardBody>
                <div className="flex flex-col gap-[10px]">
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
      <div className="mt-[40px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-[14px] font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
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
      className="flex items-center gap-[12px] rounded-[4px] hover:bg-[var(--color-ln-stripe)] transition-colors no-underline -mx-[6px] px-[6px] py-[4px]"
    >
      <div className="flex h-[44px] w-[44px] flex-shrink-0 flex-col items-center justify-center rounded-[4px] border border-[var(--color-ln-line)] text-center">
        <span className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
          {MONTH_ABBR[date.getMonth()]}
        </span>
        <span className="font-[var(--font-ln-serif)] text-[16px] font-semibold leading-tight text-[var(--color-ln-ink)]">
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

type ActiveReminderRow = {
  reminderId: string;
  petName: string;
  petToken: string;
  title: string;
  daysUntilDue: number;
  variant: ReminderVariant;
};

function DueRow({ reminder }: { reminder: ActiveReminderRow }) {
  const isOver = reminder.daysUntilDue < 0;
  const isCritical = reminder.variant === "overdue_critical" || reminder.variant === "overdue";
  const dotClass = isCritical
    ? "bg-[var(--color-ln-err)]"
    : reminder.variant === "due_soon"
      ? "bg-[var(--color-ln-warn)]"
      : "bg-[var(--color-ln-celeste)]";
  const whenColor = isOver
    ? "text-[var(--color-ln-err)]"
    : reminder.variant === "due_soon"
      ? "text-[var(--color-ln-warn)]"
      : "text-[var(--color-ln-mute)]";

  return (
    <Link
      href={`/mis-mascotas/${reminder.petToken}?tab=vacunas`}
      className="flex items-center gap-[10px] rounded-[4px] hover:bg-[var(--color-ln-stripe)] transition-colors no-underline -mx-[6px] px-[6px] py-[4px]"
    >
      <span
        className={`h-[8px] w-[8px] flex-shrink-0 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-[var(--color-ln-ink)]">
          {reminder.title} · {reminder.petName}
        </p>
      </div>
      <span className={`flex-shrink-0 font-[var(--font-ln-mono)] text-[11px] ${whenColor}`}>
        {isOver ? `−${Math.abs(reminder.daysUntilDue)} días` : `en ${reminder.daysUntilDue} días`}
      </span>
    </Link>
  );
}
