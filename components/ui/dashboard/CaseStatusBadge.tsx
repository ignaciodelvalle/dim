// CaseStatusBadge — consistent status badge for cases (expedientes).
//
// Maps open / escalated / closed / merged to shared design-token tones so
// every case surface uses the same visual grammar. Rendered as a small
// mono-caps pill (same visual weight as OpStateBadge but with case-specific
// semantics and an optional icon dot for open/escalated states).
//
// Import from @/components/ui/dashboard or directly from this file.

import type { CaseStatus } from "@/db/schema";

interface Props {
  status: CaseStatus;
  /** Optional override label. Defaults to the canonical Spanish label. */
  label?: string;
}

// Status classes use st-* tokens — resolved to ln-op-* values via .op-surface
// cascade (zero visual diff; see globals.css .op-surface block).
const STATUS_CONFIG: Record<CaseStatus, { label: string; classes: string }> = {
  open: {
    label: "Abierto",
    classes: "bg-[var(--color-st-ok-bg)] text-[var(--color-st-ok)] border-[var(--color-st-ok-bd)]",
  },
  escalated: {
    label: "Escalado",
    classes:
      "bg-[var(--color-st-warn-bg)] text-[var(--color-st-warn)] border-[var(--color-st-warn-bd)]",
  },
  closed: {
    label: "Cerrado",
    classes: "bg-ln-op-stripe text-ln-op-mute border-ln-op-line",
  },
  merged: {
    label: "Fusionado",
    classes:
      "bg-[var(--color-st-info-bg)] text-[var(--color-st-info)] border-[var(--color-st-info-bd)]",
  },
};

/**
 * Consistent status badge for case (expediente) records.
 * Tones are shared cross-kind: no per-screen overrides.
 */
export function CaseStatusBadge({ status, label }: Props) {
  const { label: defaultLabel, classes } = STATUS_CONFIG[status];
  return (
    <span
      className={[
        "inline-block rounded-[3px] border px-[7px] py-[2px]",
        "font-ln-mono text-[9px] font-bold uppercase tracking-[0.06em]",
        classes,
      ].join(" ")}
    >
      {label ?? defaultLabel}
    </span>
  );
}
