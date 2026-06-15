// PetUpcomingCareSection — Cuidados próximos section for the pet profile v2 page.
//
// Server component wrapper that consolidates vaccine reminders, upcoming
// appointments, and pending medication doses under a single "Cuidados próximos"
// heading. Items sorted by dueAt ASC. Shows at most 5 items; a "Ver todos →"
// link renders when more exist.

import type { ActiveReminderRow } from "@/lib/owner-dashboard";
import Link from "next/link";
import { type UpcomingCareItem, mergeUpcomingItems } from "./PetUpcomingCareSection.helpers";

// Re-export for callers that need the type.
export type { UpcomingCareItem };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Appointment {
  publicToken: string;
  status: string;
  offeringDisplayName: string;
  slotStartsAt: Date;
}

interface MedicationDose {
  reminderId: string;
  drugName: string;
  dueAt: Date;
}

interface Props {
  reminders: ActiveReminderRow[];
  appointments: Appointment[];
  medicationDoses: MedicationDose[];
  petToken: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDueAt(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PetUpcomingCareSection({
  reminders,
  appointments,
  medicationDoses,
  petToken,
}: Props) {
  // Build unified item list.
  const allItems: UpcomingCareItem[] = [
    ...reminders.map(
      (r): UpcomingCareItem => ({
        id: `reminder-${r.reminderId}`,
        kind: "reminder",
        label: r.title,
        dueAt: r.dueAt instanceof Date ? r.dueAt : new Date(r.dueAt),
      }),
    ),
    ...appointments.map(
      (a): UpcomingCareItem => ({
        id: `appt-${a.publicToken}`,
        kind: "appointment",
        label: a.offeringDisplayName,
        dueAt: a.slotStartsAt instanceof Date ? a.slotStartsAt : new Date(a.slotStartsAt),
      }),
    ),
    ...medicationDoses.map(
      (d): UpcomingCareItem => ({
        id: `med-${d.reminderId}`,
        kind: "medication",
        label: d.drugName,
        dueAt: d.dueAt instanceof Date ? d.dueAt : new Date(d.dueAt),
      }),
    ),
  ];

  const { visible, hasMore } = mergeUpcomingItems(allItems);

  if (visible.length === 0) {
    return (
      <section
        aria-labelledby="pp-cuidados-h"
        className="rounded-2xl border border-ln-line bg-ln-card p-4  "
      >
        <h2 id="pp-cuidados-h" className="mb-3 text-base font-semibold text-ln-ink ">
          Cuidados próximos
        </h2>
        <div className="rounded-xl border border-dashed border-ln-line-strong p-5 text-center">
          <p className="text-sm text-ln-mute ">Sin cuidados programados.</p>
          <p className="mt-1 text-xs text-ln-mute ">
            Registrá vacunas, turnos o medicaciones para que aparezcan acá.
          </p>
          <Link
            href={`/mis-mascotas/${petToken}/vacunas/programar`}
            className="mt-3 inline-block text-xs font-medium text-ln-azul hover:underline"
          >
            Programar vacuna →
          </Link>
        </div>
      </section>
    );
  }

  const kindIcon: Record<UpcomingCareItem["kind"], string> = {
    reminder: "💉",
    appointment: "🏥",
    medication: "💊",
  };

  return (
    <section
      aria-labelledby="pp-cuidados-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-cuidados-h" className="text-base font-semibold text-ln-ink ">
          Cuidados próximos
        </h2>
        {hasMore && (
          <Link
            href={`/mis-mascotas/${petToken}/cuidados`}
            className="text-xs font-medium text-ln-azul hover:underline"
          >
            Ver todos →
          </Link>
        )}
      </div>

      <ul className="divide-y divide-ln-line ">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ln-stripe text-sm "
            >
              {kindIcon[item.kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ln-ink ">{item.label}</span>
              <span className="mt-0.5 block text-xs text-ln-mute ">{formatDueAt(item.dueAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
