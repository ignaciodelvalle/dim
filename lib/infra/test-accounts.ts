// Test / smoke account detection for the identity consoles (/admin/usuarios,
// /admin/govts).
//
// WHY: local + staging environments accumulate ephemeral accounts from genesis
// cold-start runs and e2e smoke suites (handles like `govt-gen-abcd@dim.test`,
// `uc-cd-admin`, `govt-dashboard-export`). Dozens of them bury the handful of
// real operators, making the roster unusable. These consoles default such rows
// OUT of the primary view behind a "mostrar cuentas de prueba" toggle.
//
// This is a UI-LEVEL filter, deliberately not a seed/schema change: production
// carries no such rows, so the filter is harmless there, and it never mutates
// data (safer than editing seeds — see the console pages' toggle wiring).
//
// The patterns match the handles the seed/e2e scripts generate — a real operator
// account never carries them:
//   - `-gen-`               genesis cold-start churn (govt-gen-*, lucia-gen-*, …)
//   - `uc-cd-` prefix       cursor-driven smoke accounts (uc-cd-admin, …)
//   - `govt-dashboard-export` the dashboard-export e2e fixture
//
// The `-gen-` match is intentionally broad: for this filter's purpose a false
// NEGATIVE (a test account left in the roster) defeats the goal, while a false
// positive (a rare real handle hidden) is fully recoverable via the "mostrar
// cuentas de prueba" toggle. No real operator handle carries `-gen-` today.

const TEST_ACCOUNT_PATTERNS: readonly RegExp[] = [/-gen-/i, /^uc-cd-/i, /govt-dashboard-export/i];

/**
 * True when ANY of the provided identifiers (display name, email, …) matches a
 * known test/smoke-account pattern. Null/undefined values are ignored, so a
 * caller can pass `isTestAccount(displayName, email)` without pre-filtering.
 */
export function isTestAccount(...values: (string | null | undefined)[]): boolean {
  return values.some(
    (v) => typeof v === "string" && TEST_ACCOUNT_PATTERNS.some((re) => re.test(v)),
  );
}
