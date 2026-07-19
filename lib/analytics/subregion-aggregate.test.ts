// Integration tests for aggregateRowsByDepartment / aggregateRowsByBarrio
// (lib/analytics/subregion-aggregate.ts) — the locality→department/barrio
// fold shared by /gob/perdidas and /gob/vigilancia (fetchCasesPerSubregion).
//
// Flagged by a fresh review as having NO dedicated test, only transitive
// coverage via fetchCasesPerSubregion. A normalization bug here would
// misattribute counts between departments — a wrong-number bug, not a crash.
//
// This is a DB-integration test: locality→department resolution reads the
// real INDEC ar_localities catalog (scripts/import-indec-localities.ts), the
// same catalog __tests__/ar-localidades.test.ts exercises. It does not seed
// fixture rows into ar_localities — it queries a handful of REAL, stable
// department/locality pairs at test time (never hardcoded INDEC codes) and
// feeds them in-memory rows via the module's own `rows` parameter, which is
// the actual boundary under test. Guarded with `catalogPopulated` exactly
// like ar-localidades.test.ts so a fresh/unimported dev DB skips instead of
// failing.

import { count as countFn, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";
import { aggregateRowsByDepartment } from "./subregion-aggregate";

let catalogPopulated = false;

beforeAll(async () => {
  const [row] = await db
    .select({ count: countFn() })
    .from(arLocalities)
    .where(isNull(arLocalities.removedAt));
  catalogPopulated = Number(row?.count ?? 0) > 100;
});

describe("aggregateRowsByDepartment — department attribution & summation (real ar_localities)", () => {
  const PROVINCE = "AR-B"; // Buenos Aires

  it("sums multiple localities that share a department under that department's code", async () => {
    if (!catalogPopulated) return;

    // Real, stable pair: "25 de Mayo" and "Ernestina" both resolve to the
    // "25 de Mayo" department (code 06854) in Buenos Aires.
    const rows = [
      { locality: "25 de Mayo", value: 3 },
      { locality: "Ernestina", value: 4 },
    ];

    const out = await aggregateRowsByDepartment(PROVINCE, rows);
    const dept = out.find((r) => r.name === "25 de Mayo");
    expect(dept).toBeDefined();
    expect(dept?.count).toBe(7); // 3 + 4, never misattributed elsewhere
    expect(dept?.suppressed).toBeFalsy();
  });

  it("attributes different localities to their own distinct departments (no cross-bleed)", async () => {
    if (!catalogPopulated) return;

    // "25 de Mayo" → department "25 de Mayo" (06854); "9 de Julio" locality →
    // department "9 de Julio" (06588). Different departments, must not merge.
    const rows = [
      { locality: "25 de Mayo", value: 6 },
      { locality: "9 de Julio", value: 8 },
    ];

    const out = await aggregateRowsByDepartment(PROVINCE, rows);
    const deptA = out.find((r) => r.name === "25 de Mayo");
    const deptB = out.find((r) => r.name === "9 de Julio");
    expect(deptA?.count).toBe(6);
    expect(deptB?.count).toBe(8);
    // Every OTHER department in the province (no matching input row) stays at
    // the honest zero — the full-set contract (not a filtered/sparse list).
    const untouched = out.find((r) => r.name === "Adolfo Alsina");
    expect(untouched?.count).toBe(0);
    expect(untouched?.suppressed).toBeFalsy();
  });

  it("returns the FULL department set for the province, not just departments with data", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(PROVINCE, []);
    // Buenos Aires has well over 100 partidos/departments.
    expect(out.length).toBeGreaterThan(100);
    for (const r of out) {
      expect(r.count).toBe(0);
    }
  });
});

describe("aggregateRowsByDepartment — k-anonymity suppression (k=5)", () => {
  const PROVINCE = "AR-B";

  it("suppresses a department whose folded count is below k=5: value:0, suppressed:true", async () => {
    if (!catalogPopulated) return;
    // Single row, value 3 → below the k=5 floor.
    const out = await aggregateRowsByDepartment(PROVINCE, [{ locality: "25 de Mayo", value: 3 }]);
    const dept = out.find((r) => r.name === "25 de Mayo");
    expect(dept).toBeDefined();
    expect(dept?.suppressed).toBe(true);
    expect(dept?.count).toBe(0); // real small count (3) is NEVER leaked
  });

  it("passes a department at/above k=5 through with its real value, suppressed:false", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(PROVINCE, [{ locality: "25 de Mayo", value: 5 }]);
    const dept = out.find((r) => r.name === "25 de Mayo");
    expect(dept).toBeDefined();
    expect(dept?.count).toBe(5);
    expect(dept?.suppressed).toBeFalsy();
  });

  it("summed count crossing the k=5 floor from multiple sub-k localities is no longer suppressed", async () => {
    if (!catalogPopulated) return;
    // Neither row alone would clear k=5, but together (3 + 4 = 7) they resolve
    // to the SAME department and must clear the floor once folded.
    const out = await aggregateRowsByDepartment(PROVINCE, [
      { locality: "25 de Mayo", value: 3 },
      { locality: "Ernestina", value: 4 },
    ]);
    const dept = out.find((r) => r.name === "25 de Mayo");
    expect(dept?.count).toBe(7);
    expect(dept?.suppressed).toBeFalsy();
  });
});

describe("aggregateRowsByBarrio (CABA, via aggregateRowsByDepartment('AR-C', ...))", () => {
  const CABA = "AR-C";

  it("attributes rows to the correct barrio and sums correctly", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(CABA, [
      { locality: "Palermo", value: 2 },
      { locality: "Palermo", value: 3 },
      { locality: "Recoleta", value: 9 },
    ]);
    const palermo = out.find((r) => r.name === "Palermo");
    const recoleta = out.find((r) => r.name === "Recoleta");
    expect(palermo?.count).toBe(5); // 2 + 3, folded into ONE barrio
    expect(palermo?.suppressed).toBeFalsy();
    expect(recoleta?.count).toBe(9);
    expect(recoleta?.suppressed).toBeFalsy();
    // A third, untouched barrio stays an honest zero.
    const untouched = out.find((r) => r.name === "Belgrano");
    expect(untouched?.count).toBe(0);
  });

  it("suppresses a below-k=5 barrio count; passes an at/above-k=5 count through real", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(CABA, [
      { locality: "Palermo", value: 4 }, // below k=5
      { locality: "Recoleta", value: 5 }, // at k=5
    ]);
    const palermo = out.find((r) => r.name === "Palermo");
    const recoleta = out.find((r) => r.name === "Recoleta");
    expect(palermo?.suppressed).toBe(true);
    expect(palermo?.count).toBe(0);
    expect(recoleta?.suppressed).toBeFalsy();
    expect(recoleta?.count).toBe(5);
  });

  it("returns the full barrio set for CABA, excluding the province catch-all row", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(CABA, []);
    expect(out.length).toBeGreaterThan(40); // CABA has 48 official barrios
    expect(out.find((r) => r.name === "Ciudad Autónoma de Buenos Aires")).toBeUndefined();
  });
});

describe("aggregateRowsByDepartment — edge cases: null/blank/unmapped locality", () => {
  const PROVINCE = "AR-B";

  it("skips a null locality without crashing or misattributing its value", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(PROVINCE, [
      { locality: null, value: 999 },
      { locality: "25 de Mayo", value: 6 },
    ]);
    // The null-locality row's value must not land ANYWHERE — total folded
    // value across all departments must equal only the matched row's value.
    const total = out.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(6);
    expect(out.find((r) => r.name === "25 de Mayo")?.count).toBe(6);
  });

  it("skips a blank-string locality without crashing", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(PROVINCE, [{ locality: "", value: 42 }]);
    const total = out.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(0);
  });

  it("skips a locality name absent from the ar_localities catalog without crashing or misattributing", async () => {
    if (!catalogPopulated) return;
    const out = await aggregateRowsByDepartment(PROVINCE, [
      { locality: "Not A Real Locality Name Xyz123", value: 77 },
      { locality: "25 de Mayo", value: 6 },
    ]);
    const total = out.reduce((s, r) => s + r.count, 0);
    // The unmapped row's 77 must be dropped, never folded into ANY department.
    expect(total).toBe(6);
  });

  it("returns [] for an unknown province code", async () => {
    const out = await aggregateRowsByDepartment("AR-ZZ", [{ locality: "Anything", value: 1 }]);
    expect(out).toEqual([]);
  });
});
