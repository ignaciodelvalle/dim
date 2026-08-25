// The palette and spacing the whole app draws from.
//
// Lifted out of `CredentialScreen`'s local `StyleSheet` when the second screen
// arrived, rather than copied into it. Six screens each with their own `#111827`
// is how a product ends up with four greys that are almost the same, and the web
// side of this repo has a whole `check-design-tokens` fence about exactly that.
// There is no such fence over `apps/` yet, so the discipline has to be the file.
//
// These values MIRROR the web app's Tailwind greys, they do not import them: the
// contract package is framework-free by fence and a Tailwind config is not a
// contract. When the brand palette is settled this file is the one place that
// changes.

export const COLORS = {
  canvas: "#f7f7f5",
  surface: "#ffffff",
  border: "#e5e7eb",
  ink: "#111827",
  inkSoft: "#374151",
  inkMuted: "#6b7280",
  /** Refusals, alerts, "perdida". Never used for anything merely emphatic. */
  danger: "#b91c1c",
  dangerSurface: "#fee2e2",
  /** "We could not read this" — the honest-blank warning, not an error. */
  warnSurface: "#fef3c7",
  warnInk: "#92400e",
  accent: "#1d4ed8",
  disabled: "#9ca3af",
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
} as const;

export const RADIUS = { sm: 8, md: 10, lg: 12 } as const;
