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
  /**
   * The transfer hub — THE ONE TOP-LEVEL SCREEN THAT IS NOT ABOUT A PET THIS
   * PERSON HOLDS. Half of what it lists is offers from animals somebody else
   * owns, which is why it sits beside `/mascotas` rather than under it.
   *
   * The path deliberately matches the WEB's (`/transferencias`), unlike
   * `/mascotas` which shortens `/mis-mascotas`. The reason is the deep link: a
   * notification CTA and an invitation e-mail both name `/transferencias/{token}`,
   * and keeping the app's path identical means the `mimar://` form and the
   * `https` form differ only in scheme — one less place for the two to drift.
   */
  transferencias: "/transferencias",
} as const;

/**
 * One transfer proposal.
 *
 * THE DEEP-LINK-HEAVY ONE. This is where `mimar://transferencias/{PTR-…}` lands
 * and where the `pet_transfer_received` notification points, so the segment
 * shape here is not free: it must equal the web's `/transferencias/:transferToken`
 * so `DEEP_LINK_MAP.petTransfer` can carry both forms of one destination.
 */
export function transferRoute(transferToken: string): `/transferencias/${string}` {
  return `/transferencias/${encodeURIComponent(transferToken)}`;
}

/**
 * The "ofrecer la titularidad" form for one pet.
 *
 * NESTED UNDER THE PET even though the other three transfer commands are not,
 * and the asymmetry is the feature's: `initiate` is the only one addressed by an
 * ANIMAL. The other three name a proposal, and a proposal outlives the sender's
 * relationship to the pet — which is the whole point of accepting one.
 */
export function transferPetRoute(publicToken: string): `/mascotas/${string}/transferir` {
  return `/mascotas/${encodeURIComponent(publicToken)}/transferir`;
}

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

/**
 * The sharing cockpit for one pet — share links and the Tier-2 public window.
 *
 * A REAL ROUTE and not a face on the pet screen, for the reason modo perdida is
 * one: the faces are DOCUMENTS (the owner's chrome, the libreta, the public
 * credential) and this is a control panel over who may read them. It is also the
 * one screen in the app that holds bearer secrets, which is a second reason to
 * give it its own lifetime — it dies on back, and the tokens die with it.
 */
export function sharesRoute(publicToken: string): `/mascotas/${string}/compartir` {
  return `/mascotas/${encodeURIComponent(publicToken)}/compartir`;
}

/**
 * The cuidador-temporal cockpit for one pet — the TITULAR'S side.
 *
 * NESTED UNDER THE PET, unlike its sibling below, and the split is the feature's
 * rather than a layout choice: designating, withdrawing an invitation and ending
 * a live arrangement are all guarded against the ANIMAL (`requireTitularAccess`),
 * so the pet is genuinely in the address. What the invitee answers is not.
 */
export function caretakerPetRoute(publicToken: string): `/mascotas/${string}/cuidado` {
  return `/mascotas/${encodeURIComponent(publicToken)}/cuidado`;
}

/**
 * One caretaker invitation — the INVITEE'S side.
 *
 * TOP-LEVEL, because the person answering holds no ownership row on the animal:
 * that is what an invitation is. Nesting it under `/mascotas` would put an
 * address on a screen for somebody who is not (yet) responsible for the pet.
 *
 * THE PATH DELIBERATELY MATCHES THE WEB'S (`/cuidado/:grantToken`), for the
 * reason `/transferencias` does: this is a deep-link destination, the invitation
 * e-mail and the notification CTA both name the web form, and keeping the two
 * identical means the `mimar://` and `https` forms differ only in scheme — one
 * less place for `DEEP_LINK_MAP.caretakerGrant` to drift.
 */
export function caretakerGrantRoute(grantToken: string): `/cuidado/${string}` {
  return `/cuidado/${encodeURIComponent(grantToken)}`;
}

export type AppRoute =
  | (typeof ROUTES)[keyof typeof ROUTES]
  | ReturnType<typeof credentialRoute>
  | ReturnType<typeof libretaEventRoute>
  | ReturnType<typeof recordEventRoute>
  | ReturnType<typeof lostModeRoute>
  | ReturnType<typeof sharesRoute>
  | ReturnType<typeof transferRoute>
  | ReturnType<typeof transferPetRoute>
  | ReturnType<typeof caretakerPetRoute>
  | ReturnType<typeof caretakerGrantRoute>;
