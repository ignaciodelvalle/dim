"use client";

import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { useState } from "react";

// Default chip set — used by /historial and any caller that does not pass
// a narrower subset. Libreta-specific surfaces import LIBRETA_FILTER_CHIPS
// from @/lib/libreta-sanitaria instead.
export const DEFAULT_FILTER_CHIPS: ReadonlyArray<{ type: string; label: string }> = [
  { type: "vaccination_administered", label: "Vacunas" },
  { type: "note_added", label: "Notas" },
  { type: "weight_recorded", label: "Peso" },
  { type: "vet_visit_logged", label: "Visitas" },
  { type: "deworming_administered", label: "Antiparasitarios" },
  { type: "sterilization_performed", label: "Esterilización" },
  { type: "microchip_implanted", label: "Microchip" },
  { type: "medication_started", label: "Medicación · inicio" },
  { type: "medication_stopped", label: "Medicación · fin" },
  { type: "medication_dose_taken", label: "Dosis dadas" },
  { type: "death_recorded", label: "Fallecimiento" },
  { type: "clinical_info_logged", label: "Información clínica" },
  { type: "maltreatment_reported", label: "Maltrato" },
  { type: "abandonment_reported", label: "Abandono" },
  { type: "symptom_observed", label: "Síntomas" },
];

type Event = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  attachmentUrl: string | null;
};

type Props = {
  events: Event[];
  // Token of the pet that owns these events. Used to build links to the
  // per-event detail screen (/mis-mascotas/{publicToken}/eventos/{eventId}).
  // Optional so legacy callers keep compiling; when absent, rows render as
  // before without the detail link.
  publicToken?: string;
  // Optional narrower subset of filter chips (e.g. LIBRETA_FILTER_CHIPS).
  // When absent, DEFAULT_FILTER_CHIPS is used.
  chips?: ReadonlyArray<{ type: string; label: string }>;
};

export function EventTimeline({ events, publicToken, chips }: Props) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const effectiveChips = chips ?? DEFAULT_FILTER_CHIPS;

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Per-type counts drive chip badges and let us hide chips with no events.
  // Chip layout follows the mockup: leading "Todos N" pill + only the chip
  // types that have at least one matching event in this pet's history.
  const countsByType = new Map<string, number>();
  for (const e of events) {
    countsByType.set(e.eventType, (countsByType.get(e.eventType) ?? 0) + 1);
  }
  const visibleChips = effectiveChips.filter((c) => (countsByType.get(c.type) ?? 0) > 0);

  // Self-scans are excluded at the DB level (lib/events.excludeSelfScansClause)
  // so no client-side filtering needed here.
  const filteredEvents =
    selectedTypes.size === 0 ? events : events.filter((e) => selectedTypes.has(e.eventType));

  if (events.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin eventos todavía.</p>;
  }

  const allSelected = selectedTypes.size === 0;
  const chipClass = (selected: boolean) =>
    selected
      ? "px-3 py-1 rounded-full text-xs font-medium transition-colors bg-neutral-900 text-white dark:bg-neutral-50 dark:text-neutral-900"
      : "px-3 py-1 rounded-full text-xs font-medium transition-colors border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          key="__all"
          type="button"
          onClick={() => setSelectedTypes(new Set())}
          aria-pressed={allSelected}
          className={chipClass(allSelected)}
        >
          Todos {events.length}
        </button>
        {visibleChips.map((chip) => {
          const isSelected = selectedTypes.has(chip.type);
          const count = countsByType.get(chip.type) ?? 0;
          return (
            <button
              key={chip.type}
              type="button"
              onClick={() => toggleType(chip.type)}
              aria-pressed={isSelected}
              className={chipClass(isSelected)}
            >
              {chip.label} {count}
            </button>
          );
        })}
      </div>
      {filteredEvents.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin eventos de este tipo.</p>
      ) : (
        <ol className="space-y-3">
          {filteredEvents.map((event) => {
            const summary = eventPayloadSummary(event.eventType, event.payload);
            return (
              <li
                key={event.id}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2"
              >
                {publicToken ? (
                  <Link
                    href={`/mis-mascotas/${publicToken}/eventos/${event.id}`}
                    className="flex items-start justify-between gap-3 -mx-1 px-1 py-0.5 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500">
                          {summary.secondary}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-neutral-500 dark:text-neutral-500 shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500">
                          {summary.secondary}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-neutral-500 dark:text-neutral-500 shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </div>
                )}
                {event.notes && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{event.notes}</p>
                )}
                {event.attachmentUrl && (
                  <a
                    href={event.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={event.attachmentUrl}
                      alt="Foto adjunta"
                      className="max-h-48 w-auto rounded-lg border border-neutral-200 dark:border-neutral-800 object-cover"
                    />
                  </a>
                )}
                <details className="text-xs text-neutral-500 dark:text-neutral-500">
                  <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">
                    Ver detalle técnico
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
