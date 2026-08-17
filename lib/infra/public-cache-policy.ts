// Public "stateful" cache policy — privacy-class fix (2026-07-07).
//
// PROBLEM (staging/Vercel validation): several PUBLIC routes render mutable,
// privacy-sensitive state and were being served STALE from the CDN / Next
// full-route cache at the exact URL already shared:
//   • a REVOKED libreta share link kept serving the full medical libreta, and
//   • a pet marked FOUND kept serving "SE BUSCA" + the owner's disclosed phone
//     at the QR credential URL.
// Both are privacy-invariant breaches: revocation and lost→found MUST take
// effect on the exact public URL promptly. It never reproduced locally because
// there is no edge cache in local dev.
//
// ROOT CAUSE: every one of these pages already declares
// `export const dynamic = "force-dynamic"` — i.e. it is NEVER meant to be
// cached. `force-dynamic` opts the route out of Next's BUILD-TIME full route
// cache, but on its own it does NOT guarantee the rendered HTML is kept out of
// the CDN / shared cache. The observed staleness is exactly that: a shared
// cache retaining the response for the shared URL. The reliable lever is an
// explicit `Cache-Control: no-store` on the response, which forbids ANY shared
// cache from storing the page — so the next request always re-renders and the
// revocation / found / disclosure change is visible immediately.
//
// NO PERF REGRESSION: `force-dynamic` already means the function runs on every
// request; `no-store` only closes the CDN-caching hole that was violating that
// declaration. Static public pages (/ayuda, /privacidad, /terminos, /leyes,
// /acerca, …) are deliberately NOT in this set and keep their default caching.
//
// This module is intentionally dependency-free (pure string logic) so it can be
// imported by both the edge middleware and a plain unit test.

/**
 * Cache-Control value applied to public stateful routes. Mirrors the header
 * Next.js emits for dynamic responses, set explicitly so no shared/CDN cache
 * ever retains these privacy-sensitive pages.
 */
export const NO_STORE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

// Path PREFIXES whose entire subtree must always be live. Each carries a short
// rationale (per-route policy, per the audit).
const NO_STORE_PREFIXES: readonly string[] = [
  // QR public credential (+ /encontre, /sighting, opengraph-image). Flips
  // active↔lost, and in lost mode discloses the owner's phone / last-seen
  // location gated by the disclose_*_when_lost prefs. A found pet must stop
  // showing "SE BUSCA" + phone the instant the owner marks it found.
  "/p/",
  // Revocable Tier-2 MEDICAL share. The most sensitive public payload in the
  // product; a revoked or expired token must never keep serving the libreta.
  "/libreta/compartir/",
  // Adoption listing + detail (+ /postular). Reflects published/adopted state;
  // an adopted or unpublished pet must drop off the public surface promptly.
  "/adoptar",
  // Public denuncia status page. Body is gated by the VIEWER's identity
  // (auth-cookie dependent PII) — a shared cache could cross-serve one
  // viewer's PII-bearing variant to another.
  "/casos/",
  // Denuncia reference-code stub. It was NOT in this set while it was serving
  // the denunciante's free text, the description of the accused and signed
  // evidence URLs to any code holder — a CDN was free to retain all of it at the
  // exact shared URL. It now renders only existence + date, but it stays here:
  // it answers "does this code exist", which must reflect a deletion promptly,
  // and it renders differently once a reporter session cookie is present.
  "/denuncias/codigo/",
  // Reporter view. Cookie-gated PII whose whole design is a 60-minute window —
  // a shared cache retaining a rendered variant would defeat both the expiry and
  // the "Salir" button, and could cross-serve one reporter's denuncia to the
  // next visitor on the same edge node.
  "/denuncias/seguimiento",
];

// Exact paths (no subtree) that must always be live.
const NO_STORE_EXACT: readonly string[] = [
  // Lost-pet public listing. Reflects live lost/found state — a recovered pet
  // must not linger in the grid, and the KPI counts must be current.
  "/perdidas",
];

/**
 * True when `pathname` is a public route whose response must carry
 * `Cache-Control: no-store` so no shared cache retains its mutable, privacy-
 * sensitive state. `pathname` is the URL path only (no query string).
 */
export function isPublicNoStoreRoute(pathname: string): boolean {
  if (NO_STORE_EXACT.includes(pathname)) return true;
  return NO_STORE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
