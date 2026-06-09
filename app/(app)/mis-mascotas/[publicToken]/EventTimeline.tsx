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

  // Per-type counts drive the chip badges and hide chips with no events.
  // Layout follows the mockup: a leading "Todos N" pill + only the chip
  // types that have at least one event in this pet's history.
  const countsByType = new Map<string, number>();
  for (const e of events) {
    countsByType.set(e.eventType, (countsByType.get(e.eventType) ?? 0) + 1);
  }
  const visibleChips = effectiveChips.filter((c) => (countsByType.get(c.type) ?? 0) > 0);
  const allSelected = selectedTypes.size === 0;
  const chipClass = (selected: boolean) =>
    selected
      ? "px-3 py-1 rounded-full text-xs font-medium transition-colors bg-[var(--color-ln-azul)] text-white"
      : "px-3 py-1 rounded-full text-xs font-medium transition-colors border border-[var(--color-ln-line)] text-[var(--color-ln-ink-2)] hover:bg-[var(--color-ln-stripe)]";

  if (events.length === 0) {
    return <p className="text-sm text-[var(--color-ln-mute)]">Sin eventos todavía.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
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
        <p className="text-sm text-[var(--color-ln-mute)]">Sin eventos de este tipo.</p>
      ) : (
        <ol className="space-y-3">
          {filteredEvents.map((event) => {
            const summary = eventPayloadSummary(event.eventType, event.payload);
            return (
              <li
                key={event.id}
                className="border border-[var(--color-ln-line)] rounded-[4px] p-4 space-y-2"
              >
                {publicToken ? (
                  <Link
                    href={`/mis-mascotas/${publicToken}/eventos/${event.id}`}
                    className="flex items-start justify-between gap-3 -mx-1 px-1 py-0.5 rounded-md hover:bg-[var(--color-ln-stripe)] transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-[var(--color-ln-ink)]">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-[var(--color-ln-mute)]">{summary.secondary}</p>
                      )}
                    </div>
                    <time className="text-xs text-[var(--color-ln-mute)] shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-[var(--color-ln-ink)]">
                        {summary.primary ?? eventTypeLabel(event.eventType)}
                      </p>
                      {summary.secondary && (
                        <p className="text-xs text-[var(--color-ln-mute)]">{summary.secondary}</p>
                      )}
                    </div>
                    <time className="text-xs text-[var(--color-ln-mute)] shrink-0">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </div>
                )}
                {event.notes && (
                  <p className="text-sm text-[var(--color-ln-ink-2)]">{event.notes}</p>
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
                      className="max-h-48 w-auto rounded-[4px] border border-[var(--color-ln-line)] object-cover"
                    />
                  </a>
                )}
                <details className="text-xs text-[var(--color-ln-mute)]">
                  <summary className="cursor-pointer select-none hover:text-[var(--color-ln-ink-2)]">
                    Ver detalle técnico
                  </summary>
                  <pre className="mt-2 p-3 rounded-[4px] bg-[var(--color-ln-stripe)] overflow-x-auto text-[11px] leading-relaxed">
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
