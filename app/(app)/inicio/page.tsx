// Owner home (Chunk I — v2 activation).
//
// Replaces the pre-v2 multi-widget dashboard with the simplified v3 layout
// (per docs/owner-home-plan-2026-05-20.md):
//   - EventCatcher = quick-action + pet picker. Pets list is no longer a
//     separate section; the chip row IS the pet list.
//   - CasesWidget = "Mis casos" — replaces OpenWorkflowsWidget.
//   - RemindersSection = vacuna reminders (shipped in C3) — kept because
//     it has its own visibility gate.
//   - Próximos turnos = upcoming appointments inline (no separate widget).
//
// Auth + role gates already enforced by (app)/layout.tsx.

import Link from "next/link";

import { type CaseRow, CasesWidget } from "@/components/CasesWidget";
import { EventCatcher, type EventCatcherPet, type PetState } from "@/components/EventCatcher";
import { and, eq, isNull } from "drizzle-orm";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import type { DashboardPet, WorkflowItem, WorkflowKind } from "@/lib/owner-dashboard";
import {
  fetchActiveReminders,
  fetchOpenWorkflows,
  fetchPetsForOwner,
  fetchUpcomingAppointments,
} from "@/lib/owner-dashboard";
import { petPhotoUrl } from "@/lib/storage";
import { RemindersSection } from "./_components/RemindersSection";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Adapters: DB row shapes → presentational props
// ---------------------------------------------------------------------------

/** Pet status → EventCatcher derived state. Simple v1 mapping; richer
 *  signal precedence (overdue vaccine, custody dispute, etc.) lives as
 *  TODO(future). Today: lost → urgent; all others default to "ok". */
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

/** Map a WorkflowItem (severity: info | warning | urgent) into a CaseRow
 *  (severity: info | warning | danger | success). `urgent` → `danger`.
 *  Picks a representative emoji per kind for the v1 icon column. */
const WORKFLOW_KIND_ICON: Record<WorkflowKind, string> = {
  pet_lost: "🧭",
  welfare_report_open: "🚨",
  welfare_report_closed: "🚨",
  adoption_application_pending: "📨",
  adoption_application_resolved: "📨",
  foster_proposal_pending: "🏠",
  foster_proposal_resolved: "🏠",
  custody_transfer_pending: "🤝",
  custody_dispute_open: "⚖️",
  approval_request_pending: "📋",
  approval_request_decided: "📋",
};

function adaptWorkflow(w: WorkflowItem): CaseRow {
  return {
    id: w.id,
    title: w.title,
    subtitle: w.subtitle ?? "",
    ctaUrl: w.ctaUrl,
    since: w.since,
    severity: w.severity === "urgent" ? "danger" : w.severity,
    icon: WORKFLOW_KIND_ICON[w.kind],
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InicioPage() {
  const { user } = await requireUserOrRedirect();

  const [profile, pets, openWf, appointments, reminders] = await Promise.all([
    db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(and(eq(profiles.id, user.id), isNull(profiles.deactivatedAt)))
      .limit(1),
    fetchPetsForOwner(user.id),
    fetchOpenWorkflows(user.id),
    fetchUpcomingAppointments(user.id, 5),
    fetchActiveReminders(user.id),
  ]);

  const firstName = (profile[0]?.displayName ?? "").trim().split(/\s+/)[0] || "amigo";

  const eventCatcherPets = pets.map(adaptPet);
  const cases = openWf.map(adaptWorkflow);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10 pt-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gob-text">Hola, {firstName}</h1>
        <p className="text-sm text-gob-text-muted">¿Qué le pasó a alguna mascota hoy?</p>
      </header>

      <RemindersSection reminders={reminders} />

      <EventCatcher pets={eventCatcherPets} />

      {cases.length > 0 && <CasesWidget cases={cases} />}

      {appointments.length > 0 && (
        <section aria-labelledby="next-appts-h" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="next-appts-h" className="text-base font-semibold text-gob-text">
              Próximos turnos
            </h2>
            <Link
              href="/mis-turnos"
              className="text-xs font-medium text-gob-azul-link hover:underline"
            >
              Ver agenda →
            </Link>
          </div>
          <ul className="divide-y divide-gob-border">
            {appointments.map(({ appointment, slot, offering }) => (
              <li key={appointment.publicToken} className="flex items-center gap-3 py-2.5">
                <DateChip date={new Date(slot.startsAt)} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gob-text">{offering.displayName}</p>
                  <p className="text-xs text-gob-text-muted">
                    {new Date(slot.startsAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="pt-2 text-center text-xs text-gob-text-muted">
        Notificaciones, medicaciones y workflows previos viven en el menú lateral.
      </p>
    </div>
  );
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

function DateChip({ date }: { date: Date }) {
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-gob-border text-center">
      <span className="text-[11px] text-gob-text-muted">{MONTH_ABBR[date.getMonth()]}</span>
      <span className="text-sm font-semibold leading-tight text-gob-text">{date.getDate()}</span>
    </div>
  );
}
