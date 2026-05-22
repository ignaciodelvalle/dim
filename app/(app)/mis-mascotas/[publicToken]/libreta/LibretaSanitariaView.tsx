// Libreta sanitaria view — renders pre-grouped events as collapsible sections
// (grouped by clinical purpose) or as a flat chronological list. Grouping
// happens in lib/libreta-sanitaria.ts; this component is render-only.

import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { eventPayloadSummary } from "@/lib/events";
import { formatDate } from "@/lib/format";
import {
  LIBRETA_GROUPS,
  LIBRETA_GROUP_LABELS,
  libretaConfidenceTier,
  type LibretaGroupKey,
} from "@/lib/libreta-sanitaria";

type Event = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  // Provenance fields — used to derive confidence tier (A3/plan 2026-05-22).
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
};

type Props = {
  groupedEvents: Record<LibretaGroupKey, Event[]>;
  publicToken: string;
  vista: "agrupada" | "cronologica";
};

export function LibretaSanitariaView({ groupedEvents, publicToken, vista }: Props) {
  if (vista === "cronologica") {
    return <ChronologicalView groupedEvents={groupedEvents} publicToken={publicToken} />;
  }

  const nonEmpty = LIBRETA_GROUPS.filter((g) => groupedEvents[g].length > 0);
  if (nonEmpty.length === 0) return <EmptyLibreta />;

  return (
    <div className="space-y-8">
      {nonEmpty.map((group) => (
        <LibretaGroupSection
          key={group}
          group={group}
          events={groupedEvents[group]}
          publicToken={publicToken}
        />
      ))}
    </div>
  );
}

function LibretaGroupSection({
  group,
  events,
  publicToken,
}: {
  group: LibretaGroupKey;
  events: Event[];
  publicToken: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
        {LIBRETA_GROUP_LABELS[group]}{" "}
        <span className="text-sm font-normal text-neutral-500">({events.length})</span>
      </h2>
      <ul className="space-y-1">
        {events.map((event) => (
          <LibretaEntry key={event.id} event={event} publicToken={publicToken} />
        ))}
      </ul>
    </section>
  );
}

function LibretaEntry({ event, publicToken: _publicToken }: { event: Event; publicToken: string }) {
  const summary = eventPayloadSummary(event.eventType, event.payload);
  const occurredIso =
    typeof event.occurredAt === "string" ? event.occurredAt : event.occurredAt.toISOString();
  const confidenceTier = libretaConfidenceTier({
    authorRole: event.authorRole,
    authorVerified: event.authorVerified,
    authorOrganizationId: event.authorOrganizationId,
    payload: (event.payload ?? {}) as Record<string, unknown>,
  });
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 border-b border-neutral-100 dark:border-neutral-900 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {summary.primary ?? event.eventType}
          </p>
          <ConfidenceBadge tier={confidenceTier} />
        </div>
        {summary.secondary && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{summary.secondary}</p>
        )}
        {event.notes && (
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 italic">
            {event.notes}
          </p>
        )}
      </div>
      <time
        className="text-xs text-neutral-500 dark:text-neutral-500 tabular-nums whitespace-nowrap"
        dateTime={occurredIso}
      >
        {formatDate(event.occurredAt)}
      </time>
    </li>
  );
}

function ChronologicalView({
  groupedEvents,
  publicToken,
}: {
  groupedEvents: Record<LibretaGroupKey, Event[]>;
  publicToken: string;
}) {
  const occurredMs = (e: Event): number =>
    e.occurredAt instanceof Date ? e.occurredAt.getTime() : new Date(e.occurredAt).getTime();
  const all = LIBRETA_GROUPS.flatMap((g) => groupedEvents[g]).sort(
    (a, b) => occurredMs(b) - occurredMs(a),
  );
  if (all.length === 0) return <EmptyLibreta />;
  return (
    <ul className="space-y-1">
      {all.map((event) => (
        <LibretaEntry key={event.id} event={event} publicToken={publicToken} />
      ))}
    </ul>
  );
}

function EmptyLibreta() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center">
      <p className="text-neutral-700 dark:text-neutral-300">
        Todavía no hay registros en esta libreta.
      </p>
      <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
        Cuando agregues una vacuna, un peso o una visita al vet, va a aparecer acá.
      </p>
    </div>
  );
}
