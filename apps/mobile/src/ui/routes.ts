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

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES] | ReturnType<typeof credentialRoute>;
