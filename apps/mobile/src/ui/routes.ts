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
  /**
   * Step 1 of the signup — the account. Step 2 (the identity) is
   * `identidadPendiente` below, which hands the person a web URL.
   *
   * The path deliberately does NOT match the web's, which is `/registro`. The
   * reason `/transferencias` and `/cuidado` match theirs is that both are
   * deep-link destinations shared with a notification or an e-mail; nothing
   * links INTO a signup form from outside the app, so this path is free to say
   * what the screen does in the words the screen uses ("Crear cuenta") rather
   * than in the word the web's router happens to use.
   */
  crearCuenta: "/crear-cuenta",
  /**
   * Password recovery — ask for a code, then set a new password.
   *
   * The path MATCHES the web's (`/recuperar`), and for once that is not the
   * deep-link reason `/transferencias` and `/cuidado` match theirs. Nothing links
   * into this screen from outside the app and nothing may: it is NOT in
   * `DEEP_LINK_MAP` and must never be added to it. A `mimar://recuperar` url
   * would be an unverified custom scheme any installed app can claim, standing
   * in front of the one flow whose entire job is to hand back control of an
   * account. The paths agree here simply because both surfaces call the act the
   * same thing.
   */
  recuperar: "/recuperar",
  identidadPendiente: "/identidad-pendiente",
  misMascotas: "/mascotas",
  altaMascota: "/alta",
  ajustes: "/ajustes",
  /**
   * The Ley 25.326 rights — descargar mis datos (art. 14) and eliminar mi cuenta
   * (art. 16).
   *
   * THE PATH MATCHES THE WEB'S EXACTLY (`/cuenta/privacidad`) and here that is
   * not the forward-looking deep-link argument `/notificaciones` makes: this
   * URL is ALREADY in the world. `ACCOUNT_DELETION_URL` has been handing it to
   * people in a browser since the Play submission and the Data safety form
   * names it. Choosing `/ajustes/privacidad` — which is where the entry point
   * actually is — would have meant the one screen a store reviewer is told to
   * look for lives at a different address in the two clients.
   */
  privacidad: "/cuenta/privacidad",
  /**
   * Editar mis datos — name, phone, and the DEFAULT vet / emergency contact
   * every pet's own override falls back to.
   *
   * Beside `privacidad` under `/cuenta` rather than under `/ajustes`, where its
   * button is. The deep-link argument that pins `privacidad` does not apply here
   * — nothing outside the app links in — but two account screens at two
   * different depths, each for its own local reason, is how a route tree stops
   * describing anything. The web's leaf is `/cuenta/editar` too, so the paths
   * agree for free.
   */
  editarCuenta: "/cuenta/editar",
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
  /**
   * La bandeja — THE OTHER TOP-LEVEL SCREEN THAT IS NOT ABOUT A PET THIS PERSON
   * HOLDS, and the one where the reason is plainest: a notification is addressed
   * to a person, not to an animal. Some rows are about a pet, several are about a
   * pet whose custody LEFT the reader (that is what `pet_transfer_accepted` is),
   * and some are about no animal at all.
   *
   * The path matches the WEB's for the reason `/transferencias` does, one step
   * early: nothing links in from outside today — `DEEP_LINK_MAP` has no row for
   * it, because nothing outside the rendering surface names it — but a push
   * opening the inbox is exactly what the next work unit is, and two paths that
   * already agree are one less thing to reconcile when it lands.
   */
  notificaciones: "/notificaciones",
  /**
   * MIS TURNOS — the third top-level screen that is not one pet's.
   *
   * Every row DOES name an animal, unlike the two above, and it still sits
   * beside `/mascotas` rather than under it: the question the screen answers is
   * "what do I have booked", across every animal this person is responsible for,
   * ordered by time. It also lists turnos for animals they do not own, because
   * booking accepts any active ownership role — a foster's turno is the foster's.
   *
   * THE PATH SHORTENS THE WEB'S `/mis-turnos`, exactly as `/mascotas` shortens
   * `/mis-mascotas` and for the same reason: in an app that only ever shows you
   * your own, "mis" is a word the URL does not need. Nothing deep-links here —
   * `DEEP_LINK_MAP.appointment` names the WEB path and its `mimar://` form is a
   * QR payload for a reader that does not exist yet (see `turnos-view-model.ts`)
   * — so unlike `/transferencias` this path is free to say what the screen is.
   */
  turnos: "/turnos",
  /**
   * RECLAMAR UNA MASCOTA — the only top-level screen that is about an animal
   * this person does NOT hold, and does not (yet) have any relationship to.
   *
   * `/transferencias` and `/notificaciones` sit beside `/mascotas` because HALF
   * of what they carry is about somebody else's animal. This one is further out:
   * ALL of it is, by definition. It is also why the path names no pet — the
   * server resolves the animal from the private identifier and refuses to be
   * told which one it is, which is the whole authorization story of the feature
   * (`submit-free-claim.ts` calls the identifier "the evidence").
   *
   * THE PATH SHORTENS THE WEB'S `/mis-mascotas/reclamar`, the way `/mascotas`
   * shortens `/mis-mascotas`: the web nests it under the list because that is
   * where its entry point is, and a stack navigator has no such requirement.
   * Nothing deep-links here and nothing may — a `mimar://reclamar` URL would be
   * an unverified custom scheme any installed app can claim, standing in front
   * of the flow that hands over an animal.
   */
  reclamar: "/reclamar",
  /**
   * El catálogo de adopción — THE FIRST SCREEN IN THIS APP ABOUT ANIMALS NOBODY
   * IN IT HOLDS. `/mascotas` is what this person is responsible for;
   * `/transferencias` and `/notificaciones` are addressed to them. This one is a
   * public catalogue a shelter published, and it sits beside those three rather
   * than under any of them for exactly that reason.
   *
   * THE PATH IS `/adoptar` AND NOT `/adopciones`, matching the WEB's public
   * landing rather than the org-side queue's. That distinction is the whole
   * feature: `/adopciones` on the web is what a REFUGIO opens to review
   * applications, and this app has no org surfaces at all. Naming the citizen
   * screen after the org one would put the two a rename apart.
   */
  adoptar: "/adoptar",
  /**
   * Mis postulaciones.
   *
   * UNDER `/adoptar` AND NOT UNDER `/mascotas`, which is where the WEB puts it
   * (`/mis-mascotas/postulaciones`). The web's placement is a fact about its
   * navigation — everything a citizen owns hangs off `/mis-mascotas` there — and
   * following it here would file "animals I asked to adopt" under "animals I am
   * responsible for", which is the one distinction this screen exists to keep.
   * A person with no pets has postulaciones; a person with postulaciones has no
   * pet yet, by definition.
   *
   * Nothing links in from outside the app, so no deep-link argument pins the
   * path — and if one ever does, `DEEP_LINK_MAP` is where the two forms are
   * reconciled, not here.
   */
  adoptarPostulaciones: "/adoptar/postulaciones",
} as const;

/**
 * One turno.
 *
 * NOT A DEEP-LINK DESTINATION, and the distinction matters here more than
 * anywhere else in this file. `DEEP_LINK_MAP.appointment` is the single entry
 * whose `appPath` names no screen (`APP_PATH_NAMES_NO_SCREEN`): it is
 * `appointment/{token}`, a QR payload kept byte-for-byte for a front-desk reader
 * that has never been built, and it does NOT match this route. Adding this path
 * to that table would change the string the web already prints on every check-in
 * QR, which is a debt to close deliberately and not a side effect of adding a
 * screen. Recorded here so the next reader does not "fix" the mismatch by hand.
 */
export function turnoRoute(appointmentToken: string): `/turnos/${string}` {
  return `/turnos/${encodeURIComponent(appointmentToken)}`;
}

/**
 * One adoption ficha.
 *
 * THE SEGMENT IS THE PET'S PUBLIC TOKEN, which makes this path collide in shape
 * with `/adoptar/postulaciones` — expo-router resolves the STATIC segment first,
 * so a shelter would have to publish an animal whose token is literally
 * "postulaciones" for that to matter, and tokens are `DIM-XXXX-XXXX`. Said out
 * loud because a future static sibling with a token-shaped name would not be so
 * safe.
 */
export function adoptionDetailRoute(petToken: string): `/adoptar/${string}` {
  return `/adoptar/${encodeURIComponent(petToken)}`;
}

/**
 * The application form for one animal.
 *
 * NESTED UNDER THE FICHA rather than living beside it, and the reason is the
 * back gesture: somebody who abandons the form should land on the animal they
 * were reading about, not on the catalogue they scrolled past. The web nests it
 * the same way (`/adoptar/{token}/postular`) for the same reason.
 */
export function adoptionApplyRoute(
  petToken: string,
  petName?: string | null,
): `/adoptar/${string}/postular${string}` {
  // THE NAME IS DISPLAY COPY AND NOTHING ELSE. It travels so the form can say
  // "Adoptar a Lola" instead of "Postularme", and the screen it lands on already
  // holds the animal's whole ficha — so this is one string, not a second round
  // trip for a word the caller has in its hand. Nothing branches on it: if it is
  // absent or stale the title degrades and no request changes, because the
  // ANIMAL is named by the path segment the server resolves.
  const suffix = petName ? `?petName=${encodeURIComponent(petName)}` : "";
  return `/adoptar/${encodeURIComponent(petToken)}/postular${suffix}`;
}

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
 * One pet's PUBLIC credential — the anonymous document behind the QR.
 *
 * A ROUTE AND NOT A FACE, since the two-face rewrite (PO decision, 2026-08-28):
 * the web's card has exactly two faces (Credencial · frente, Libreta · dorso)
 * and its public document lives one tap away at `/p/{token}`. This is that tap,
 * reached from the profile's QR block and from "Más" — mirroring where the web
 * puts it rather than surfacing the public page as a third tab beside the two
 * faces it is not one of.
 */
export function publicCredentialRoute(publicToken: string): `/mascotas/${string}/credencial` {
  return `/mascotas/${encodeURIComponent(publicToken)}/credencial`;
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
 * Editar los datos de la mascota, and the emergency contacts, on ONE screen.
 *
 * TWO ENTRY POINTS LAND HERE and that is deliberate. The web keeps them as two
 * rows of the "⋯ Más" sheet — "Editar datos y ficha" and "Contactos de
 * emergencia" — because each opens a different `?sheet=`, which is a URL
 * mechanism a stack navigator does not have. Splitting them into two native
 * routes would have bought a second copy of one fetch, one guard-derived
 * capability pair and one save path, to hide a card a person can already see by
 * scrolling. The two entry points differ in what they PROMISE and in nothing
 * else: this function takes no section argument, the screen renders both cards
 * in a fixed order — datos, then contactos — and whichever row was tapped, the
 * other is one scroll away.
 *
 * The path matches the WEB's leaf (`/mis-mascotas/{token}/editar`), unlike the
 * `?sheet=` half: nothing deep-links in today, and when something does, the
 * `mimar://` and `https` forms will already agree on the word.
 */
export function editPetRoute(publicToken: string): `/mascotas/${string}/editar` {
  return `/mascotas/${encodeURIComponent(publicToken)}/editar`;
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
  | ReturnType<typeof publicCredentialRoute>
  | ReturnType<typeof libretaEventRoute>
  | ReturnType<typeof recordEventRoute>
  | ReturnType<typeof lostModeRoute>
  | ReturnType<typeof sharesRoute>
  | ReturnType<typeof editPetRoute>
  | ReturnType<typeof transferRoute>
  | ReturnType<typeof transferPetRoute>
  | ReturnType<typeof caretakerPetRoute>
  | ReturnType<typeof caretakerGrantRoute>
  | ReturnType<typeof turnoRoute>;
