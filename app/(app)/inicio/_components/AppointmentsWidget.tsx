import Link from "next/link";

import { AppointmentCard } from "@/components/AppointmentCard";
import type { UpcomingAppointment } from "@/lib/owner-dashboard";

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
        <div className="border border-dashed border-[var(--color-ln-line-strong)] rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-[var(--color-ln-mute)]">No tenés turnos próximos.</p>
          <Link
            href="/turnos/buscar"
            className="inline-block text-xs text-[var(--color-ln-ink-2)] underline underline-offset-4"
          >
            Buscar turno disponible →
          </Link>
        </div>
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
