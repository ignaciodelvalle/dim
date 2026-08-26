// `deepLinkMap` — one table mapping a LOGICAL DESTINATION to the path that
// resolves it (native-readiness T3.3).
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// Every surface that has to send somebody somewhere was building the path by
// hand, in a template literal, at the point of use. That is fine while there is
// exactly one consumer. There are now three, and they disagree about what a
// path even IS:
//
//   • the web app renders `<Link href={`/p/${token}`}>` — a path, no origin;
//   • a QR, a share sheet and an e-mail need an ABSOLUTE url, so the origin has
//     to come from somewhere (`window.location.origin`, `NEXT_PUBLIC_SITE_URL`,
//     `EXPO_PUBLIC_API_BASE_URL`) and each site picked its own;
//   • the check-in QR at `/mis-turnos/{token}` encodes `mimar://appointment/…`,
//     a CUSTOM SCHEME whose path shape (`appointment/…`) matches no web route
//     at all — and nothing anywhere recorded that the two forms of the same
//     destination had drifted apart.
//
// A fourth consumer is coming and is the reason this is a package and not a
// `lib/` module: the native router. When the phone receives a link it has to
// decide which screen it names, and it must make that decision from the SAME
// table the web app builds its urls from, or the two answer differently for the
// same string — which on a lost-pet QR means the scanner lands nowhere.
//
// WHAT IT IS NOT
// ---------------------------------------------------------------------------
// It is NOT a route registry, and it deliberately does not list every page in
// the app. A destination belongs here when something OUTSIDE the rendering
// surface has to name it: a QR, a notification CTA, an invitation e-mail, a
// share sheet, the native router. Internal navigation between two pages of the
// web app is `<Link href="…">` and should stay that way — putting 400 routes in
// this table would make it a second, worse copy of the file system router.
//
// It also does not know an origin. `deepLinkPath` returns a path; the caller
// that needs an absolute url passes its own origin to `deepLinkUrl`, because
// which origin is correct is a question only the caller can answer (the browser
// knows `window.location.origin`; a server render knows `NEXT_PUBLIC_SITE_URL`;
// the phone knows which backend its build points at).
//
// ZERO RUNTIME DEPENDENCIES, and it stays that way: this module is plain string
// work. See scripts/check-contract-purity.ts.

/**
 * The app's custom URL scheme, declared in `apps/mobile/app.json`.
 *
 * It resolves ONLY on a device that has the app installed, because the app
 * claims it by installing — no coordination with anyone, and no verification
 * either: any app could have claimed it. That is exactly why almost nothing
 * uses it (see `appPath` below).
 */
export const APP_SCHEME = "mimar";

/**
 * The Android application id and the iOS bundle identifier.
 *
 * These live HERE, next to the scheme, because they are not private to the
 * mobile app: they are how the app is NAMED in the link-claiming handshake, and
 * the other half of that handshake is served by the web app.
 * `/.well-known/assetlinks.json` publishes `package_name` — get it wrong by one
 * character and Android's verifier rejects the association silently, leaving
 * every link opening in Chrome with no error anywhere. Two copies of a string
 * that must agree, in two programs that never import each other, is exactly the
 * drift `packages/contract` exists to make impossible.
 *
 * `apps/mobile/app.config.ts` sets `android.package` / `ios.bundleIdentifier`
 * from these, so the Expo build and the well-known file cannot disagree.
 */
export const ANDROID_PACKAGE_NAME = "ar.mimar.app";
export const IOS_BUNDLE_IDENTIFIER = "ar.mimar.app";

/** Who can reach the destination once they hold the link. */
export type DeepLinkAccess =
  /** Anyone holding the link. The token IS the credential. */
  | "public"
  /** Requires a signed-in session; the page redirects to login otherwise. */
  | "session";

export type DeepLinkDestination = {
  /**
   * The web path, with `:name` placeholders. This is the canonical form: it is
   * what a QR encodes, what an e-mail links to, and what verified App Links
   * will hand the native router once they exist.
   */
  readonly webPath: string;
  /**
   * The path AFTER `mimar://`, or `null` when the app does not claim this
   * destination — which is still most of them, on purpose.
   *
   * A NON-NULL VALUE IS A CLAIM THAT A SCREEN EXISTS, and `__tests__/deep-link-
   * map.test.ts` checks it against `apps/mobile/app/` — the file-system router,
   * which cannot lie about which screens are there. That check is the whole
   * reason this field is worth filling: a `mimar://` url that resolves to
   * nothing does not error, it opens the app on a blank stack, which is the
   * failure mode custom schemes are notorious for.
   *
   * IT IS NOT THE WEB PATH WITH A DIFFERENT SCHEME. The app's own routes are
   * shorter in places (`mascotas/…` against the web's `/mis-mascotas/…`), so the
   * two halves of one destination genuinely differ and this table is where that
   * difference is recorded instead of being rediscovered.
   *
   * A custom scheme still cannot be the canonical form of anything a stranger
   * might scan: no phone camera follows `mimar://…` from a QR it finds in the
   * street, and it must not. That is why every PUBLIC destination below is
   * `null` and will stay `null`. When verified App Links land (blocked on a
   * Play-signed fingerprint — see apps/mobile/app.config.ts) these paths become
   * the router's mapping from the `https` form, and this table is what stops the
   * two from drifting.
   */
  readonly appPath: string | null;
  readonly access: DeepLinkAccess;
};

/**
 * The table.
 *
 * Keys are LOGICAL names, not paths — that is the whole point. `/casos/:code`
 * can move to `/expedientes/:code` and every caller keeps compiling; a caller
 * that had hard-coded the string would not, and would not have been found
 * either, because `/casos/` appears in prose and in tests too.
 */
export const DEEP_LINK_MAP = {
  // -------------------------------------------------------------------------
  // Public — the pet IS the credential (invariant #1). Everything here resolves
  // for a stranger with a phone camera and no MiMAR install.
  // -------------------------------------------------------------------------

  /** The QR-verifiable public credential. The most important link in the product. */
  credential: { webPath: "/p/:publicToken", appPath: null, access: "public" },

  /** "I have this animal" — the finder-in-possession flow. */
  credentialFinder: { webPath: "/p/:publicToken/encontre", appPath: null, access: "public" },

  /** "I saw this animal" — the sighting report. */
  credentialSighting: { webPath: "/p/:publicToken/sighting", appPath: null, access: "public" },

  /** A physical tag's serial, which redirects to that pet's credential. */
  tag: { webPath: "/t/:serial", appPath: null, access: "public" },

  /** A pet published for adoption. */
  adoptionListing: { webPath: "/adoptar/:petToken", appPath: null, access: "public" },

  /** An organization's public profile. */
  shelter: { webPath: "/refugios/:orgToken", appPath: null, access: "public" },

  /** A welfare case by its public code — the citizen-facing view. */
  welfareCase: { webPath: "/casos/:publicCode", appPath: null, access: "public" },

  /** A welfare report tracked by the reference code handed to the reporter. */
  welfareReport: { webPath: "/denuncias/codigo/:referenceCode", appPath: null, access: "public" },

  /** A revocable share of a pet's health record. */
  libretaShare: { webPath: "/libreta/compartir/:shareToken", appPath: null, access: "public" },

  // -------------------------------------------------------------------------
  // Session — a notification CTA or an invitation lands here, and the page
  // sends the caller to login first when there is no session.
  // -------------------------------------------------------------------------

  /**
   * The owner's view of one of their pets.
   *
   * THE APP'S PATH IS SHORTER, and the difference is not cosmetic: the native
   * route is `mascotas/…` because in an app that only ever shows you your own
   * animals, "mis" is a word the URL does not need. The web says `/mis-mascotas`
   * because it also has `/p/…` and `/org/…/mascotas/…` to distinguish it from.
   */
  pet: {
    webPath: "/mis-mascotas/:publicToken",
    appPath: "mascotas/:publicToken",
    access: "session",
  },

  /** The owner's pet list — where several notifications land when no one pet is the subject. */
  myPets: { webPath: "/mis-mascotas", appPath: "mascotas", access: "session" },

  /**
   * ONE ASIENTO of one animal's libreta.
   *
   * IT EARNS A ROW because something outside names it: the vaccination-due and
   * correction notifications link to `/mis-mascotas/{token}/eventos/{id}`. That
   * is the bar this table sets in its own header, and it is why the LIBRETA and
   * the LOST-MODE cockpit are NOT here even though the app has screens for both
   * — nothing outside either surface names them, and a row for every screen the
   * app happens to have would make this a second, worse copy of two routers.
   */
  petEvent: {
    webPath: "/mis-mascotas/:publicToken/eventos/:eventId",
    appPath: "mascotas/:publicToken/eventos/:eventId",
    access: "session",
  },

  /**
   * One appointment, and THE ONE ENTRY WITH A CUSTOM-SCHEME FORM.
   *
   * The page renders a check-in QR encoding `mimar://appointment/{token}`. It
   * is a placeholder for a front-desk scan that has no reader yet, and it is
   * kept working verbatim: changing it to an `https` url today would be a claim
   * that the installed app opens it, which needs a verified App Link, which
   * needs a Play-signed fingerprint that does not exist (apps/mobile/app.config.ts).
   *
   * Note that `appPath` is NOT `mis-turnos/:appointmentToken`. The two forms of
   * this destination really did drift, in two files that never met. Recording
   * the drift here is the first step to closing it.
   *
   * AND IT IS THE ONE ENTRY WHOSE `appPath` NAMES NO SCREEN. Every other value
   * in this column is a claim the app can honour, checked against
   * `apps/mobile/app/` by the fitness test. This one is a QR PAYLOAD for a
   * front-desk reader that does not exist yet, and it is kept byte-for-byte
   * because changing the string would break whatever eventually reads it. The
   * test names it as the single exception rather than weakening the rule for
   * everything; a phone that follows it today lands on `+not-found`, which says
   * so in words.
   */
  appointment: {
    webPath: "/mis-turnos/:appointmentToken",
    appPath: "appointment/:appointmentToken",
    access: "session",
  },

  /** A caretaker invitation — the `/cuidado/{token}` key handed to the invitee. */
  caretakerGrant: { webPath: "/cuidado/:grantToken", appPath: null, access: "session" },

  /** An invitation to join an organization. */
  orgInvitation: { webPath: "/r/invite/:invitationToken", appPath: null, access: "session" },

  /**
   * A pending ownership transfer — THE DEEP-LINK-HEAVY ONE.
   *
   * Two notifications point here (`pet_transfer_received` to the addressee,
   * `pet_transfer_initiated` to the sender), and the invitation e-mail sent to
   * an address with no account yet lands here too. It is therefore the
   * destination most likely to be opened by somebody who did not navigate to it,
   * and the reason the app's path is kept IDENTICAL to the web's: the two forms
   * differ only in scheme, which is one less place for them to drift.
   */
  petTransfer: {
    webPath: "/transferencias/:transferToken",
    appPath: "transferencias/:transferToken",
    access: "session",
  },

  /** A foster-care proposal awaiting the fosterer's answer. */
  fosterProposal: {
    webPath: "/cuenta/transitos/propuestas/:proposalToken",
    appPath: null,
    access: "session",
  },

  /** The inbox of invitations and requests addressed to the signed-in person. */
  accountRequests: { webPath: "/cuenta/solicitudes", appPath: null, access: "session" },
} as const satisfies Record<string, DeepLinkDestination>;

export type DeepLinkName = keyof typeof DEEP_LINK_MAP;

/**
 * The `:name` placeholders of a path pattern, as a union of string literals.
 *
 * This is what makes the table worth using instead of a template literal: pass
 * `{ token }` where the pattern says `:publicToken` and it is a COMPILE error,
 * in both programs, rather than a url with a literal `:publicToken` in it.
 */
type PathParams<S extends string> = S extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParams<`/${Rest}`>
  : S extends `${string}:${infer Param}`
    ? Param
    : never;

/** The arguments a destination needs. `{}` for the ones with no placeholders. */
export type DeepLinkParams<N extends DeepLinkName> = Record<
  PathParams<(typeof DEEP_LINK_MAP)[N]["webPath"]>,
  string
>;

/** The placeholder names of a pattern, at runtime — for fences and routers. */
export function pathParamNames(pattern: string): string[] {
  return pattern
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

function fillPattern(pattern: string, params: Record<string, string>, name: string): string {
  return pattern
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const key = segment.slice(1);
      const value = params[key];
      // A missing value must never become the string "undefined" in a url
      // somebody is about to print on a poster.
      if (value === undefined || value === "") {
        throw new Error(`deepLink("${name}"): missing value for ":${key}" in "${pattern}".`);
      }
      // Tokens are `[A-Z0-9-]` and encode to themselves, so this is a no-op for
      // the credential path. It is not a no-op for a welfare reference code or
      // anything else a human might one day be allowed to choose.
      return encodeURIComponent(value);
    })
    .join("/");
}

/**
 * The path for a destination — no origin, no scheme. What `<Link href>` takes.
 *
 *   deepLinkPath("credential", { publicToken })  // "/p/DIM-PAMP-0001"
 */
export function deepLinkPath<N extends DeepLinkName>(name: N, params: DeepLinkParams<N>): string {
  return fillPattern(DEEP_LINK_MAP[name].webPath, params as Record<string, string>, name);
}

/**
 * The absolute url for a destination. The CALLER supplies the origin, because
 * only the caller knows which one is right (see the header).
 *
 * A trailing slash on the origin is tolerated and removed — the empty-string
 * trap this repo has already paid for once is a DIFFERENT bug and belongs at
 * the site that reads the environment variable, not here.
 */
export function deepLinkUrl<N extends DeepLinkName>(
  origin: string,
  name: N,
  params: DeepLinkParams<N>,
): string {
  return `${origin.replace(/\/+$/, "")}${deepLinkPath(name, params)}`;
}

/**
 * The `mimar://` url for the one destination that has a custom-scheme form.
 *
 * Throws for every other name, deliberately: inventing a scheme url for a
 * destination the app does not claim produces a link that silently opens
 * nothing, which is the failure mode custom schemes are notorious for.
 */
export function deepLinkAppUrl<N extends DeepLinkName>(name: N, params: DeepLinkParams<N>): string {
  const { appPath } = DEEP_LINK_MAP[name];
  if (appPath === null) {
    throw new Error(
      [
        `deepLinkAppUrl("${name}"): this destination has no ${APP_SCHEME}:// form.`,
        "Use deepLinkUrl() with an https origin — a custom scheme resolves only on a device",
        "that already has the app, and resolves to nothing everywhere else.",
      ].join(" "),
    );
  }
  return `${APP_SCHEME}://${fillPattern(appPath, params as Record<string, string>, name)}`;
}
