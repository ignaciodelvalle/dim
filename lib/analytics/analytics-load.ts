// lib/analytics-load.ts — bounded loading for the admin analytics dashboards (D2)
// and, since the platform-budget pass (T3), other heavy admin pages too.
//
// The admin analytics pages (/admin/programa, /censo, /poblacion) await a
// Promise.all of population-scale fetchers in a force-dynamic server component.
// If one fetcher is pathologically slow (a missing index, a lock, a degraded
// DB) the whole request hangs and the operator stares at a blank/loading page
// with no escape. loadWithTimeout races the fetch against a deadline and folds
// a rejection into the same shape, so the page can render an honest
// "tardando… reintentar" state instead of hanging forever.
//
// T3 widened the audience beyond analytics: /admin/auditoria bounds its whole
// fetch group with loadWithTimeout, and /admin/inteligencia races one deadline
// PER STREAMED PANEL (three independent budgets instead of a single all-or-
// nothing Promise.all race). Same contract everywhere: the deadline bounds the
// wait, it does NOT cancel the underlying queries.

/** Deadline for an analytics page's fetcher set before it degrades (D2: 10 s). */
export const ANALYTICS_LOAD_TIMEOUT_MS = 10_000;

/** Discriminated result: data on success, a reason on timeout/error. */
export type AnalyticsLoad<T> = { ok: true; value: T } | { ok: false; reason: "timeout" | "error" };

/**
 * Race `promise` against a `ms` deadline.
 *
 * - Resolves `{ ok: true, value }` when the promise settles first.
 * - Resolves `{ ok: false, reason: "timeout" }` when the deadline wins.
 * - Resolves `{ ok: false, reason: "error" }` when the promise rejects.
 *
 * Never rejects — the caller branches on `ok`. The timer is always cleared so a
 * fast success does not keep the event loop alive.
 *
 * NOTE: a timeout does not cancel the underlying work (DB queries keep running
 * to completion in the background); it only bounds how long the request waits.
 */
export async function loadWithTimeout<T>(
  promise: Promise<T>,
  ms: number = ANALYTICS_LOAD_TIMEOUT_MS,
): Promise<AnalyticsLoad<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<AnalyticsLoad<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms);
  });

  try {
    return await Promise.race([
      promise.then(
        (value): AnalyticsLoad<T> => ({ ok: true, value }),
        (): AnalyticsLoad<T> => ({ ok: false, reason: "error" }),
      ),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Build the "Reintentar" href for a degraded analytics page: the page path plus
 * the current period search params (so retrying keeps the operator's filter).
 * Undefined/empty params are dropped.
 */
export function analyticsRetryHref(
  path: string,
  sp: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value != null && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
