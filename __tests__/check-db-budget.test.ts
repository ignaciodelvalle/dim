/**
 * Unit tests for scripts/check-db-budget.ts helpers.
 *
 * Pure fixture tests (no filesystem I/O) plus one integration assertion that the
 * REAL heavy call sites in the repo are all budgeted — so the guard is proven to
 * pass on the current tree, not just on fixtures.
 */

import { describe, expect, it } from "vitest";

import {
  BUDGET_WRAPPERS,
  listBudgetTargets,
  referencesBudgetWrapper,
  scanAll,
} from "../scripts/check-db-budget";

describe("referencesBudgetWrapper", () => {
  it("accepts a direct withDbBudget call", () => {
    expect(referencesBudgetWrapper('const x = await withDbBudget(p, 8000, "l", f);')).toBe(true);
  });

  it("accepts loadWithTimeout (the dashboard deadline wrapper)", () => {
    expect(referencesBudgetWrapper("const load = await loadWithTimeout(Promise.all([...]));")).toBe(
      true,
    );
  });

  it("accepts a cached loader that wraps a budget internally", () => {
    expect(referencesBudgetWrapper("import { loadCachedPanoramaKpis } from '...';")).toBe(true);
  });

  it("matches the loadLayerFeaturesCachedWithMeta variant via substring", () => {
    expect(referencesBudgetWrapper("await loadLayerFeaturesCachedWithMeta(layer, ...)")).toBe(true);
  });

  it("rejects a raw unbudgeted DB fan-out", () => {
    expect(
      referencesBudgetWrapper("const rows = await Promise.all([db.select()..., analyticsDb...]);"),
    ).toBe(false);
  });
});

describe("real repo tree", () => {
  it("finds the known heavy call sites (routes + dashboard pages)", () => {
    const targets = listBudgetTargets();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).toContain("app/api/panorama/kpis/route.ts");
    expect(targets).toContain("app/admin/programa/page.tsx");
  });

  it("has ZERO unbudgeted heavy call sites (the guard passes on HEAD)", () => {
    expect(scanAll()).toEqual([]);
  });
});

describe("BUDGET_WRAPPERS", () => {
  it("includes the two budget primitives", () => {
    expect(BUDGET_WRAPPERS).toContain("withDbBudget");
    expect(BUDGET_WRAPPERS).toContain("loadWithTimeout");
  });
});
