"use client";

import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDateTime } from "@/lib/format";

type Event = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
};

type Props = {
  events: Event[];
};

export function EventTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin eventos todavía.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => {
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
  );
}
