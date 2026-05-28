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

  // Self-scans are excluded at the DB level (lib/events.excludeSelfScansClause)
  // so no client-side filtering needed here.
  const filteredEvents =
    selectedTypes.size === 0 ? events : events.filter((e) => selectedTypes.has(e.eventType));

  if (events.length === 0) {
    return <p className="text-sm text-gob-text-muted ">Sin eventos todavía.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {effectiveChips.map((chip) => {
          const isSelected = selectedTypes.has(chip.type);
          return (
            <button
              key={chip.type}
              type="button"
              onClick={() => toggleType(chip.type)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "px-3 py-1 rounded-full text-xs font-medium transition-colors bg-gob-primary text-white  "
                  : "px-3 py-1 rounded-full text-xs font-medium transition-colors border border-gob-border  text-gob-text-gray  hover:bg-gob-surface-alt "
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {filteredEvents.length === 0 ? (
        <p className="text-sm text-gob-text-muted ">Sin eventos de este tipo.</p>
      ) : (
        <ol className="space-y-3">
          {filteredEvents.map((event) => {
            const summary = eventPayloadSummary(event.eventType, event.payload);
            return (
              <li key={event.id} className="border border-gob-border  rounded-xl p-4 space-y-2">
                {publicToken ? (
                  <Link
                    href={`/mis-mascotas/${publicToken}/eventos/${event.id}`}
                    className="flex items-start justify-between gap-3 -mx-1 px-1 py-0.5 rounded-md hover:bg-gob-surface-alt  transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-gob-text ">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-gob-text-muted ">{summary.secondary}</p>
                      )}
                    </div>
                    <time className="text-xs text-gob-text-muted  shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-gob-text ">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-gob-text-muted ">{summary.secondary}</p>
                      )}
                    </div>
                    <time className="text-xs text-gob-text-muted  shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </div>
                )}
                {event.notes && <p className="text-sm text-gob-text-gray ">{event.notes}</p>}
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
                      className="max-h-48 w-auto rounded-lg border border-gob-border  object-cover"
                    />
                  </a>
                )}
                <details className="text-xs text-gob-text-muted ">
                  <summary className="cursor-pointer select-none hover:text-gob-text-gray ">
                    Ver detalle técnico
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-gob-surface-alt  overflow-x-auto text-[11px] leading-relaxed">
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
