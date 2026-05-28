// /mis-turnos — Owner's appointment list (Fase 4).
//
// Shows all appointments for the authenticated user, sectioned into:
//   - Próximos: confirmed + slot starts_at >= now()
//   - Pasados: attended OR (confirmed + slot starts_at < now())
//   - Cancelados: cancelled or no-show

import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { AppointmentCard } from "@/components/AppointmentCard";
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
    (r) => r.appointment.status === "cancelled" || r.appointment.status === "no_show",
  );

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Mis turnos</h1>
          <p className="text-sm text-gob-text-gray ">
            {rows.length === 0
              ? "Todavía no tenés turnos reservados."
              : `${rows.length} turno${rows.length === 1 ? "" : "s"} en total.`}
          </p>
        </header>

        {rows.length === 0 && (
          <div className="border border-dashed border-gob-border-strong  rounded-xl p-10 text-center space-y-3">
            <p className="text-gob-text-gray ">
              Reservá tu primer turno buscando un servicio disponible.
            </p>
            <Link
              href="/turnos/buscar"
              className="inline-block px-5 py-2.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
            >
              Buscar turnos
            </Link>
          </div>
        )}

        {upcoming.length > 0 && (
          <Section title="Próximos">
            {upcoming.map((r) => (
              <AppointmentCard key={r.appointment.id} row={r} />
            ))}
          </Section>
        )}

        {past.length > 0 && (
          <Section title="Pasados">
            {past.map((r) => (
              <AppointmentCard key={r.appointment.id} row={r} />
            ))}
          </Section>
        )}

        {cancelled.length > 0 && (
          <Section title="Cancelados">
            {cancelled.map((r) => (
              <AppointmentCard key={r.appointment.id} row={r} />
            ))}
          </Section>
        )}

        <div className="pt-4 border-t border-gob-border ">
          <Link
            href="/mis-mascotas"
            className="text-sm text-gob-text-gray  underline underline-offset-4"
          >
            ← Volver a mis mascotas
          </Link>
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-gob-text ">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

// AppointmentRow + AppointmentCard moved to components/AppointmentCard.tsx
// — shared with /inicio dashboard. Import re-exported at top.
