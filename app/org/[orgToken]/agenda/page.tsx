// /org/[orgToken]/agenda — org-side booking dashboard (Fase 5).
//
// Capability-gated: appointment.manage.
// Filterable by ?fecha=YYYY-MM-DD (defaults to today).
// Shows: time, pet name, owner name (Tier-1: first name + phone if disclosed),
// service_kind, status badge. Action buttons: mark attended / no-show / cancel.
// Also shows per-offering slot occupancy ("Cupos del día") with block action.

import { and, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpCard, OpCardBody, OpCardHead, OpCrumbs, OpPill } from "@/components/ui/dashboard";
import { appointments, db, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { findServiceKind } from "@/lib/reference/service-kinds";
import { AR_TIME_ZONE, formatTime, pluralizeEs } from "@/lib/utils/format";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { BlockSlotButton } from "./BlockSlotButton";

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

type SlotRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookingsCount: number;
  status: string;
  offeringId: string;
  offeringTitle: string;
  serviceKind: string;
};

type OfferingGroup = {
  offeringId: string;
  offeringTitle: string;
  serviceKind: string;
  slots: SlotRow[];
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

  // Appointments and slot-occupancy queries are independent — run in parallel.
  const [rows, slotRows] = await Promise.all([
    db
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
      .orderBy(timeSlots.startsAt),
    // Slot occupancy for "Cupos del día".
    db
      .select({
        id: timeSlots.id,
        startsAt: timeSlots.startsAt,
        endsAt: timeSlots.endsAt,
        capacity: timeSlots.capacity,
        bookingsCount: timeSlots.bookingsCount,
        status: timeSlots.status,
        offeringId: serviceOfferings.id,
        offeringTitle: serviceOfferings.displayName,
        serviceKind: serviceOfferings.serviceKind,
      })
      .from(timeSlots)
      .innerJoin(serviceOfferings, eq(serviceOfferings.id, timeSlots.serviceOfferingId))
      .where(
        and(
          eq(serviceOfferings.organizationId, organization.id),
          gte(timeSlots.startsAt, localMidnight),
          lt(timeSlots.startsAt, localNextMidnight),
        ),
      )
      .orderBy(timeSlots.startsAt),
  ]);

  // Group slots by offering.
  const offeringGroupsMap = new Map<string, OfferingGroup>();
  for (const row of slotRows) {
    let group = offeringGroupsMap.get(row.offeringId);
    if (!group) {
      group = {
        offeringId: row.offeringId,
        offeringTitle: row.offeringTitle,
        serviceKind: row.serviceKind,
        slots: [],
      };
      offeringGroupsMap.set(row.offeringId, group);
    }
    group.slots.push(row);
  }
  const offeringGroups = Array.from(offeringGroupsMap.values());

  // Prev/next date navigation.
  const current = new Date(`${targetDateStr}T00:00:00`);
  const prevDate = new Date(current.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const isToday = targetDateStr === todayStr;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs (audit #18 — was missing on the day view). */}
      <OpCrumbs items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Agenda" }]} />
      {/* Page header */}
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {organization.displayName}
        </p>
        <h1 className="text-title font-semibold text-ln-op-ink">Agenda del día</h1>
      </header>

      {/* Date picker nav */}
      <div className="flex items-center gap-3">
        <Link
          href={`/org/${orgToken}/agenda?fecha=${prevDate}`}
          className="px-3 py-1.5 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-sm text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          ← Anterior
        </Link>
        {!isToday && (
          <Link
            href={`/org/${orgToken}/agenda`}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-ln-op-azul bg-ln-op-card text-sm font-medium text-ln-op-azul hover:bg-ln-op-stripe transition-colors"
          >
            Hoy
          </Link>
        )}
        <span className="text-md font-medium text-ln-op-ink">
          {/* Noon-UTC anchor + AR pin: offset-less "T12:00:00" parses in the
              SERVER zone, and an unpinned formatter renders in it too — the
              header day then depends on where the process runs. */}
          {new Date(`${targetDateStr}T12:00:00Z`).toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: AR_TIME_ZONE,
          })}
        </span>
        <Link
          href={`/org/${orgToken}/agenda?fecha=${nextDate}`}
          className="px-3 py-1.5 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-sm text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
        >
          Siguiente →
        </Link>
      </div>

      {/* Slot occupancy — Cupos del día */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold text-ln-op-ink">Cupos del día</h2>
        {offeringGroups.length === 0 ? (
          <p className="text-md text-ln-op-mute py-4 text-center">
            No hay cupos materializados para este día.
          </p>
        ) : (
          offeringGroups.map((group) => {
            const kindDef = findServiceKind(group.serviceKind);
            const groupLabel = kindDef?.label ?? group.serviceKind;
            return (
              <OpCard key={group.offeringId}>
                <OpCardHead title={`${group.offeringTitle} · ${groupLabel}`} />
                <OpCardBody className="p-0">
                  <ul className="divide-y divide-ln-op-line">
                    {group.slots.map((slot) => {
                      const startStr = formatTime(slot.startsAt);
                      const endStr = formatTime(slot.endsAt);
                      const occupancyLabel =
                        slot.status === "cancelled"
                          ? "Bloqueado"
                          : `${slot.bookingsCount}/${slot.capacity} reservados`;
                      const canBlock = slot.bookingsCount === 0 && slot.status === "open";
                      return (
                        <li key={slot.id} className="flex items-center gap-4 px-4 py-3">
                          <div className="shrink-0 text-sm font-ln-mono text-ln-op-mute w-28">
                            {startStr}–{endStr}
                          </div>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            {/* Occupancy is DATA, not status (one-primary-per-screen
                                review, 2026-08-06). This pill used to paint an
                                empty cupo GREEN ("0/2" = all good?), a partly
                                booked one blue and a full one RED — three alarm
                                colours for a fraction that already says
                                everything on its own, competing with the real
                                states on the same screen ("Ausente" = danger,
                                "Asistido" = ok). One neutral tone; the number
                                carries the meaning. */}
                            <OpPill tone="neutral">{occupancyLabel}</OpPill>
                          </div>
                          {canBlock && (
                            <div className="shrink-0">
                              <BlockSlotButton orgToken={orgToken} slotId={slot.id} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </OpCardBody>
              </OpCard>
            );
          })
        )}
      </section>

      {/* Appointments list */}
      {rows.length === 0 ? (
        <p className="text-md text-ln-op-mute py-8 text-center">No hay turnos para este día.</p>
      ) : (
        <OpCard>
          <OpCardHead title={`${rows.length} ${pluralizeEs(rows.length, "turno")}`} />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {rows.map(({ appointment, slot, offering, pet, ownerProfile }) => {
                const kindDef = findServiceKind(offering.serviceKind);
                const pill = STATUS_PILL[appointment.status] ?? STATUS_PILL.confirmed;
                const slotTime = formatTime(slot.startsAt);
                const ownerLabel = ownerProfile?.displayName?.split(" ")[0] ?? "Propietario";
                const canAct = appointment.status === "confirmed";

                return (
                  <li key={appointment.id} className="flex items-start gap-4 px-4 py-3">
                    <div className="shrink-0 text-sm font-ln-mono text-ln-op-mute w-14 pt-0.5">
                      {slotTime}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-md font-semibold text-ln-op-ink">{pet.name}</p>
                        <OpPill tone={pill.tone}>{pill.label}</OpPill>
                      </div>
                      <p className="text-sm text-ln-op-mute">
                        {kindDef?.label ?? offering.serviceKind} · <span>{ownerLabel}</span>
                        {ownerProfile?.phone && <> · {ownerProfile.phone}</>}
                      </p>
                    </div>
                    {canAct && (
                      <div className="shrink-0">
                        <Link
                          href={`/org/${orgToken}/agenda/turnos/${appointment.publicToken}`}
                          className="text-sm px-3 py-1.5 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card hover:bg-ln-op-stripe transition-colors text-ln-op-azul"
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
        <Link href={`/org/${orgToken}`} className="text-sm text-ln-op-azul hover:underline">
          ← Volver al panel
        </Link>
      </footer>
    </div>
  );
}
