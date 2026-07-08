// Bounded DB fan-out helper — "never hang, never crash" for the Panorama console.
//
// PRODUCTION INCIDENT (task #74): the universal-scope admin console fires ~11
// aggregate queries via Promise.all + the layer fetchers. On the shared micro DB
// under contention, once the transaction pooler degrades these queries HANG
// indefinitely. Two failure modes followed:
//   1. The Vercel lambda's RSC stream truncated — the page shows loading
//      skeletons forever with zero client errors.
//   2. A rejected query that no longer had a consumer (Promise.all had already
//      settled on another rejection, abandoning its siblings) surfaced as an
//      UNHANDLED REJECTION that crashed the lambda mid-response
//      ("Node.js process exited"), which abandoned pooler slots and fed the
//      death spiral.
//
// withDbBudget bounds a DB promise on BOTH axes:
//   - TIME: races the promise against a timeout; on expiry it resolves a
//     caller-supplied degraded `fallback` so the response renders a
//     degraded-but-honest state instead of hanging the stream.
//   - CRASH-SAFETY: it always attaches a `.catch` to the underlying promise, so
//     a rejection that arrives AFTER the timeout already resolved the race
//     (the abandoned-sibling case) is swallowed-and-logged and can never become
//     an unhandledRejection.
//
// Semantics by outcome:
//   - resolves before the budget  → the real value.
//   - rejects  before the budget  → withDbBudget REJECTS (propagates) so the
//                                    caller (route handler) can answer with a
//                                    503 envelope. A page caller adds its own
//                                    `.catch(fallback)` to degrade instead.
//   - budget elapses first        → resolves `fallback` (degraded). Any later
//                                    settle of the underlying promise is
//                                    swallowed (value dropped / rejection logged).

/**
 * Run `promise` with a time budget and crash-safety.
 *
 * @param promise  the DB work to bound (e.g. a fan-out Promise.all/allSettled).
 * @param ms       budget in milliseconds; on expiry `fallback` is resolved.
 * @param label    short identifier for logs (e.g. "GET /api/panorama/kpis").
 * @param fallback the degraded value to resolve when the budget elapses.
 */
export async function withDbBudget<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T,
): Promise<T> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      console.warn(`[db-budget] ${label} exceeded ${ms}ms budget — returning degraded result`);
      resolve(fallback);
    }, ms);
  });

  // Always attach a catch. Before the timeout, rethrow so the rejection wins the
  // race and propagates to the caller. After the timeout, the caller has already
  // moved on with `fallback`, so a late rejection is swallowed-and-logged — this
  // is the guard that prevents the abandoned-query crash.
  const guarded: Promise<T> = promise.catch((err) => {
    if (timedOut) {
      console.error(`[db-budget] ${label} rejected after budget elapsed (swallowed):`, err);
      return fallback;
    }
    throw err;
  });

  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
