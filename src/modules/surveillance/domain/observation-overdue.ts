// Pure overdue predicate for the 10-day rabies observation deadline.
//
// G3 (2026-07-03 critique): /admin/observaciones rendered "Cierre estimado:
// {date}" but never compared it to now — an observation 20 days past its
// statutory deadline looked identical to one on time. This is the ONE pure
// derivation for that comparison, so the badge here and the upcoming /gob
// worklist (cross-domain normalization) can never grow divergent day math.
//
// Honest-math contract (SlaBadge precedent, components/ui/dashboard/
// SlaBadge.tsx): the rendered number is ALWAYS the actual AR-calendar-day
// distance to the deadline — never a tier, never a window size. Day identity
// is the Argentine calendar day (calendarDaysAgoInAr), matching every other
// day-difference the operator surface shows.
//
// Sibling of rabies-observation.ts (not inside it) so that file keeps its
// "zero runtime imports" invariant — this one needs the shared AR day math.

import { calendarDaysAgoInAr } from "@/lib/utils/format";

/**
 * How many AR-calendar days before the deadline a row starts warning.
 * 2 = the deadline day itself, tomorrow, and the day after.
 */
export const OBSERVATION_DUE_SOON_DAYS = 2;

export type ObservationOverdueState =
  /** Deadline is past — `days` = AR-calendar days SINCE it (>= 1). */
  | { state: "overdue"; days: number }
  /** Deadline is near — `days` = AR-calendar days UNTIL it (0 = due today). */
  | { state: "due_soon"; days: number }
  /** Deadline is comfortably ahead — `days` = AR-calendar days until it. */
  | { state: "on_time"; days: number };

/**
 * Classifies an in-progress observation's statutory deadline against `now`.
 *
 * Pure: same inputs, same output — inject `now` for deterministic tests.
 * Callers feed it `resolveObservationDeadline(...)` (rabies-observation.ts),
 * which is always computable, so there is no null branch to hide behind.
 */
export function observationOverdueState(deadline: Date, now: Date): ObservationOverdueState {
  // calendarDaysAgoInAr(deadline, now): positive when the deadline's AR
  // calendar day is already past, negative when it is still ahead, 0 today.
  const daysPast = calendarDaysAgoInAr(deadline, now);
  if (daysPast > 0) return { state: "overdue", days: daysPast };
  // Math.abs (not unary minus) so a deadline due TODAY yields +0, never -0.
  const daysLeft = Math.abs(daysPast);
  if (daysLeft <= OBSERVATION_DUE_SOON_DAYS) return { state: "due_soon", days: daysLeft };
  return { state: "on_time", days: daysLeft };
}

/** es-AR "{n} día(s)" — singular agreement, never "1 días". */
function daysEs(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/**
 * Badge copy for an overdue state, or null when no badge is warranted
 * (on-time rows keep only their "Cierre estimado" date — the badge exists to
 * make deviation visible, not to decorate every row).
 *
 * Lives next to the predicate (not in the page) so /admin/observaciones and
 * the /gob worklist render the SAME words for the same state.
 */
export function observationOverdueLabel(s: ObservationOverdueState): string | null {
  switch (s.state) {
    case "overdue":
      return `Vencida hace ${daysEs(s.days)}`;
    case "due_soon":
      return s.days === 0 ? "Vence hoy" : `Vence en ${daysEs(s.days)}`;
    case "on_time":
      return null;
  }
}
