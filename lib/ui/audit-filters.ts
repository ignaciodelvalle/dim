// Pure parsing/validation helpers for the /admin/auditoria filters.
//
// Extracted so the multi-action + date-range filtering the auditoría page
// applies is unit-testable without a running database. The page reads these
// helpers to turn raw searchParams into validated filter inputs; the admin
// KPI strip uses `decisionsAuditDrillHref` to build a drill that lands on the
// exact rows the "Decisiones 7d" tile counts (a date-scoped, decision-action
// filtered view — not the all-time, all-action log).

import type { AuditLogAction } from "@/db";
import { AUDIT_ACTION_LABELS } from "@/lib/ui/audit-action-labels";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The audit actions the "Decisiones 7d" KPI counts (approvals + rejections). */
export const DECISION_AUDIT_ACTIONS = ["request_approved", "request_rejected"] as const;

/**
 * Parse a (possibly comma-separated) `action` param into a validated, de-duped
 * list of audit actions. Unknown codes are dropped so an attacker-shaped param
 * can never reach the SQL layer. Order of first appearance is preserved.
 */
export function parseAuditActions(raw: string | null | undefined): AuditLogAction[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: AuditLogAction[] = [];
  for (const part of raw.split(",")) {
    const code = part.trim();
    if (code && code in AUDIT_ACTION_LABELS && !seen.has(code)) {
      seen.add(code);
      out.push(code as AuditLogAction);
    }
  }
  return out;
}

export type AuditDateRange = {
  /** Inclusive lower bound (performedAt >= since), or null when absent/invalid. */
  since: Date | null;
  /** Exclusive upper bound (performedAt < until), or null when absent/invalid. */
  until: Date | null;
};

/** Parse a YYYY-MM-DD string to a UTC-midnight Date, or null when malformed. */
function parseUtcDateOnly(raw: string): Date | null {
  if (!DATE_ONLY_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject rolled-over dates like 2026-02-30 (JS would silently normalise to Mar 2).
  if (d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

/**
 * Parse `from`/`to` (date-only, YYYY-MM-DD) into a half-open [since, until)
 * range. `to` is treated as inclusive of the whole day by advancing `until`
 * to the next UTC midnight, so a single-day filter (from === to) still matches.
 */
export function parseAuditDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): AuditDateRange {
  const since = from ? parseUtcDateOnly(from) : null;
  const toDate = to ? parseUtcDateOnly(to) : null;
  const until = toDate ? new Date(toDate.getTime() + DAY_MS) : null;
  return { since, until };
}

/**
 * Build the drill href for the admin "Decisiones 7d" KPI: the decision actions
 * it counts, scoped to the trailing 7 days. `now` is injectable for testing.
 */
export function decisionsAuditDrillHref(now: number = Date.now()): string {
  const from = new Date(now - 7 * DAY_MS).toISOString().slice(0, 10);
  return `/admin/auditoria?action=${DECISION_AUDIT_ACTIONS.join(",")}&from=${from}`;
}
