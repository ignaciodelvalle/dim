import Link from "next/link";

import { AppointmentCard } from "@/components/AppointmentCard";
import { LnEmptyState } from "@/components/ui/EmptyState";
import type { UpcomingAppointment } from "@/lib/analytics/owner-dashboard";

export function AppointmentsWidget({ appointments }: { appointments: UpcomingAppointment[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Próximos turnos</h2>
        <Link
          href="/mis-turnos"
          className="text-sm text-[var(--color-ln-ink-2)] underline underline-offset-4 hover:text-[var(--color-ln-ink)]"
        >
          Ver todos →
        </Link>
      </div>
      {appointments.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          title="No tenés turnos próximos."
          action={
            <Link
              href="/turnos/buscar"
              className="text-xs text-[var(--color-ln-ink-2)] underline underline-offset-4"
            >
              Buscar turno disponible →
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {appointments.map((appt) => (
            <AppointmentCard key={appt.appointment.publicToken} row={appt} />
          ))}
        </ul>
      )}
    </section>
  );
}
