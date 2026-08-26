// Where a deep link goes when it finds no session, and where sign-in sends it
// back to.
//
// WHY THIS IS A MODULE AND NOT TWO HELPERS IN TWO SCREENS
// ---------------------------------------------------------------------------
// The two halves have to agree, and they are written in different files:
// `useGate` decides what to PUT in `next`, `ingreso` decides what to DO with it.
// A disagreement between them is not a crash — it is somebody signing in and
// landing somewhere they did not ask for, which is the exact failure this pair
// exists to fix. Both halves also have a security shape worth testing directly
// rather than through a rendered screen.
//
// WHAT THE PAIR IS FOR
// ---------------------------------------------------------------------------
// Until deep links resolved (WU-O), every protected screen was reached by
// tapping through from the pet list, so a signed-out person sent to sign-in came
// back to a stack they could walk again in two taps. Losing the destination cost
// almost nothing.
//
// A deep link changes that. Somebody taps "Ver propuesta" in a notification, the
// app opens at `/transferencias/PTR-…`, the stored session has expired, and they
// land on sign-in — and after signing in they arrive at their pet list with no
// idea what the link was for. The proposal is still there and still expiring,
// and the only route back is the notification they already dismissed.

import { ROUTES } from "../ui/routes";

/**
 * Where to send a signed-out visitor, carrying where they were going.
 *
 * The caller passes `usePathname()` — the path the ROUTER already resolved —
 * never a value read out of the link itself. That is the security of this half:
 * the router only produces paths it has a screen for.
 *
 * NO PARAMETER for the paths that would loop or mean nothing. Sign-in itself and
 * the gate are obvious; the pet list is the DEFAULT landing, so carrying it
 * would add a parameter that changes nothing while making every ordinary
 * sign-in look like a redirect chain.
 */
export function signInHref(
  pathname: string,
): string | { pathname: string; params: { next: string } } {
  const next = pathname.trim();
  if (next === "" || next === "/" || next === ROUTES.ingreso || next === ROUTES.misMascotas) {
    return ROUTES.ingreso;
  }
  return { pathname: ROUTES.ingreso, params: { next } };
}

/**
 * Where to go after a successful sign-in — the interrupted destination, or the
 * gate.
 *
 * `next` IS RE-CHECKED HERE AND NOT TRUSTED, even though `signInHref` produced
 * it from a resolved pathname. Two reasons, and the second is the one that
 * matters:
 *
 *   · A path parameter can legally repeat, so the type is `string | string[]`
 *     and the array case has to be resolved rather than stringified into
 *     `"/a,/b"`.
 *   · The sign-in screen is itself ADDRESSABLE. `mimar://ingreso?next=…` is a
 *     url anybody can compose and send, so by the time the value is read here it
 *     is untrusted input in a way it was not one component ago.
 *
 * It is deliberately a SHAPE check and not an allow-list of routes. An allow-list
 * would have to be maintained beside `ROUTES` and would silently drop a
 * legitimate destination the day somebody adds a screen and forgets — failing in
 * the direction this whole change exists to fix. What must be impossible is
 * leaving the app, and `//` and a scheme are the two ways to do that.
 */
export function returnHref(next: string | string[] | undefined): string {
  const value = (Array.isArray(next) ? next[0] : next)?.trim() ?? "";
  if (value.length === 0) return ROUTES.root;
  // A single leading slash and no scheme. `//host` is protocol-relative and
  // `mimar:` / `https:` name another app or the browser.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes(":")) return ROUTES.root;
  return value;
}
