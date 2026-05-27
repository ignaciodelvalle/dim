import { EmptyState } from "@/components/poncho";
import { formatDateTime } from "@/lib/format";
import type { TimelineEvent } from "@/lib/govt-dashboards";

// Dot color per event kind — maps to a Tailwind background class.
const KIND_DOT: Record<string, string> = {
  created: "bg-neutral-400",
  triaged: "bg-blue-500",
  assigned: "bg-indigo-500",
  in_progress: "bg-indigo-500",
  closed: "bg-emerald-500",
  invalid: "bg-neutral-500",
  duplicate: "bg-neutral-500",
  pet_event: "bg-sky-400",
};

function kindDot(kind: string): string {
  return KIND_DOT[kind] ?? "bg-neutral-400";
}

type TimelineProps = {
  events: TimelineEvent[];
};

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="Sin eventos registrados"
        description="No hay eventos en la línea de tiempo de esta denuncia."
      />
    );
  }

  return (
    <ol className="relative border-l border-gob-border space-y-6 pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          {/* Timeline dot */}
          <span
            className={`absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full border-2 border-white ${kindDot(event.kind)}`}
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <p className="text-xs text-gob-text-muted tabular-nums">
              {formatDateTime(event.occurredAt)}
              {event.actorName && (
                <span className="ml-1 text-gob-text-muted">· {event.actorName}</span>
              )}
            </p>
            <p className="text-sm text-gob-text">{event.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
