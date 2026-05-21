import Link from "next/link";

import { Badge } from "@/components/poncho";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
} from "@/lib/welfare";
import type { WelfareReportSeverity, WelfareReportStatus } from "@/lib/welfare";

// Severity → Badge variant mapping per spec §B.4:
// critical/high → danger, medium → warning, low → info, unknown → neutral.
const SEVERITY_VARIANT: Record<WelfareReportSeverity, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

const STATUS_TONE: Record<WelfareReportStatus, string> = {
  open: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200",
  triaged: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200",
  in_progress: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200",
  closed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200",
  invalid: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
  duplicate: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
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
  const severityVariant = SEVERITY_VARIANT[report.severity] ?? "neutral";

  return (
    <li className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <Link
        href={`/gob/maltrato/${report.id}`}
        className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {welfareReportKindLabel(report.kind)}
              </p>
              <Badge variant={severityVariant}>{welfareReportSeverityLabel(report.severity)}</Badge>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              {report.jurisdictionLocality && report.jurisdictionProvince
                ? `${report.jurisdictionLocality}, ${report.jurisdictionProvince}`
                : "Sin jurisdicción declarada"}
              {" · "}
              {timeAgo(new Date(report.createdAt))}
            </p>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
              {report.referenceCode}
              {report.assignedToUserId ? " · Asignada" : ""}
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              STATUS_TONE[report.status] ?? ""
            } shrink-0`}
          >
            {welfareReportStatusLabel(report.status)}
          </span>
        </div>
      </Link>
    </li>
  );
}
