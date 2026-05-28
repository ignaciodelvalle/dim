// /org/[orgToken]/agenda — org-side booking dashboard (Fase 5).
//
// Capability-gated: appointment.manage.
// Filterable by ?fecha=YYYY-MM-DD (defaults to today).
// Shows: time, pet name, owner name (Tier-1: first name + phone if disclosed),
// service_kind, status badge. Action buttons: mark attended / no-show / cancel.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { appointments, db, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { findServiceKind } from "@/lib/service-kinds";
import { notFound } from "next/navigation";

// ============================================================================
// Helpers
// ============================================================================

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-gob-success/10 text-gob-success  ",
  },
  attended: {
    label: "Asistido",
    className: "bg-gob-info/10 text-gob-azul-link  ",
  },
  cancelled_by_org: {
    label: "Cancelado",
    className: "bg-gob-surface-alt text-gob-text  ",
  },
  cancelled_by_owner: {
    label: "Cancelado",
    className: "bg-gob-surface-alt text-gob-text  ",
  },
  no_show: {
    label: "Ausente",
    className: "bg-gob-danger/10 text-gob-danger  ",
  },
};

// ============================================================================
// Page
// ============================================================================

export default async function OrgAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { orgToken } = await params;
  const { fecha } = await searchParams;

  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("appointment.manage")) notFound();

  // Parse target date (default = today Argentina time).
  const targetDateStr =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Argentina/Buenos_Aires",
        });

  // Window: midnight to midnight (UTC) for the chosen day in Argentina time.
  // Simple approach: use the day boundary in UTC+3 (Argentina, no DST).
  const AR_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3
  const localMidnight = new Date(`${targetDateStr}T00:00:00.000-03:00`);
  const localNextMidnight = new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      appointment: appointments,
      slot: timeSlots,
      offering: serviceOfferings,
      pet: pets,
      ownerProfile: {
        displayName: profiles.displayName,
        phone: profiles.phone,
      },
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(profiles, eq(profiles.id, appointments.ownerUserId))
    .where(
      and(
        eq(appointments.organizationId, organization.id),
        gte(timeSlots.startsAt, localMidnight),
        lt(timeSlots.startsAt, localNextMidnight),
      ),
    )
    .orderBy(timeSlots.startsAt);

  // Prev/next date navigation.
  const current = new Date(`${targetDateStr}T00:00:00`);
  const prevDate = new Date(current.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-white  p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gob-text-muted">
              {organization.displayName}
            </p>
            <h1 className="text-2xl font-semibold text-gob-text ">Agenda del día</h1>
          </div>
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-gob-text-gray  underline underline-offset-4"
          >
            ← Volver al panel
          </Link>
        </div>

        {/* Date picker nav */}
        <div className="flex items-center gap-3">
          <Link
            href={`/org/${orgToken}/agenda?fecha=${prevDate}`}
            className="px-3 py-1.5 rounded-md border border-gob-border  text-sm hover:bg-gob-surface-alt  transition-colors"
          >
            ← Anterior
          </Link>
          <span className="text-sm font-medium text-gob-text ">
            {new Date(`${targetDateStr}T12:00:00`).toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <Link
            href={`/org/${orgToken}/agenda?fecha=${nextDate}`}
            className="px-3 py-1.5 rounded-md border border-gob-border  text-sm hover:bg-gob-surface-alt  transition-colors"
          >
            Siguiente →
          </Link>
        </div>

        {/* Appointments list */}
        {rows.length === 0 ? (
          <p className="text-sm text-gob-text-muted  py-8 text-center">
            No hay turnos para este día.
          </p>
        ) : (
          <ul className="divide-y divide-gob-border  rounded-xl border border-gob-border ">
            {rows.map(({ appointment, slot, offering, pet, ownerProfile }) => {
              const kindDef = findServiceKind(offering.serviceKind);
              const badge = STATUS_BADGE[appointment.status] ?? STATUS_BADGE.confirmed;
              const slotTime = slot.startsAt.toLocaleTimeString("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                hour: "2-digit",
                minute: "2-digit",
              });
              const ownerLabel = ownerProfile?.displayName?.split(" ")[0] ?? "Propietario";
              const canAct = appointment.status === "confirmed";

              return (
                <li key={appointment.id} className="p-4 flex items-start gap-4">
                  <div className="shrink-0 text-sm font-mono text-gob-text-gray  w-14 pt-0.5">
                    {slotTime}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gob-text ">{pet.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gob-text-muted ">
                      {kindDef?.label ?? offering.serviceKind} · <span>{ownerLabel}</span>
                      {ownerProfile?.phone && <> · {ownerProfile.phone}</>}
                    </p>
                  </div>
                  {canAct && (
                    <div className="shrink-0">
                      <Link
                        href={`/org/${orgToken}/agenda/turnos/${appointment.publicToken}`}
                        className="text-xs px-3 py-1.5 rounded-md border border-gob-border-strong  hover:bg-gob-surface-alt  transition-colors text-gob-text-gray "
                      >
                        Gestionar
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
