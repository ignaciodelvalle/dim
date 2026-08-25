// Where the app talks to — the DATA plane and the AUTH plane, which are not the
// same host and must not be confused for one.
//
// THE EMPTY-STRING TRAP, WHICH THIS REPO HAS ALREADY PAID FOR ONCE
// ---------------------------------------------------------------------------
// `process.env.X ?? DEFAULT` is wrong here and the web app has the scar to
// prove it: an env var that is DEFINED BUT EMPTY (a `.env` line with nothing
// after the `=`, a CI variable declared and never filled) passes `??` — it is
// not nullish — and the empty string wins. In the web credential that produced
// a QR encoding a host-less relative URL, which no phone camera can resolve;
// the code that shipped it looked exactly as correct as `??` looks here.
//
// So: trim first, then fall back on anything falsy. Under Expo these values are
// INLINED by babel at bundle time — `EXPO_PUBLIC_API_BASE_URL` is substituted
// as a literal, not read from a runtime environment — which means a build made
// with the variable empty carries the empty string into the binary and there is
// no later opportunity to notice.
//
// TWO PLANES, ONE RULE
// ---------------------------------------------------------------------------
// DATA (pets, events, custody, the credential) goes through `/api/v1` with a
// bearer token, never through PostgREST — PO decision #2, taken because 14 of 15
// `ownerships`-derived RLS policies carry no role predicate and `pet_events`
// INSERT checks neither role nor event type (RLS audit 2026-08-18). AUTH (token
// refresh) goes to GoTrue directly, because that is what the Supabase SDK does
// on a timer and is unambiguously better at than a hand-rolled endpoint (clock
// skew, concurrent-refresh collapsing, retry). The two constants below are
// separate so nothing can quietly start reading tables with the auth client.

import { deepLinkUrl } from "@dim/contract/links";

/** Trim, then reject empty — see the header. */
function envUrl(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : fallback;
}

/** Same rule, for a value with no sensible default. */
function envValue(raw: string | undefined): string {
  return raw?.trim() ?? "";
}

/**
 * The API/web origin.
 *
 * Defaults to staging because that is where the flagship demo pet lives.
 * Override with `EXPO_PUBLIC_API_BASE_URL` (e.g. an ngrok tunnel to a local
 * `next dev` — a phone cannot reach `localhost`).
 */
export const API_BASE_URL = envUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  "https://dim-staging.vercel.app",
);

/**
 * The GoTrue origin and its publishable key, for TOKEN REFRESH ONLY.
 *
 * NO DEFAULT, deliberately, and this is the one place in this file that refuses
 * to guess. A wrong API origin produces a visible failure on the first screen; a
 * wrong auth origin produces an app that signs in fine and then silently stops
 * refreshing an hour later, which surfaces as "it logs me out sometimes" — the
 * exact symptom class this whole auth stack was written to avoid. Empty means
 * `authPlaneConfigured()` is false and the app says so, out loud, instead of
 * pretending.
 *
 * The anon key is publishable by design: it identifies the project and grants
 * nothing on its own. It is still read from the environment rather than pinned
 * here so a build can point at a different project without a code change.
 */
export const SUPABASE_URL = envValue(process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = envValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

/** Whether this build can refresh a session at all. See SUPABASE_URL. */
export function authPlaneConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * The URL the QR encodes: the PUBLIC WEB PAGE, not this app and not the API.
 *
 * Invariant #1 — the pet is the credential — means the code has to resolve for
 * whoever scans it, and that is a stranger with a phone camera and no MiMAR
 * install. `mimar://` would resolve for nobody; the API URL would hand them
 * JSON. Once verified App Links land (see `app.config.ts`) this exact `https`
 * URL starts opening the app for people who DO have it installed, and keeps
 * working unchanged for everyone else. That is why the QR must encode it now.
 *
 * The PATH comes from `@dim/contract/links` — the same table the web app builds
 * its own `/p/{token}` links from. It used to be a template literal here, which
 * meant the app and the server each carried a private opinion about where the
 * credential lives; a rename on one side produced a QR that resolved to a 404
 * and no compile error anywhere. The origin stays local, because only this
 * build knows which backend it points at.
 */
export function publicCredentialPageUrl(publicToken: string): string {
  return deepLinkUrl(API_BASE_URL, "credential", { publicToken });
}

/**
 * The web URL where identity completion happens, for the pending-profile gate.
 *
 * `/registro` and not a native form: there is no native identity flow and this
 * app must not fake one. The DNI hashing, the Ley 25.326 consent copy and the
 * Mi Argentina federation path all live on the web today, and a native form
 * posting "some fields" would be a second, weaker definition of what a verified
 * identity is.
 *
 * It is the RESUME surface by design — `app/(auth)/registro/page.tsx` keeps an
 * authenticated visitor whose identity is still provisional on the page and
 * shows step 2 directly, instead of bouncing them to `/mis-mascotas`. (That
 * guard exists because it used to bounce them, which is how 60% of owner
 * profiles ended up stuck on the trigger's provisional display name.)
 *
 * WHAT THE SCREEN MUST SAY, because this URL does not carry the native session:
 * the web resolves the visitor from a COOKIE and this app holds a bearer token,
 * so opening the link lands on a signed-out browser. The person has to sign in
 * again there with the same email. Saying so is the difference between a link
 * that works and a link that looks broken.
 */
export const IDENTITY_COMPLETION_URL = `${API_BASE_URL}/registro`;

/**
 * The web URL where a forgotten password is reset.
 *
 * THE HONEST BRIDGE, not a missing feature. The web login offers "¿Olvidaste tu
 * contraseña?" and this app offered nothing, so the one person who needs it —
 * somebody locked out of the only screen the app can show them — had no way
 * forward at all. There is no NATIVE recovery flow to link to and building one
 * here would be the same mistake as a native identity form (see
 * IDENTITY_COMPLETION_URL): the reset round-trip is an emailed link that opens
 * in a BROWSER, so the native half would end at the same web page anyway, minus
 * the rate limiting and the account-state refusals that live there.
 *
 * So the app opens the browser at `/recuperar` — the same href the web login's
 * link carries (app/(auth)/iniciar-sesion/LoginForm.tsx). Unlike the identity
 * link this one needs no warning about a lost session: password recovery starts
 * signed out by definition.
 */
export const PASSWORD_RECOVERY_URL = `${API_BASE_URL}/recuperar`;
