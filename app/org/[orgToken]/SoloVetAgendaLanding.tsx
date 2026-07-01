// SoloVetAgendaLanding — agenda-first landing for a one-person clinic (four-actor
// lean IA critique §3). A solo practitioner lands on today's appointments — the
// issuer's daily loop — instead of the shelter-oriented ops dashboard. Each row
// routes into the existing attend flow (/org/[orgToken]/agenda/turnos/[token] →
// AttendanceFormDispatcher), which already emits vet-authored clinical events.
//
// Operator skin (ln-op-* / Op* kit). Read-only presentational server component;
// the org nav rail (from the layout) still exposes every other section, so
// nothing is removed — the landing is just re-ranked to the agenda.

import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import type { TodayAgendaItem } from "@/lib/org-dashboard";
import { findServiceKind } from "@/lib/reference/service-kinds";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  attended: "Atendido",
  no_show: "No asistió",
  cancelled_by_owner: "Cancelado",
  cancelled_by_org: "Cancelado",
};

function formatTime(value: Date): string {
  return new Date(value).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function SoloVetAgendaLanding({
  orgToken,
  orgName,
  appointments,
}: {
  orgToken: string;
  orgName: string;
  appointments: TodayAgendaItem[];
}) {
  const todayLabel = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-ln-op-mute">{orgName}</p>
        <h1 className="text-xl font-semibold text-ln-op-ink">Agenda de hoy</h1>
        <p className="text-sm capitalize text-ln-op-mute">{todayLabel}</p>
      </header>

      <OpCard>
        <OpCardHead title={`Turnos de hoy · ${appointments.length}`} />
        <OpCardBody className="p-0">
          {appointments.length === 0 ? (
            <p className="p-4 text-center text-sm text-ln-op-mute">
              No hay turnos para hoy. Cuando alguien reserve, aparece acá.
            </p>
          ) : (
            <ul className="divide-y divide-ln-op-line">
              {appointments.map((appointment) => {
                const kind =
                  findServiceKind(appointment.serviceKind)?.label ?? appointment.serviceKind;
                return (
                  <li key={appointment.appointmentToken}>
                    <Link
                      href={`/org/${orgToken}/agenda/turnos/${appointment.appointmentToken}`}
                      className="flex items-center gap-4 px-4 py-3 no-underline transition-colors hover:bg-ln-op-stripe"
                    >
                      <span className="font-mono text-sm font-semibold tabular-nums text-ln-op-ink">
                        {formatTime(appointment.startsAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ln-op-ink">
                          {appointment.petName} · {kind}
                        </span>
                        {appointment.ownerName && (
                          <span className="block truncate text-xs text-ln-op-mute">
                            {appointment.ownerName}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-ln-op-mute">
                        {STATUS_LABELS[appointment.status] ?? appointment.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </OpCardBody>
      </OpCard>

      <Link
        href={`/org/${orgToken}/agenda`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ln-op-azul hover:underline"
      >
        Ver agenda completa →
      </Link>
    </div>
  );
}
