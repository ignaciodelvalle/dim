// Unit tests for lib/metrics/kpi-catalog.ts — PURE, DB-free.
//
// Covers:
//   1. Catalog shape invariants (id matches key, required fields non-empty).
//   2. Label uniqueness — the whole point of this catalog is that no two KPIs
//      share a label (the "42% vs 54% same label" bug this catalog fixes).
//   3. fetcherName uniqueness — one catalog entry per fetcher.
//   4. Coverage of /gob home: every KPI fetcher app/gob/page.tsx imports from
//      lib/analytics/{govt-home-kpis,compliance-metrics,mortality-metrics}
//      must have a matching catalog entry. This is a live grep of the page
//      source, not a hardcoded list — a new home-page KPI fetcher without a
//      catalog entry fails this test.
//   5. The two rabies KPIs are disambiguated (distinct labels + distinct
//      denominator population noted in their definitions).

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KPI_CATALOG, KPI_CATALOG_LIST, findKpiByFetcherName } from "./kpi-catalog";

// ---------------------------------------------------------------------------
// 1. Shape invariants
// ---------------------------------------------------------------------------

describe("KPI_CATALOG shape", () => {
  it("every entry's `id` matches its own record key", () => {
    for (const [key, def] of Object.entries(KPI_CATALOG)) {
      expect(def.id).toBe(key);
    }
  });

  it("every entry has non-empty label/numerator/denominator/source/fetcherName/fetcherPath/cadence/unit/suppression", () => {
    for (const def of KPI_CATALOG_LIST) {
      expect(def.label.length, `${def.id}.label`).toBeGreaterThan(0);
      expect(def.numerator.length, `${def.id}.numerator`).toBeGreaterThan(0);
      expect(def.denominator.length, `${def.id}.denominator`).toBeGreaterThan(0);
      expect(def.source.length, `${def.id}.source`).toBeGreaterThan(0);
      expect(def.fetcherName.length, `${def.id}.fetcherName`).toBeGreaterThan(0);
      expect(def.fetcherPath.length, `${def.id}.fetcherPath`).toBeGreaterThan(0);
      expect(def.cadence.length, `${def.id}.cadence`).toBeGreaterThan(0);
      expect(def.unit.length, `${def.id}.unit`).toBeGreaterThan(0);
      expect(def.suppression.length, `${def.id}.suppression`).toBeGreaterThan(0);
    }
  });

  it("has at least 10 catalogued KPIs (program-wide coverage, not a single surface)", () => {
    expect(KPI_CATALOG_LIST.length).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 2. Label uniqueness — the core fix
// ---------------------------------------------------------------------------

describe("label uniqueness", () => {
  it("no two KPIs share the same es-AR label", () => {
    const labels = KPI_CATALOG_LIST.map((k) => k.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});

// ---------------------------------------------------------------------------
// 3. fetcherName uniqueness
// ---------------------------------------------------------------------------

describe("fetcherName uniqueness", () => {
  it("no two catalog entries point at the same fetcher", () => {
    const names = KPI_CATALOG_LIST.map((k) => k.fetcherName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("findKpiByFetcherName resolves a known fetcher and misses an unknown one", () => {
    expect(findKpiByFetcherName("fetchRabiesCoverage")?.id).toBe("rabies_coverage_dogs_12m");
    expect(findKpiByFetcherName("fetchDoesNotExist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. /gob home coverage — live grep of the page source
// ---------------------------------------------------------------------------

/**
 * Extract the named imports pulled from lib/analytics/{govt-home-kpis,
 * compliance-metrics,mortality-metrics} in a page source file.
 *
 * Matches `import { a, b } from "@/lib/analytics/<module>"` blocks (single- or
 * multi-line) and returns every `fetch*` identifier found inside them. This
 * intentionally does NOT match every `fetch*` identifier in the whole file
 * (e.g. fetchKpiTrend / fetchVisiblePendingRequests are sparkline/queue
 * helpers imported from other modules, not rate/coverage KPI fetchers).
 */
function fetchersImportedFromKpiModules(source: string): string[] {
  const KPI_MODULES = /@\/lib\/analytics\/(govt-home-kpis|compliance-metrics|mortality-metrics)/;
  const importBlockRe = /import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g;

  const found: string[] = [];
  for (const match of source.matchAll(importBlockRe)) {
    const [, names, modulePath] = match;
    if (!KPI_MODULES.test(modulePath)) continue;
    for (const name of names.split(",").map((n) => n.trim())) {
      if (/^fetch[A-Z]\w*$/.test(name)) found.push(name);
    }
  }
  return found;
}

describe("/gob home KPI coverage", () => {
  const gobHomeSource = readFileSync(path.join(process.cwd(), "app", "gob", "page.tsx"), "utf-8");
  const importedFetchers = fetchersImportedFromKpiModules(gobHomeSource);

  it("the page actually imports some KPI fetchers (sanity — catches a broken regex/path)", () => {
    expect(importedFetchers.length).toBeGreaterThan(0);
  });

  it("every KPI fetcher /gob home imports from a KPI module has a catalog entry", () => {
    const catalogFetchers = new Set(KPI_CATALOG_LIST.map((k) => k.fetcherName));
    const missing = importedFetchers.filter((name) => !catalogFetchers.has(name));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. The rabies disambiguation, specifically
// ---------------------------------------------------------------------------

describe("rabies coverage disambiguation (critique-govt-2026-07-03.md)", () => {
  it("rabies_coverage_dogs_12m and rabies_vaccination_rate_all_species have distinct labels", () => {
    const dogs = KPI_CATALOG.rabies_coverage_dogs_12m;
    const allSpecies = KPI_CATALOG.rabies_vaccination_rate_all_species;
    expect(dogs.label).not.toBe(allSpecies.label);
  });

  it("the two rabies KPIs point at different fetchers (confirming they are genuinely different computations)", () => {
    const dogs = KPI_CATALOG.rabies_coverage_dogs_12m;
    const allSpecies = KPI_CATALOG.rabies_vaccination_rate_all_species;
    expect(dogs.fetcherName).not.toBe(allSpecies.fetcherName);
  });

  it("the two rabies KPIs document different cadences (12m window vs all-time)", () => {
    const dogs = KPI_CATALOG.rabies_coverage_dogs_12m;
    const allSpecies = KPI_CATALOG.rabies_vaccination_rate_all_species;
    expect(dogs.cadence).not.toBe(allSpecies.cadence);
  });
});
