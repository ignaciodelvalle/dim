/**
 * Single source of truth for miMAR branding.
 *
 * Reference these constants instead of hardcoding the name/logo, so a rebrand
 * — or swapping the provisional logo for the final asset — is a one-file
 * change. This is intentionally build-time config, NOT a runtime settings
 * screen: miMAR is single-tenant with a fixed brand, so a DB-backed admin
 * setting would be over-engineering. Promote to a settings screen only once
 * there are several genuinely runtime-tunable values.
 */
export const BRANDING = {
  /** Short wordmark. */
  appName: "miMAR",
  /** Full institutional name. */
  appNameLong: "Mi Mascota Argentina",
  /** One-line descriptor. */
  tagline: "Credencial digital sanitaria",
  /** Logo asset in /public. Provisional — convert to outlined paths for prod. */
  logoSrc: "/logo-mimar.svg",
} as const;
