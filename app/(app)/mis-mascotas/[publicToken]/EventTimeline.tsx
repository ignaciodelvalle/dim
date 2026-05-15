"use client";

import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDateTime } from "@/lib/format";
import { useState } from "react";

const FILTER_CHIPS: ReadonlyArray<{ type: string; label: string }> = [
  { type: "vaccination_administered", label: "Vacunas" },
  { type: "note_added", label: "Notas" },
  { type: "weight_recorded", label: "Peso" },
  { type: "vet_visit_logged", label: "Visitas" },
  { type: "deworming_administered", label: "Antiparasitarios" },
  { type: "sterilization_performed", label: "Esterilización" },
  { type: "microchip_implanted", label: "Microchip" },
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
};

export function EventTimeline({ events }: Props) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filteredEvents =
    selectedTypes.size === 0 ? events : events.filter((e) => selectedTypes.has(e.eventType));

  if (events.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin eventos todavía.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const isSelected = selectedTypes.has(chip.type);
          return (
            <button
              key={chip.type}
              type="button"
              onClick={() => toggleType(chip.type)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "px-3 py-1 rounded-full text-xs font-medium transition-colors bg-neutral-900 text-white dark:bg-neutral-50 dark:text-neutral-900"
                  : "px-3 py-1 rounded-full text-xs font-medium transition-colors border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              }
            >
              {chip.label}
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
