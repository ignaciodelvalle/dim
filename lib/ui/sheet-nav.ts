// sheet-nav — client-side URL state machine for the pet profile's
// quick-capture sheets (pet-document-redesign, router-hot-path fix).
//
// WHY: Next.js 15.5.x's App Router has a known production-mode defect where
// a Link/router.push soft navigation's own fetch can resolve 200 with a
// fully valid payload, yet the client router silently drops it — no
// history.pushState, no re-render, no error (engram #621, verify-report
// #617 CRITICAL-1). On the pet profile this made the Anotar icon fail
// 3/3 in production. The sheets are the profile's primary interaction
// surface, so the router must never sit on their hot path.
//
// FIX: open/close sheets via the native History API directly instead of
// router.push/router.replace/<Link> navigation. Next's App Router patches
// window.history.pushState/replaceState on mount specifically to support
// this ("shallow routing"): calling them on the SAME route updates
// usePathname()/useSearchParams() reactively WITHOUT a server round-trip —
// there is no RSC fetch to drop, so the defect cannot reproduce.
// https://nextjs.org/docs/app/api-reference/functions/use-router (native
// History API / shallow routing).
//
// Only use these helpers for same-route `?sheet=` transitions. A target URL
// on a DIFFERENT route (e.g. a full /eventos/nuevo/* page) is a real
// navigation and must go through next/navigation's router as usual —
// see isSameRouteUrl.

/**
 * Set to true by pushSheetUrl() and read by closeSheetNav() to decide
 * between `history.back()` (undo our own pushState) and `replaceState`
 * (the sheet was open from a direct URL load / SSR, so closing must not
 * traverse history away from the profile). Module-scoped: this file is
 * only ever imported by "use client" components, so its lifetime matches
 * a single page load — exactly the scope this flag needs.
 */
let openedViaPush = false;

/**
 * Opens a sheet by pushing `url` onto the history stack. `url` must target
 * the SAME route as the current page (only search params differ) so Next's
 * shallow-routing patch picks it up reactively — see module docblock.
 */
export function pushSheetUrl(url: string): void {
  if (typeof window === "undefined") return;
  openedViaPush = true;
  window.history.pushState(null, "", url);
}

/**
 * Closes the currently open sheet.
 *
 * - If the open sheet was reached via pushSheetUrl() during this page's
 *   lifetime, pops that history entry (`back()`) so the back button and the
 *   sheet's own close ("×") button stay consistent — both undo the same
 *   history step.
 * - Otherwise (the sheet was open from a direct URL load / SSR — e.g. a
 *   bookmarked or shared `?sheet=` link), there is no pushed entry to pop:
 *   `replaceState` strips the param in place so closing never navigates
 *   away from the profile.
 */
export function closeSheetNav(closeUrl: string): void {
  if (typeof window === "undefined") return;
  if (openedViaPush) {
    window.history.back();
  } else {
    window.history.replaceState(null, "", closeUrl);
  }
}

/**
 * True when `targetUrl`'s pathname matches `currentPathname` — i.e. the
 * target is a same-route `?sheet=` shorthand reachable via shallow routing
 * (pushSheetUrl). False for a genuinely different route (a full page),
 * which must use a real navigation (router.push) instead.
 */
export function isSameRouteUrl(currentPathname: string, targetUrl: string): boolean {
  const targetPath = targetUrl.split("?")[0].split("#")[0];
  return targetPath === currentPathname;
}

/**
 * Test-only escape hatch: resets the module-scoped `openedViaPush` flag.
 * Production code never needs this (the flag's lifetime naturally matches
 * one page load); unit tests importing this module across multiple `it()`
 * blocks do, since the module instance is shared within a test file.
 */
export function __resetSheetNavStateForTests(): void {
  openedViaPush = false;
}
