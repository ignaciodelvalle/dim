// capture-nav — shared same-route/cross-route classification for the
// quick-capture flow (EventCatcherSingle + CaptureBox).
//
// WHY: EventCatcherSingle already classified its destination URL correctly —
// same-route `?sheet=`/`?tab=` targets go through pushSheetUrl (History API,
// no router — see lib/ui/sheet-nav.ts for the router-hot-path rationale),
// while a genuinely different route (a full `/eventos/nuevo/*` page) is a
// real navigation via next/navigation's router. CaptureBox (the /anotar
// fallback page AND the ?sheet=anotar sheet body — SheetMounter mounts it at
// `/mis-mascotas/{token}`) never got this fix: it always called
// router.push/router.replace regardless of destination, so a routeOverride
// landing back on the SAME profile route (e.g. `?sheet=marcar-perdida`)
// regressed into the exact router-hot-path defect this module exists to
// avoid (engram #621, verify-report #617 CRITICAL-1).
//
// This helper is the ONE place both components resolve "same route or not" —
// consumed by BOTH EventCatcherSingle (submit) and CaptureBox (mount-redirect
// + submit) so the classification never drifts between them again.

import { isSameRouteUrl, pushSheetUrl } from "@/lib/ui/sheet-nav";

export type CaptureRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/**
 * Navigates to a capture-flow destination URL.
 *
 * - `href` targets the SAME route as `pathname` (only search params differ,
 *   e.g. `?sheet=marcar-perdida` reached from `/mis-mascotas/{token}`) →
 *   pushSheetUrl (shallow History API push, never touches the router).
 * - Otherwise (a different route, e.g. `/eventos/nuevo/vacuna`) → the
 *   caller's chosen router method (`push` by default; pass `"replace"` for a
 *   redirect that shouldn't add its own history entry, e.g. CaptureBox's
 *   mount-time intent resolution).
 */
export function goToCaptureUrl(
  pathname: string,
  href: string,
  router: CaptureRouter,
  method: "push" | "replace" = "push",
): void {
  if (isSameRouteUrl(pathname, href)) {
    pushSheetUrl(href);
    return;
  }
  router[method](href);
}
