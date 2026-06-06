// Pure state-machine rules for welfare report status transitions.
// Extracted from app/actions/welfare-triage.ts — statusTransitionAllowed.
// Zero external imports; this file is pure domain logic.
//
// State machine (spec R3):
//   open        → triaged | in_progress | invalid | duplicate | closed
//   triaged     → in_progress | invalid | duplicate | closed
//   in_progress → closed
//   closed | invalid | duplicate → terminal (no re-open in v1)

import type { WelfareReportStatus } from "./types";

// Statuses from which no further transition is allowed.
export const TERMINAL_STATUSES: readonly WelfareReportStatus[] = [
  "closed",
  "invalid",
  "duplicate",
] as const;

/**
 * Returns true if moving a welfare report from `from` to `to` is a valid
 * state-machine transition. Both the caller and the repository layer should
 * check this before issuing an UPDATE.
 */
export function statusTransitionAllowed(
  from: WelfareReportStatus,
  to: WelfareReportStatus,
): boolean {
  const allowed: Partial<Record<WelfareReportStatus, readonly WelfareReportStatus[]>> = {
    open: ["triaged", "in_progress", "invalid", "duplicate", "closed"],
    triaged: ["in_progress", "invalid", "duplicate", "closed"],
    in_progress: ["closed"],
  };
  return (allowed[from] ?? []).includes(to);
}

/**
 * Returns true if `status` is a terminal state (no further transitions allowed).
 */
export function isTerminalStatus(status: WelfareReportStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
