// The two BUSCAR paths — and why they are not in `src/ui/routes.ts` with the
// other twenty.
//
// THIS FILE IS A DECLARED DEVIATION, NOT A PATTERN TO COPY
// ---------------------------------------------------------------------------
// `src/ui/routes.ts` is the route tree, named once, and its header argues at
// length for exactly that: "a rename is a compile error at every call site, not a
// screen that silently fails to open". Two entries living here instead is a
// second place the tree is described, which is the thing that file exists to
// prevent.
//
// It is here because that file was ANOTHER LANE'S TERRITORY in the window this
// landed in. `apps/mobile/src/ui/routes.ts` is one of the five files the
// denunciar lane was turned back on — five content conflicts, all of them the
// same append-at-the-end shape, in files neither lane was wrong to touch. Writing
// two more `ROUTES` members into it would have made that six.
//
// THE MOVE IS MECHANICAL AND THE EXACT TEXT IS IN THE HAND-OFF. Both constants
// belong in `ROUTES` (`buscarTurnos`) and beside `turnoRoute`
// (`buscarOfferingRoute`), and `AppRoute` gains the second's return type. Nothing
// about the paths themselves is in question; only which file holds them.

/**
 * BUSCAR UN TURNO — the service picker and the results.
 *
 * THE PATH NESTS UNDER `/turnos` AND THE WEB'S DOES NOT NEST UNDER `/mis-turnos`.
 * The browser has two unrelated trees for one feature — `/turnos/buscar` to find
 * one and `/mis-turnos` to see the ones you hold — because its nav grew them
 * separately, and the board records that neither is in that nav at all: they are
 * reachable by deep link only. A stack navigator has no such history, and on a
 * phone the honest arrangement is the one the person walks: you open your turnos,
 * you do not have the one you need, you look for it.
 *
 * It also shortens the same word `/turnos` shortens: in an app that only ever
 * shows you your own, "mis" is a word the URL does not need.
 */
export const BUSCAR_TURNOS_ROUTE = "/turnos/buscar" as const;

/**
 * One offering's slot grid, and the confirm.
 *
 * ONE SCREEN FOR WHAT THE WEB SPLITS ACROSS TWO. The browser draws the grid at
 * `/turnos/buscar/{offering}` and the pet picker at
 * `.../reservar/{slotId}`, which is a second page and a second server round trip
 * in the middle of a two-tap flow. The read here carries the grid AND the
 * bookable pets together, so the slot picker and the animal picker are one
 * screen — and the screen cannot honestly offer a time to somebody with no
 * bookable animal, which is a thing it has to know before it draws the grid.
 *
 * THE SEGMENT IS THE OFFERING'S PUBLIC TOKEN (`SVO-XXXX-XXXX`), which is what
 * `CAPABILITY_PATH_SEGMENTS` covers through `buscar` — the same entry the web's
 * `/turnos/buscar/[offeringToken]` is covered by, since the redaction rule keys
 * on the parent segment and both trees spell it the same way.
 */
export function buscarOfferingRoute(offeringToken: string): `/turnos/buscar/${string}` {
  return `/turnos/buscar/${encodeURIComponent(offeringToken)}`;
}
