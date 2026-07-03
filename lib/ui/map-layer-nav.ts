// lib/ui/map-layer-nav.ts — Shallow pushState/replaceState URL sync for the
// map-QOL Panorama layer/period/scope controls (map-QOL P0 primitive).
//
// WHY: same router-hot-path defect this whole helper family works around —
// see lib/ui/sheet-nav.ts's module docblock (Next.js 15.5.x's App Router can
// silently drop a router.push/router.replace soft navigation in production,
// engram #621/#622). Opening/closing sheets and switching the pet profile's
// tab already route around it via the native History API instead of
// next/navigation's router; this module applies the identical primitive to
// Panorama's map state (layer toggles, period/scope, `asOf`).
//
// This is the mechanism a LATER map-QOL commit will use to SUPERSEDE
// components/panorama/PanoramaConsole.tsx's `onPreset` interim cure — a full
// `window.location.assign` reload on period commit (see that file's docblock,
// ~lines 677-698) — with a shallow, client-fetch period/layer commit. NOT
// wired into PanoramaConsole in this commit: this file only builds the
// primitive a later commit will consume.
//
// Only use these helpers for SAME-ROUTE transitions (layer/period/scope query
// params on the current Panorama route) — see isSameRouteUrl, re-exported
// from sheet-nav.ts (not duplicated) for callers that need to decide between
// a shallow push and a real navigation to a different route.

export { isSameRouteUrl } from "./sheet-nav";

/**
 * Pushes a new map-state URL (layer/period/scope/`asOf` query params) onto
 * the history stack via the native History API — same primitive and
 * router-hot-path rationale as sheet-nav.ts's pushTabUrl. `url` must target
 * the SAME route as the current page (only search params differ); a
 * different route is a real navigation and must go through next/navigation's
 * router instead — see isSameRouteUrl.
 */
export function pushMapStateUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", url);
}

/**
 * Replaces the current map-state URL WITHOUT pushing a new history entry —
 * same primitive as sheet-nav.ts's replaceTabUrl. Use this for a silent,
 * one-time normalization the user did not explicitly navigate to (e.g.
 * clamping a stale `asOf` on mount); use pushMapStateUrl for an explicit
 * user-driven layer/period change that should be back-button undoable.
 */
export function replaceMapStateUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", url);
}
