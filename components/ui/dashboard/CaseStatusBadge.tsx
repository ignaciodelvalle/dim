// CaseStatusBadge — consistent status badge for cases (expedientes).
//
// Grammar (canonical triage model — F2 fix):
//   open      → st-warn  (amber — needs action)
//   escalated → st-err   (red)
//   closed    → st-ok    (green — resolved)
//   merged    → st-info  (violet)
//
// Thin semantic wrapper over OpStatusPill; public API is unchanged.
// Import from @/components/ui/dashboard or directly from this file.

import type { CaseStatus } from "@/db/schema";

import { OpStatusPill, type StatusTone } from "./OpStatusPill";

interface Props {
  status: CaseStatus;
  /** Optional override label. Defaults to the canonical Spanish label. */
  label?: string;
}

const STATUS_CONFIG: Record<CaseStatus, { label: string; tone: StatusTone }> = {
  open: { label: "Abierto", tone: "st-warn" },
  escalated: { label: "Escalado", tone: "st-err" },
  closed: { label: "Cerrado", tone: "st-ok" },
  merged: { label: "Fusionado", tone: "st-info" },
};

/**
 * Consistent status badge for case (expediente) records.
 * Tones are shared cross-kind: no per-screen overrides.
 */
export function CaseStatusBadge({ status, label }: Props) {
  const { label: defaultLabel, tone } = STATUS_CONFIG[status];
  return <OpStatusPill tone={tone}>{label ?? defaultLabel}</OpStatusPill>;
}
