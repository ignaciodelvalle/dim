// Where the app talks to, and the one token the M1 spike reads.
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

/** Trim, then reject empty — see the header. */
function envUrl(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : fallback;
}

/**
 * The API/web origin.
 *
 * Defaults to staging because that is where the flagship demo pet lives and
 * because M1 has no auth: every read this app makes today is public, so
 * pointing a developer's build at staging leaks nothing and costs no setup.
 * Override with `EXPO_PUBLIC_API_BASE_URL` (e.g. an ngrok tunnel to a local
 * `next dev` — a phone cannot reach `localhost`).
 */
export const API_BASE_URL = envUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  "https://dim-staging.vercel.app",
);

/**
 * The flagship demo pet. Hard-coded for the spike ONLY.
 *
 * M2 replaces this with the signed-in owner's pets; there is no token entry
 * field here because a screen that asks a user to type `DIM-PAMP-0001` is a
 * screen we would then have to delete.
 */
export const SPIKE_PUBLIC_TOKEN = "DIM-PAMP-0001";

/** `GET {base}/api/v1/pets/{token}/credential` — the one endpoint that exists. */
export function credentialEndpoint(publicToken: string): string {
  return `${API_BASE_URL}/api/v1/pets/${encodeURIComponent(publicToken)}/credential`;
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
 */
export function publicCredentialPageUrl(publicToken: string): string {
  return `${API_BASE_URL}/p/${encodeURIComponent(publicToken)}`;
}
