// DB-budget linter — CI guardrail (task #74 death-spiral regression armor).
//
// THE BUG CLASS THIS CATCHES ("unbudgeted heavy analytics call site"):
//   The Panorama console + executive dashboards fan out ~11 aggregate queries on
//   a shared micro DB. When the transaction pooler degrades, an UNBOUNDED DB call
//   HANGS indefinitely: the RSC stream truncates (skeletons forever) and abandoned
//   backends accumulate until the instance starves — the task #74 spiral. The fix
//   is that every heavy entry point bounds its DB work with a TIME budget so it
//   degrades honestly instead of hanging (src/modules/panorama/application/
//   db-budget.ts `withDbBudget`, or lib/analytics/analytics-load.ts
//   `loadWithTimeout`, or a cached/seed loader that itself wraps one of those).
//
// THE FIX (what makes a site pass this linter):
//   The heavy entry point must REFERENCE a known budget wrapper (BUDGET_WRAPPERS)
//   — either directly (`withDbBudget` / `loadWithTimeout`) or via a cached loader
//   that wraps it (`loadCachedPanoramaKpis`, `loadLayerFeaturesCached…`).
//
// SCOPE (the known heavy call sites — kept deliberately narrow, not the whole app):
//   - app/api/panorama/**/route.ts        — the console's per-layer / KPI / unit
//                                            fan-out route handlers
//   - app/admin/panorama/page.tsx         — admin Centro de Situación (SSR fan-out)
//   - app/gob/panorama/page.tsx           — govt Centro de Situación (SSR fan-out)
//   - app/admin/programa/page.tsx         — executive summary (~11 fetchers)
//
// WHY A HARD FAIL (no baseline): every current site references a wrapper, so any
// new hit is a real regression. A NEW heavy page must either use a known wrapper
// or consciously extend BUDGET_WRAPPERS — never ship an unbounded fan-out silently.
//
// Regex/string scan (not an AST analyzer) — matches the sibling linters
// (check-jurisdiction-subsumption.ts, check-authz-guards.ts).
//
// Run: pnpm tsx scripts/check-db-budget.ts   (or: pnpm lint:db-budget)

import { globSync, readFileSync } from "node:fs";

// Budget-wrapper tokens. A heavy entry point is considered budgeted if its source
// references any of these. `loadLayerFeaturesCached` also matches its
// `…WithMeta` variant (substring). `loadCachedPanoramaKpis` and `loadWithTimeout`
// are cached/deadline loaders that wrap withDbBudget / a timeout internally.
export const BUDGET_WRAPPERS = [
  "withDbBudget",
  "loadWithTimeout",
  "loadCachedPanoramaKpis",
  "loadLayerFeaturesCached",
] as const;

// The dashboard pages scanned (specific paths, not a tree).
export const DASHBOARD_PAGES = [
  "app/admin/panorama/page.tsx",
  "app/gob/panorama/page.tsx",
  "app/admin/programa/page.tsx",
  // D2 analytics pages (same shape as admin/programa — already wrapped with
  // loadWithTimeout today; enforced here so a future silent drop is caught).
  // F8 fusion (2026-07-22): app/admin/censo, app/admin/poblacion, app/gob/censo
  // and app/gob/poblacion's page.tsx are now thin redirect shims into the
  // Padrón hub — the heavy fan-out (and its loadWithTimeout wrapper) relocated
  // byte-identical into these Screen components, so the scan target moves
  // with it.
  "app/admin/censo/AdminCensoScreen.tsx",
  "app/admin/poblacion/AdminPoblacionScreen.tsx",
  "app/admin/inteligencia/page.tsx",
  "app/gob/programa/ProgramaResumenScreen.tsx",
  "app/gob/censo/CensoScreen.tsx",
  "app/gob/poblacion/PoblacionScreen.tsx",
  // DB2 resilience finding: heavy multi-query fan-outs with no time budget —
  // wrapped with loadWithTimeout in the same pass that added this line.
  // F9 (2026-08-01): same relocation as the F8 pair above — app/gob/analytics/
  // page.tsx and app/gob/programa/page.tsx are now thin shims (a redirect and a
  // hub), so the scan targets moved to the Screen components that kept the
  // fan-out.
  "app/gob/analytics/AnalyticsScreen.tsx",
  "app/gob/page.tsx",
  "app/gob/vigilancia/page.tsx",
] as const;

// The route-handler globs scanned.
export const ROUTE_GLOBS = ["app/api/panorama/**/route.ts"] as const;

/** True when `src` references at least one known budget wrapper. */
export function referencesBudgetWrapper(src: string): boolean {
  return BUDGET_WRAPPERS.some((w) => src.includes(w));
}

// The full set of heavy call sites this linter covers.
export function listBudgetTargets(): string[] {
  const routes = ROUTE_GLOBS.flatMap((p) => globSync(p)).map((f) => f.replaceAll("\\", "/"));
  const pages = DASHBOARD_PAGES.filter((p) => globSync(p).length > 0);
  return [...new Set([...routes, ...pages])].filter((f) => !f.includes(".test.")).sort();
}

/** Returns one offender path per heavy call site missing a budget wrapper. */
export function scanAll(): string[] {
  const offenders: string[] = [];
  for (const file of listBudgetTargets()) {
    if (!referencesBudgetWrapper(readFileSync(file, "utf8"))) offenders.push(file);
  }
  return offenders;
}

function runScan(): void {
  const targets = listBudgetTargets();
  if (targets.length === 0) {
    console.error("✗ check-db-budget: found no heavy analytics call sites to scan.");
    process.exit(1);
  }

  const offenders = scanAll();
  if (offenders.length === 0) {
    console.log(
      `✓ db-budget clean — ${targets.length} heavy analytics call site(s) reference a budget wrapper (${BUDGET_WRAPPERS.join("/")}).`,
    );
    return;
  }

  console.error(
    `✗ ${offenders.length} heavy analytics call site(s) call the DB with NO budget wrapper (${BUDGET_WRAPPERS.join("/")}). An unbounded fan-out HANGS when the transaction pooler degrades (task #74 death spiral):`,
  );
  for (const o of offenders) console.error(`    ${o}`);
  console.error(
    "\nBound the DB work with withDbBudget (src/modules/panorama/application/db-budget.ts) or loadWithTimeout (lib/analytics/analytics-load.ts), or route through a cached/seed loader that wraps one of those.",
  );
  process.exit(1);
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-db-budget.ts") ||
    process.argv[1].endsWith("check-db-budget.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
