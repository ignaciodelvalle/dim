// /mis-turnos — Libreta Nacional redesign.
// AppointmentCard (component) is unchanged.

import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { AppointmentCard } from "@/components/AppointmentCard";
import { LnButton } from "@/components/ui/Button";
import { LnSectionHead } from "@/components/ui/DocElements";
import { appointments, db, organizations, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

export default async function MisTurnosPage() {
  const { user } = await requireUserOrRedirect();

  const rows = await db
    .select({
      appointment: appointments,
      slot: {
        startsAt: timeSlots.startsAt,
        endsAt: timeSlots.endsAt,
        capacity: timeSlots.capacity,
        bookingsCount: timeSlots.bookingsCount,
      },
      offering: {
        displayName: serviceOfferings.displayName,
        serviceKind: serviceOfferings.serviceKind,
        durationMinutes: serviceOfferings.durationMinutes,
        priceArs: serviceOfferings.priceArs,
        organizationId: serviceOfferings.organizationId,
      },
      pet: {
        name: pets.name,
        publicToken: pets.publicToken,
      },
      org: {
        displayName: organizations.displayName,
      },
      provider: {
        displayName: profiles.displayName,
      },
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(organizations, eq(organizations.id, appointments.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(eq(appointments.ownerUserId, user.id))
    .orderBy(desc(timeSlots.startsAt));

  const now = new Date();

  const upcoming = rows.filter(
    (r) => r.appointment.status === "confirmed" && r.slot.startsAt >= now,
  );
  const past = rows.filter(
    (r) =>
      r.appointment.status === "attended" ||
      (r.appointment.status === "confirmed" && r.slot.startsAt < now),
  );
  const cancelled = rows.filter(
    (r) =>
      r.appointment.status === "cancelled" ||
      r.appointment.status === "cancelled_by_owner" ||
      r.appointment.status === "no_show",
  );

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Header */}
      <div className="mb-[24px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Mis turnos
          </h1>
          <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
            {rows.length === 0
              ? "Todavía no tenés turnos reservados."
              : `${rows.length} turno${rows.length === 1 ? "" : "s"} en total.`}
          </p>
        </div>
        <Link href="/turnos/buscar">
          <LnButton variant="primary" size="md">
            Buscar turnos
          </LnButton>
        </Link>
      </div>

      {rows.length === 0 && (
        <div className="rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)] p-[40px] text-center">
          <p className="text-[13px] text-[var(--color-ln-mute)]">
            Reservá tu primer turno buscando un servicio disponible.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-[32px]">
        {upcoming.length > 0 && (
          <section>
            <LnSectionHead num="01" title="Próximos" className="mb-[14px]" />
            <ul className="flex flex-col gap-[10px]">
              {upcoming.map((r) => (
                <AppointmentCard key={r.appointment.id} row={r} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <LnSectionHead num="02" title="Pasados" className="mb-[14px]" />
            <ul className="flex flex-col gap-[10px]">
              {past.map((r) => (
                <AppointmentCard key={r.appointment.id} row={r} />
              ))}
            </ul>
          </section>
        )}

        {cancelled.length > 0 && (
          <section>
            <LnSectionHead num="03" title="Cancelados" className="mb-[14px]" />
            <ul className="flex flex-col gap-[10px]">
              {cancelled.map((r) => (
                <AppointmentCard key={r.appointment.id} row={r} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="mt-[40px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-[14px] font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Agenda de turnos</span>
        <Link
          href="/mis-mascotas"
          className="normal-case text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Mis mascotas
        </Link>
      </div>
    </div>
  );
}
