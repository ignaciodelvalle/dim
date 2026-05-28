import { EmptyState } from "@/components/poncho";
import { formatDateTime } from "@/lib/format";
import type { TimelineEvent } from "@/lib/govt-dashboards";

// Dot color per event kind — maps to a Tailwind background class.
const KIND_DOT: Record<string, string> = {
  created: "bg-gob-border-strong",
  triaged: "bg-gob-info",
  assigned: "bg-gob-primary",
  in_progress: "bg-gob-primary",
  closed: "bg-gob-success",
  invalid: "bg-gob-border-strong",
  duplicate: "bg-gob-border-strong",
  pet_event: "bg-gob-info",
};

function kindDot(kind: string): string {
  return KIND_DOT[kind] ?? "bg-gob-border-strong";
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
    <ol className="relative border-l border-gob-border  space-y-6 pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          {/* Timeline dot */}
          <span
            className={`absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full border-2 border-white  ${kindDot(event.kind)}`}
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <p className="text-xs text-gob-text-muted  tabular-nums">
              {formatDateTime(event.occurredAt)}
              {event.actorName && (
                <span className="ml-1 text-gob-text-muted ">· {event.actorName}</span>
              )}
            </p>
            <p className="text-sm text-gob-text ">{event.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
