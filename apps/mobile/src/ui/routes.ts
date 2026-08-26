// The route tree, named once.
//
// WHY THIS FILE AND NOT `experiments.typedRoutes`
// ---------------------------------------------------------------------------
// expo-router can generate route types into `.expo/types/router.d.ts` — during
// `expo start` or `expo export`. That is the problem: `.expo/` is a build
// artifact, it is gitignored, and `pnpm --filter mimar typecheck` runs on CI
// against a checkout that has never started the bundler. Turning typed routes on
// would make the typecheck depend on an artifact the typecheck cannot produce,
// which is either a red build on a clean clone or a `d.ts` committed by hand and
// then quietly wrong.
//
// So the paths live here, as literals, and every navigation goes through them.
// It buys the same thing typed routes buy — a rename is a compile error at every
// call site, not a screen that silently fails to open — with no generated file
// in the loop.

export const ROUTES = {
  /** The gate. Decides where a cold start actually lands. */
  root: "/",
  ingreso: "/ingreso",
  identidadPendiente: "/identidad-pendiente",
  misMascotas: "/mascotas",
  altaMascota: "/alta",
  ajustes: "/ajustes",
} as const;

/** One pet's credential. */
export function credentialRoute(publicToken: string): `/mascotas/${string}` {
  return `/mascotas/${encodeURIComponent(publicToken)}`;
}

/**
 * One asiento of one pet's libreta.
 *
 * A REAL ROUTE and not a panel inside the libreta tab, because a detail screen
 * is a page: it earns the back gesture, the stack header and — when the deep
 * link work lands — an address. Nesting it under the pet is what makes the back
 * gesture land on the libreta rather than on the pet list.
 */
export function libretaEventRoute(
  publicToken: string,
  eventId: string,
): `/mascotas/${string}/eventos/${string}` {
  return `/mascotas/${encodeURIComponent(publicToken)}/eventos/${encodeURIComponent(eventId)}`;
}

/**
 * The "Asentar" form for one pet.
 *
 * `kind` and `source` are OPTIONAL and travel together: they exist for the
 * "Terminar medicación" affordance on a `medication_started` asiento, which is
 * the only place a person already holds the identifier a medication END needs.
 * Called with neither, this opens the picker.
 */
export function recordEventRoute(
  publicToken: string,
  options: { kind?: string; sourceEventId?: string } = {},
): `/mascotas/${string}/asentar${string}` {
  const query = new URLSearchParams();
  if (options.kind) query.set("kind", options.kind);
  if (options.sourceEventId) query.set("source", options.sourceEventId);
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  return `/mascotas/${encodeURIComponent(publicToken)}/asentar${suffix}`;
}

/**
 * The lost-mode cockpit for one pet.
 *
 * A REAL ROUTE and not a fourth face on the pet screen, because it is not a
 * FACE: the three faces are documents (the owner's chrome, the libreta, the
 * public credential) and this is a workflow that only exists some of the time.
 * Nesting it under the pet is what makes the back gesture land on the animal
 * somebody came from.
 */
export function lostModeRoute(publicToken: string): `/mascotas/${string}/perdida` {
  return `/mascotas/${encodeURIComponent(publicToken)}/perdida`;
}

export type AppRoute =
  | (typeof ROUTES)[keyof typeof ROUTES]
  | ReturnType<typeof credentialRoute>
  | ReturnType<typeof libretaEventRoute>
  | ReturnType<typeof recordEventRoute>
  | ReturnType<typeof lostModeRoute>;
