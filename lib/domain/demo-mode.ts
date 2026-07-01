// lib/demo-mode.ts — server-safe demo-mode flag helper.
//
// Lives OUTSIDE any "use client" module so the server-side admin layout can
// import it without crashing the /admin segment (regression fixed in WP0/A1).
// Both app/admin/layout.tsx (server) and components/ui/DemoModeBanner.tsx
// (client) import shouldShowDemoBanner from here — one source of truth.

/**
 * Returns true when the demo banner should be shown.
 *
 * Accepts the raw NEXT_PUBLIC_DEMO_MODE env string so it stays pure and
 * testable without the DOM or process.env. Only the exact string "true"
 * enables it — anything else (undefined, "false", "1", "TRUE") is off, so the
 * banner never appears in production by default.
 */
export function shouldShowDemoBanner(envValue: string | undefined): boolean {
  return envValue === "true";
}
