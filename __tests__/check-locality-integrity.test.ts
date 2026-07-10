/**
 * Unit tests for scripts/check-locality-integrity.ts — the province-as-locality
 * integrity gate. Pure fixture tests (no DB): exercise findAggregateViolations
 * against catalog rows transcribed from the live INDEC catalog (DIM-staging,
 * verified 2026-07-09), pinning that the guard flags CABA's whole-city row and
 * ONLY that row.
 */

import { describe, expect, it } from "vitest";

import { type LocalityRow, findAggregateViolations } from "@/scripts/check-locality-integrity";

// department_code is null ONLY for CABA rows in the real catalog; capitals all
// carry a departamento. The guard queries the department-less slice, so the
// fixture mirrors that slice plus one capital as a negative control.
const CATALOG_SLICE: LocalityRow[] = [
  // The offender — whole-city aggregate, no departamento, name → AR-C via alias.
  {
    province_code: "AR-C",
    locality_name: "Ciudad Autónoma de Buenos Aires",
    locality_slug: "ciudad-autonoma-de-buenos-aires",
    department_code: null,
  },
  // CABA barrios — department-less but names do not resolve to AR-C.
  {
    province_code: "AR-C",
    locality_name: "Palermo",
    locality_slug: "palermo",
    department_code: null,
  },
  {
    province_code: "AR-C",
    locality_name: "Recoleta",
    locality_slug: "recoleta",
    department_code: null,
  },
  // Real capital sharing its province name — has a departamento, must be kept.
  {
    province_code: "AR-X",
    locality_name: "Córdoba",
    locality_slug: "cordoba",
    department_code: "14014",
  },
];

describe("findAggregateViolations", () => {
  it("flags exactly the CABA whole-city aggregate", () => {
    const violations = findAggregateViolations(CATALOG_SLICE);
    expect(violations).toHaveLength(1);
    expect(violations[0].locality_slug).toBe("ciudad-autonoma-de-buenos-aires");
  });

  it("returns nothing for a clean catalog slice", () => {
    const clean = CATALOG_SLICE.filter(
      (r) => r.locality_slug !== "ciudad-autonoma-de-buenos-aires",
    );
    expect(findAggregateViolations(clean)).toEqual([]);
  });

  it("does not flag CABA barrios or capitals sharing their province name", () => {
    const violations = findAggregateViolations(CATALOG_SLICE);
    const flaggedSlugs = violations.map((v) => v.locality_slug);
    expect(flaggedSlugs).not.toContain("palermo");
    expect(flaggedSlugs).not.toContain("recoleta");
    expect(flaggedSlugs).not.toContain("cordoba");
  });
});
