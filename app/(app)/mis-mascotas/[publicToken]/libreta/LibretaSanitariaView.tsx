// Libreta sanitaria view — Libreta Nacional redesign (handoff §4).
//
// Section 01 Registro de vacunación → LnVaccineLedger (ruled table).
// Section 02 Historial clínico → LnTimeline (dot+icon by type, vertical connector).
// Footer: "Asientos firmados digitalmente · inmutables" + export.
//
// Render logic (groupedEvents, agrupada/cronologica toggle) is UNCHANGED.

import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnVaccineLedger, type LnVaccineRow } from "@/components/ui/Ledger";
import { eventPayloadSummary } from "@/lib/events/events";
import {
  LIBRETA_GROUPS,
  LIBRETA_GROUP_LABELS,
  type LibretaGroupKey,
  libretaConfidenceTier,
} from "@/lib/infra/libreta-sanitaria";
import { notificableEno, tipoEventoLabel, tipoEventoNorma } from "@/lib/reference/sanitary-vocab";
import { formatDate } from "@/lib/utils/format";

type Event = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  tipoEventoCode?: string | null;
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

  // Separate vaccination group from the rest for the LnVaccineLedger treatment
  const vaccinationEvents = groupedEvents.vacunas ?? [];
  const otherGroups = nonEmpty.filter((g) => g !== "vacunas");

  return (
    <div className="space-y-[32px]">
      {/* Section 01 — Vaccination ledger */}
      {vaccinationEvents.length > 0 && (
        <section>
          <LnSectionHead
            num="01"
            title="Registro de vacunación"
            meta="Asientos certificados"
            className="mb-4"
          />
          <LnVaccineLedger rows={vaccinationEvents.map(eventToVaccineRow)} />
        </section>
      )}

      {/* Section 02+ — Clinical history as timeline */}
      {otherGroups.map((group, idx) => (
        <section key={group}>
          <LnSectionHead
            num={String(idx + (vaccinationEvents.length > 0 ? 2 : 1)).padStart(2, "0")}
            title={LIBRETA_GROUP_LABELS[group]}
            meta={`${groupedEvents[group].length} asiento${groupedEvents[group].length !== 1 ? "s" : ""}`}
            className="mb-4"
          />
          <LnTimelineSection events={groupedEvents[group]} publicToken={publicToken} />
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vaccination row adapter
// ---------------------------------------------------------------------------

function eventToVaccineRow(event: Event): LnVaccineRow {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const occurredDate =
    event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
  const appliedAt = occurredDate.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const nextDueRaw = p.next_due_at ?? p.next_due ?? null;
  const nextDue =
    nextDueRaw && typeof nextDueRaw === "string"
      ? new Date(nextDueRaw).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : undefined;

  // Derive vstamp status from next_due_at
  let status: "ok" | "due" | "over" = "ok";
  if (nextDueRaw) {
    const next = new Date(nextDueRaw as string);
    const now = new Date();
    const daysUntil = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntil < 0) status = "over";
    else if (daysUntil < 30) status = "due";
    else status = "ok";
  }

  const vetName =
    typeof p.administered_by === "string"
      ? p.administered_by
      : typeof p.vet_name === "string"
        ? p.vet_name
        : "—";

  const vetLicense = typeof p.vet_license === "string" ? p.vet_license : undefined;

  return {
    id: event.id,
    name:
      typeof p.vaccine_name === "string"
        ? p.vaccine_name
        : (tipoEventoLabel(event.tipoEventoCode) ?? "Vacuna"),
    dose: typeof p.dose === "string" ? p.dose : undefined,
    appliedAt,
    nextDue,
    status,
    vet: vetName,
    vetLicense,
  };
}

// ---------------------------------------------------------------------------
// Timeline section for clinical events
// ---------------------------------------------------------------------------

function eventColor(eventType: string): string {
  switch (eventType) {
    case "weight_recorded":
      return "var(--color-ln-celeste)";
    case "vet_visit_logged":
      return "var(--color-ln-ok)";
    case "medication_started":
    case "medication_stopped":
      return "#6b4ea8";
    case "note_added":
      return "var(--color-ln-warn)";
    case "sterilization_performed":
      return "var(--color-ln-rosa)";
    case "microchip_implanted":
      return "var(--color-ln-azul)";
    case "death_recorded":
      return "var(--color-ln-mute)";
    default:
      return "var(--color-ln-celeste)";
  }
}

function eventIcon(eventType: string): string {
  switch (eventType) {
    case "weight_recorded":
      return "⚖️";
    case "vet_visit_logged":
      return "🩺";
    case "medication_started":
      return "💊";
    case "medication_stopped":
      return "✓";
    case "note_added":
      return "📝";
    case "sterilization_performed":
      return "✂️";
    case "microchip_implanted":
      return "🔖";
    case "clinical_info_logged":
      return "📋";
    case "death_recorded":
      return "🍃";
    default:
      return "·";
  }
}

function LnTimelineSection({
  events,
  publicToken: _publicToken,
}: {
  events: Event[];
  publicToken: string;
}) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-0">
      {events.map((event, i) => {
        const summary = eventPayloadSummary(event.eventType, event.payload);
        const senasaLabel = tipoEventoLabel(event.tipoEventoCode);
        const senasaNorma = tipoEventoNorma(event.tipoEventoCode);
        const isEno = notificableEno(event.tipoEventoCode);
        const confidenceTier = libretaConfidenceTier({
          authorRole: event.authorRole,
          authorVerified: event.authorVerified,
          authorOrganizationId: event.authorOrganizationId,
          payload: (event.payload ?? {}) as Record<string, unknown>,
        });

        const date =
          event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
        const dayStr = date.getDate().toString().padStart(2, "0");
        const monthStr = date
          .toLocaleDateString("es-AR", { month: "short" })
          .toUpperCase()
          .replace(".", "");
        const yearStr = date.getFullYear();

        const color = eventColor(event.eventType);
        const icon = eventIcon(event.eventType);
        const isLast = i === events.length - 1;

        return (
          <div key={event.id} className="grid" style={{ gridTemplateColumns: "96px 34px 1fr" }}>
            {/* Date */}
            <div
              className="flex flex-col items-end justify-start pr-4 pt-[11px]"
              style={{ fontFamily: "var(--font-ln-mono)" }}
            >
              <span
                className="text-[11px] font-semibold leading-tight"
                style={{ color: "var(--color-ln-ink-2)" }}
              >
                {dayStr} {monthStr}
              </span>
              <span className="text-xs" style={{ color: "var(--color-ln-mute)" }}>
                {yearStr}
              </span>
            </div>

            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div
                className="mt-[11px] flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-full border-2 text-sm"
                style={{
                  borderColor: color,
                  color,
                  background: "var(--color-ln-card)",
                }}
              >
                {icon}
              </div>
              {!isLast && (
                <div
                  className="w-px flex-1"
                  style={{
                    background: "var(--color-ln-line-2)",
                    minHeight: 18,
                  }}
                />
              )}
            </div>

            {/* Card */}
            <div className="ml-3.5 mb-3.5 mt-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-3.5 py-[11px]">
              <div className="flex flex-wrap items-center gap-[7px]">
                <p
                  className="m-0 text-[13px] font-semibold"
                  style={{ color: "var(--color-ln-ink)" }}
                >
                  {senasaLabel ?? summary.primary ?? event.eventType}
                </p>
                <ConfidenceBadge tier={confidenceTier} />
                {isEno && (
                  <span
                    className="rounded-full border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] px-[7px] py-[1px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.08em]"
                    style={{ color: "var(--color-ln-warn)" }}
                    title="Notificable ENO (Enfermedades de Notificación Obligatoria, Ley 15.465)"
                  >
                    ENO
                  </span>
                )}
              </div>
              {senasaNorma && (
                <p
                  className="mt-0.5 font-[var(--font-ln-mono)] text-[10.5px]"
                  style={{ color: "var(--color-ln-mute)" }}
                >
                  {senasaNorma}
                </p>
              )}
              {summary.secondary && (
                <p className="mt-0.5 text-sm" style={{ color: "var(--color-ln-ink-2)" }}>
                  {summary.secondary}
                </p>
              )}
              {event.notes && (
                <p className="mt-[3px] text-sm italic" style={{ color: "var(--color-ln-mute)" }}>
                  {event.notes}
                </p>
              )}
              <div
                className="mt-2 flex flex-wrap items-center gap-3 font-[var(--font-ln-mono)] text-[10.5px]"
                style={{ color: "var(--color-ln-mute)" }}
              >
                <time dateTime={date.toISOString()}>{formatDate(event.occurredAt)}</time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chronological view
// ---------------------------------------------------------------------------

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

  // Separate vaccine events for ledger, rest for timeline
  const vaccineEvents = all.filter((e) => e.eventType === "vaccination_administered");
  const otherEvents = all.filter((e) => e.eventType !== "vaccination_administered");

  return (
    <div className="space-y-[32px]">
      {vaccineEvents.length > 0 && (
        <section>
          <LnSectionHead num="01" title="Registro de vacunación" className="mb-4" />
          <LnVaccineLedger rows={vaccineEvents.map(eventToVaccineRow)} />
        </section>
      )}
      {otherEvents.length > 0 && (
        <section>
          <LnSectionHead
            num="02"
            title="Historial clínico"
            meta="orden cronológico"
            className="mb-4"
          />
          <LnTimelineSection events={otherEvents} publicToken={publicToken} />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyLibreta() {
  return (
    <LnEmptyState
      variant="dashed"
      title="Todavía no hay registros en esta libreta."
      description="Cuando agregues una vacuna, un peso o una visita al vet, va a aparecer acá."
    />
  );
}
