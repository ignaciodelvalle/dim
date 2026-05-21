import Link from "next/link";

import { Badge } from "@/components/poncho";
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
 */
export function OutbreakSignalRow({ signal }: OutbreakSignalRowProps) {
  const href = `/gob/vigilancia/brotes?signalId=${signal.signalEventId}`;

  return (
    <li className="border-b border-gob-border last:border-b-0">
      <Link
        href={href}
        className="flex items-start justify-between gap-3 px-1 py-3 rounded-lg hover:bg-gob-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-primary focus-visible:ring-offset-1"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gob-text truncate">
              {signal.diseaseName}
            </span>
            <Badge variant="warning">{signal.diseaseCode}</Badge>
          </div>
          <p className="text-xs text-gob-text-gray truncate">
            {signal.petName} · {signal.petSpecies}
          </p>
          <p className="text-xs text-gob-text-muted truncate">
            {signal.locality ?? "—"}, {signal.province ?? "—"}
          </p>
        </div>
        <time
          dateTime={signal.detectedAt.toISOString()}
          className="text-xs text-gob-text-muted tabular-nums whitespace-nowrap shrink-0"
        >
          {timeAgo(signal.detectedAt)}
        </time>
      </Link>
    </li>
  );
}
