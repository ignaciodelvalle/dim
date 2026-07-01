// VacunaTimelineDot — single vertical timeline item for the vaccine history.
// Shows a ConfidenceBadge per entry (plan §A.6, 2026-05-22).
//
// Layout:
//   [vertical line]
//   [dot 16×16 — green if recorded < 1y ago, gray otherwise]
//   [card: date | vaccine name, brand, batch, administered_by, next_due_at]

import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import type { ConfidenceTier } from "@/lib/events/event-confidence";

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatDate(d: Date): string {
  return `${d.getDate()} de ${MONTH_NAMES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

type Props = {
  recordedAt: Date;
  vaccineName: string;
  brand?: string | null;
  batch?: string | null;
  administeredBy?: string | null;
  nextDueAt?: Date | null;
  isFirst?: boolean;
  isLast?: boolean;
  confidenceTier?: ConfidenceTier | null;
};

export function VacunaTimelineDot({
  recordedAt,
  vaccineName,
  brand,
  batch,
  administeredBy,
  nextDueAt,
  isFirst = false,
  isLast = false,
  confidenceTier = null,
}: Props) {
  const isFresh = Date.now() - recordedAt.getTime() < MS_PER_YEAR;
  const dotColor = isFresh
    ? "bg-[var(--color-ln-ok)] border-[var(--color-ln-ok)]"
    : "bg-[var(--color-ln-mute)] border-[var(--color-ln-mute)]";

  return (
    <li className="relative flex gap-4">
      {/* Vertical connector line */}
      <div className="flex flex-col items-center">
        {/* Top spacer (hides top of line for first item) */}
        <div
          className={`w-px flex-none ${isFirst ? "invisible" : "bg-[var(--color-ln-line)]"}`}
          style={{ height: "0.75rem" }}
        />
        {/* Dot */}
        <div aria-hidden="true" className={`w-4 h-4 rounded-full border-2 shrink-0 ${dotColor}`} />
        {/* Bottom line (hidden for last item) */}
        <div
          className={`w-px flex-1 min-h-4 ${isLast ? "invisible" : "bg-[var(--color-ln-line)]"}`}
        />
      </div>

      {/* Content */}
      <div className="pb-6 min-w-0 flex-1">
        <div className="flex items-start gap-4">
          {/* Date column */}
          <time
            dateTime={recordedAt.toISOString()}
            className="text-xs text-[var(--color-ln-mute)] shrink-0 w-28 pt-0.5 tabular-nums"
          >
            {formatDate(recordedAt)}
          </time>

          {/* Detail block */}
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[var(--color-ln-ink)]">
                {vaccineName}
                {brand ? ` · ${brand}` : ""}
              </p>
              {confidenceTier && <ConfidenceBadge tier={confidenceTier} />}
            </div>
            <p className="text-xs text-[var(--color-ln-mute)]">
              {administeredBy
                ? `Administrada por ${administeredBy}`
                : "Administrador no especificado"}
              {batch ? ` · Lote ${batch}` : ""}
            </p>
            {nextDueAt && (
              <p className="text-xs text-[var(--color-ln-mute)]">
                Próxima dosis: {formatDate(nextDueAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
