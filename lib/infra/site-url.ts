// Single canonical resolver for the app's public origin.
//
// Historically the codebase carried three divergent hardcoded fallbacks for
// NEXT_PUBLIC_SITE_URL — "https://mimar.ar", "https://mimar.gob.ar", and
// "https://www.mimar.gob.ar" — so an unset var produced a different domain
// depending on which page rendered it (credential QR vs adoption ficha vs org
// invite). This funnels every one of those call sites through ONE fallback.
//
// The empty-string case matters: `vercel env` can set a var to "" (not unset),
// and `?? "…"` does NOT catch that — it would leave a host-less relative URL
// that no phone camera can resolve (a real past QR bug on the landing hero).
// We read with `.trim()` and a truthiness fallback so a set-but-empty or
// whitespace-only value still lands on the canonical default. A trailing slash
// is stripped so callers can safely append `/p/{token}` etc.
//
// Canonical fallback = the short brand domain we currently control. The real
// production domain is set explicitly via NEXT_PUBLIC_SITE_URL in Vercel (see
// docs/ops/production-deploy-plan.md "Site URL consistency") — this fallback is
// only ever exercised in local dev / preview where the var isn't set.
//
// NOT covered here (deliberately different semantics, left as-is):
//   - app/sitemap.ts — fails LOUD in production rather than guessing a domain
//     for search engines; a silent fallback there would be a regression.
//   - app/layout.tsx metadataBase & components/pet-profile/LostCaseBlock.tsx —
//     fall back to http://localhost:3000 on purpose (never advertise a guessed
//     production origin from those surfaces).

const CANONICAL_SITE_URL = "https://mimar.ar";

/**
 * Resolves the app's public origin from NEXT_PUBLIC_SITE_URL, trimming
 * whitespace, dropping any trailing slash, and falling back to the single
 * canonical brand domain when the var is unset, empty, or whitespace-only.
 */
export function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  return raw.replace(/\/+$/, "") || CANONICAL_SITE_URL;
}

/**
 * Absolute URL a credential QR encodes for a pet's public page.
 *
 * Always absolute: `resolveSiteUrl()` never returns an empty origin (the
 * set-but-empty NEXT_PUBLIC_SITE_URL case falls back to the canonical brand
 * domain), so the QR can never encode a host-less relative URL that a phone
 * camera cannot resolve — the real past landing-hero bug this module cures.
 */
export function credentialQrUrl(publicToken: string): string {
  return `${resolveSiteUrl()}/p/${publicToken}`;
}
