import { OpPill } from "@/components/ui/dashboard";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/src/modules/welfare/domain/types";
import type {
  WelfareReportSeverity,
  WelfareReportStatus,
} from "@/src/modules/welfare/domain/types";

import { WelfareRowLink } from "./WelfareRowLink";

// Severity → OpPill tone mapping.
// critical/high → danger, medium → open (warn), low → triaged (blue), unknown → neutral.
const SEVERITY_TONE: Record<WelfareReportSeverity, "danger" | "open" | "triaged" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "open",
  low: "triaged",
};

const STATUS_TONE: Record<
  WelfareReportStatus,
  "open" | "triaged" | "progress" | "closed" | "neutral"
> = {
  open: "open",
  triaged: "triaged",
  in_progress: "progress",
  closed: "closed",
  invalid: "neutral",
  duplicate: "neutral",
};

/** Compact time-ago label for a past date, in Spanish. */
function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "hace 1 día";
  if (diffDays < 30) return `hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "hace 1 mes";
  return `hace ${diffMonths} meses`;
}

export type WelfareDenunciaRowProps = {
  report: {
    id: string;
    referenceCode: string;
    kind: string;
    severity: WelfareReportSeverity;
    status: WelfareReportStatus;
    jurisdictionLocality: string | null;
    jurisdictionProvince: string | null;
    createdAt: Date;
    assignedToUserId: string | null;
  };
};

export function WelfareDenunciaRow({ report }: WelfareDenunciaRowProps) {
  const severityTone = SEVERITY_TONE[report.severity] ?? "neutral";
  const statusTone = STATUS_TONE[report.status] ?? "neutral";

  return (
    <li className="overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card">
      <WelfareRowLink
        casoParam={report.referenceCode}
        href={`/gob/maltrato/${report.referenceCode}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-medium text-ln-op-ink">
                {welfareReportKindLabel(report.kind)}
              </p>
              <OpPill tone={severityTone}>{welfareReportSeverityLabel(report.severity)}</OpPill>
            </div>
            <p className="text-[11px] text-ln-op-mute">
              {report.jurisdictionLocality && report.jurisdictionProvince
                ? `${report.jurisdictionLocality}, ${report.jurisdictionProvince}`
                : "Sin jurisdicción declarada"}
              {" · "}
              {timeAgo(new Date(report.createdAt))}
            </p>
            <p className="text-xs text-ln-op-mute font-mono">
              {report.referenceCode}
              {report.assignedToUserId ? " · Asignada" : ""}
            </p>
          </div>
          <OpPill tone={statusTone}>{welfareReportStatusLabel(report.status)}</OpPill>
        </div>
      </WelfareRowLink>
    </li>
  );
}
