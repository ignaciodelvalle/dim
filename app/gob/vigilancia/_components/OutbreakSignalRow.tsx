import Link from "next/link";

import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { OpCodeBadge } from "@/components/ui/dashboard";
import { computeConfidence } from "@/lib/event-confidence";
import type { SurveillanceSignal } from "@/lib/govt-dashboards";

type OutbreakSignalRowProps = {
  signal: SurveillanceSignal;
};

/** Format a Date as a human-readable "time ago" string in es-AR. */
function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD}d`;
}

/**
 * Compact card-style row for a single outbreak signal.
 * Clicking navigates to the brotes drill-down pre-filtered by signalId.
 * Shows a confidence badge derived from the event's provenance (plan §A.5).
 */
export function OutbreakSignalRow({ signal }: OutbreakSignalRowProps) {
  const href = `/gob/vigilancia/brotes?signalId=${signal.signalEventId}`;
  const confidenceTier = computeConfidence({
    authorRole: signal.authorRole,
    authorVerified: signal.authorVerified,
    authorOrganizationId: signal.authorOrganizationId,
    payload: signal.payload,
  });

  return (
    <li className="border-b border-ln-op-line-2 last:border-b-0">
      <Link
        href={href}
        className="flex items-start justify-between gap-3 px-1 py-3 rounded-[6px] hover:bg-ln-op-stripe transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul focus-visible:ring-offset-1"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ln-op-ink truncate">
              {signal.diseaseName}
            </span>
            <OpCodeBadge tone="warn">{signal.diseaseCode}</OpCodeBadge>
            <ConfidenceBadge tier={confidenceTier} />
          </div>
          <p className="text-sm text-ln-op-ink-2 truncate">
            {signal.petName} · {signal.petSpecies}
          </p>
          <p className="text-sm text-ln-op-mute truncate">
            {signal.locality ?? "—"}, {signal.province ?? "—"}
          </p>
        </div>
        <time
          dateTime={signal.detectedAt.toISOString()}
          className="text-sm text-ln-op-mute tabular-nums whitespace-nowrap shrink-0"
        >
          {timeAgo(signal.detectedAt)}
        </time>
      </Link>
      <div className="px-1 pb-2">
        <Link
          href={`/gob/vigilancia/investigaciones/nuevo?diseaseCode=${signal.diseaseCode}&signalId=${signal.signalEventId}`}
          className="text-sm text-ln-op-azul hover:underline"
        >
          Abrir investigacion →
        </Link>
      </div>
    </li>
  );
}
