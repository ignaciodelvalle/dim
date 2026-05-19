import Link from "next/link";

import { findServiceKind } from "@/lib/service-kinds";

// Shared appointment row. Used by /mis-turnos (full list) and /inicio
// (dashboard widget, upcoming top 5). The shape covers both
// organization-hosted appointments (offering.organizationId set) and
// independent vet provider appointments (provider set).

export type AppointmentRow = {
  appointment: { publicToken: string; status: string };
  slot: { startsAt: Date };
  offering: { displayName: string; serviceKind: string; organizationId: string | null };
  pet: { name: string };
  org: { displayName: string } | null;
  provider: { displayName: string } | null;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  attended: {
    label: "Asistido",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  no_show: {
    label: "No asistió",
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export function AppointmentCard({ row }: { row: AppointmentRow }) {
  const { appointment, slot, offering, pet, org, provider } = row;
  const kindDef = findServiceKind(offering.serviceKind);

  const dateLabel = slot.startsAt.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = slot.startsAt.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });

  const providerLabel =
    offering.organizationId && org
      ? org.displayName
      : provider
        ? `Dr/a. ${provider.displayName.split(" ")[0]}`
        : "Profesional independiente";

  const statusBadge = STATUS_BADGE[appointment.status] ?? STATUS_BADGE.confirmed;

  return (
    <li>
      <Link
        href={`/mis-turnos/${appointment.publicToken}`}
        className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-neutral-900 dark:text-neutral-50 truncate">
              {offering.displayName}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {pet.name} · {providerLabel}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 capitalize">
              {dateLabel} · {timeLabel}
            </p>
            {kindDef && (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">{kindDef.label}</p>
            )}
          </div>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>
      </Link>
    </li>
  );
}
