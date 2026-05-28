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

  if (visible.length === 0) return null;

  const kindIcon: Record<UpcomingCareItem["kind"], string> = {
    reminder: "💉",
    appointment: "🏥",
    medication: "💊",
  };

  return (
    <section
      aria-labelledby="pp-cuidados-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-cuidados-h" className="text-base font-semibold text-gob-text ">
          Cuidados próximos
        </h2>
        {hasMore && (
          <Link
            href={`/mis-mascotas/${petToken}/cuidados`}
            className="text-xs font-medium text-gob-azul-link hover:underline"
          >
            Ver todos →
          </Link>
        )}
      </div>

      <ul className="divide-y divide-gob-border ">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gob-surface-alt text-sm "
            >
              {kindIcon[item.kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gob-text ">{item.label}</span>
              <span className="mt-0.5 block text-xs text-gob-text-muted ">
                {formatDueAt(item.dueAt)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
