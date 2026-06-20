// Panorama temporal-reproduction primitives (spec F4) — pure domain.
//
// The TimeScrubber lets an operator scrub the active period [since, now] back in
// time to watch a situation form (e.g. the Salta rabies cluster over ~12 days).
// All the date arithmetic lives here as pure functions so it is unit-testable
// WITHOUT React/DOM and shared by both the client control and the API clamp.
//
// Domain purity: NO @/db, NO next, NO React (enforced by the noRestrictedImports
// override for src/modules/*/domain/**). `Date` is allowed; the scrubber steps in
// whole days over a fixed [since, until] window the caller provides.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A discrete day-stepped reproduction axis over [since, until]. */
export type ScrubWindow = {
  /** Inclusive lower bound (the active period's `since`). */
  since: Date;
  /** Inclusive upper bound ("ahora" / live). */
  until: Date;
  /** Number of whole-day steps from `since` to `until` (>= 0). */
  steps: number;
};

/** Floor a timestamp to the start of its UTC day. */
function floorToUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Build a day-stepped axis from a [since, until] window. `until` is snapped to
 * the END of its day and `since` to the START of its day so the axis spans whole
 * days inclusively. A degenerate or inverted window collapses to a single step.
 */
export function buildScrubWindow(since: Date, until: Date): ScrubWindow {
  const sinceMs = floorToUtcDay(since.getTime());
  const untilMs = until.getTime();
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || untilMs <= sinceMs) {
    return { since: new Date(sinceMs), until: new Date(untilMs), steps: 0 };
  }
  // Inclusive whole-day count from the start-of-day `since` to `until`.
  const steps = Math.max(0, Math.floor((floorToUtcDay(untilMs) - sinceMs) / DAY_MS));
  return { since: new Date(sinceMs), until: new Date(untilMs), steps };
}

/**
 * Map a 0..steps slider index to its as-of Date. Index 0 → `since`; the final
 * index → `until` ("ahora"). The index is clamped into range so out-of-bounds
 * keyboard input never escapes the window.
 */
export function dayIndexToDate(win: ScrubWindow, index: number): Date {
  const clamped = Math.max(0, Math.min(win.steps, Math.round(index)));
  if (clamped >= win.steps) return new Date(win.until.getTime());
  return new Date(win.since.getTime() + clamped * DAY_MS);
}

/** Map an as-of Date back to its nearest 0..steps slider index. */
export function dateToDayIndex(win: ScrubWindow, asOf: Date): number {
  const offset = asOf.getTime() - win.since.getTime();
  const idx = Math.round(offset / DAY_MS);
  return Math.max(0, Math.min(win.steps, idx));
}

/**
 * Advance the play loop by one day. Returns the next index, or `null` once the
 * end ("ahora") is reached so the caller can stop the interval. Wrapping is the
 * caller's choice — returning null keeps the loop honest (play → stop at live).
 */
export function nextPlayIndex(win: ScrubWindow, current: number): number | null {
  const clamped = Math.max(0, Math.min(win.steps, Math.round(current)));
  if (clamped >= win.steps) return null;
  return clamped + 1;
}

/**
 * Clamp an arbitrary as-of timestamp into [since, until]. Used by the API route so
 * a crafted `?asOf=` can never widen the window below `since` or above "now".
 * Returns `null` when the input is absent/un-parseable (caller treats null as live).
 */
export function clampAsOf(asOf: Date | null, since: Date, until: Date): Date | null {
  if (!asOf || Number.isNaN(asOf.getTime())) return null;
  const t = asOf.getTime();
  if (t < since.getTime()) return new Date(since.getTime());
  if (t > until.getTime()) return new Date(until.getTime());
  return asOf;
}

/** Parse an ISO string to a Date, or null when absent/invalid. */
export function parseAsOf(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human es-AR label for the as-of date shown beside the scrubber (and aria-valuetext). */
export function formatAsOfLabel(date: Date): string {
  // Use UTC parts so the displayed day matches the day-stepped axis (built in UTC).
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
