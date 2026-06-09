// /org/[orgToken]/agenda — org-side booking dashboard (Fase 5).
//
// Capability-gated: appointment.manage.
// Filterable by ?fecha=YYYY-MM-DD (defaults to today).
// Shows: time, pet name, owner name (Tier-1: first name + phone if disclosed),
// service_kind, status badge. Action buttons: mark attended / no-show / cancel.

import { and, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { appointments, db, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { notFound } from "next/navigation";

// ============================================================================
// Helpers
// ============================================================================

type StatusTone = "ok" | "triaged" | "neutral" | "danger";
const STATUS_PILL: Record<string, { label: string; tone: StatusTone }> = {
  confirmed: { label: "Confirmado", tone: "triaged" },
  attended: { label: "Asistido", tone: "ok" },
  cancelled_by_org: { label: "Cancelado", tone: "neutral" },
  cancelled_by_owner: { label: "Cancelado", tone: "neutral" },
  no_show: { label: "Ausente", tone: "danger" },
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
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {organization.displayName}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Agenda del día</h1>
      </header>

      {/* Date picker nav */}
      <div className="flex items-center gap-3">
        <Link
          href={`/org/${orgToken}/agenda?fecha=${prevDate}`}
          className="px-3 py-1.5 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[12px] text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          ← Anterior
        </Link>
        <span className="text-[13px] font-medium text-ln-op-ink">
          {new Date(`${targetDateStr}T12:00:00`).toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
        <Link
          href={`/org/${orgToken}/agenda?fecha=${nextDate}`}
          className="px-3 py-1.5 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[12px] text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Siguiente →
        </Link>
      </div>

      {/* Appointments list */}
      {rows.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute py-8 text-center">No hay turnos para este día.</p>
      ) : (
        <OpCard>
          <OpCardHead title={`${rows.length} turno${rows.length === 1 ? "" : "s"}`} />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {rows.map(({ appointment, slot, offering, pet, ownerProfile }) => {
                const kindDef = findServiceKind(offering.serviceKind);
                const pill = STATUS_PILL[appointment.status] ?? STATUS_PILL.confirmed;
                const slotTime = slot.startsAt.toLocaleTimeString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const ownerLabel = ownerProfile?.displayName?.split(" ")[0] ?? "Propietario";
                const canAct = appointment.status === "confirmed";

                return (
                  <li key={appointment.id} className="flex items-start gap-4 px-4 py-3">
                    <div className="shrink-0 text-[12px] font-mono text-ln-op-mute w-14 pt-0.5">
                      {slotTime}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-ln-op-ink">{pet.name}</p>
                        <OpPill tone={pill.tone}>{pill.label}</OpPill>
                      </div>
                      <p className="text-[12px] text-ln-op-mute">
                        {kindDef?.label ?? offering.serviceKind} · <span>{ownerLabel}</span>
                        {ownerProfile?.phone && <> · {ownerProfile.phone}</>}
                      </p>
                    </div>
                    {canAct && (
                      <div className="shrink-0">
                        <Link
                          href={`/org/${orgToken}/agenda/turnos/${appointment.publicToken}`}
                          className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-line bg-ln-op-card hover:bg-ln-op-stripe transition-colors text-ln-op-azul"
                        >
                          Gestionar
                        </Link>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </OpCardBody>
        </OpCard>
      )}

      <footer className="pt-4 border-t border-ln-op-line">
        <Link href={`/org/${orgToken}`} className="text-[12px] text-ln-op-azul hover:underline">
          ← Volver al panel
        </Link>
      </footer>
    </div>
  );
}
