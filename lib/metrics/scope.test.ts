// Regression tests for jurisdictionPairClause whole-province subsumption
// (critique of PR #762, finding 7).
//
// govt-home-kpis.ts previously re-derived the jurisdiction-pair predicate inline
// (casesScopeClause, welfareReportsScopeClause, fetchRabiesCoverage[ByProvince])
// with EXACT (province, locality) equality — NOT covered by 7a17ec97's
// subsumption fix. Those sites now route through jurisdictionPairClause. These
// tests pin the shared clause's subsumption contract: a whole-province
// assignment emits a PROVINCE-ONLY predicate (no locality operand), while a
// barrio-specific assignment keeps the exact pair.

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pets } from "@/db";
import { jurisdictionPairClause } from "@/lib/metrics/scope";

function render(clause: ReturnType<typeof jurisdictionPairClause>) {
  if (clause === null) return { sql: "", params: [] as unknown[] };
  return new PgDialect().sqlToQuery(clause);
}

const provinceExpr = sql`${pets.jurisdictionProvince}`;
const localityExpr = sql`${pets.jurisdictionLocality}`;

describe("jurisdictionPairClause — whole-province subsumption (finding 7)", () => {
  it("emits a PROVINCE-ONLY predicate for a whole-province (CABA) assignment", () => {
    const clause = jurisdictionPairClause(
      [{ province: "CABA", locality: "Ciudad Autónoma de Buenos Aires" }],
      provinceExpr,
      localityExpr,
    );
    const { sql: text, params } = render(clause);
    // The locality operand must NOT appear — the province alone subsumes every barrio.
    expect(text).toContain("jurisdiction_province");
    expect(text).not.toContain("jurisdiction_locality");
    expect(params).toContain("CABA");
    expect(params).not.toContain("Ciudad Autónoma de Buenos Aires");
  });

  it("keeps the EXACT pair for a barrio-specific assignment", () => {
    const clause = jurisdictionPairClause(
      [{ province: "CABA", locality: "Palermo" }],
      provinceExpr,
      localityExpr,
    );
    const { sql: text, params } = render(clause);
    expect(text).toContain("jurisdiction_province");
    expect(text).toContain("jurisdiction_locality");
    expect(params).toEqual(expect.arrayContaining(["CABA", "Palermo"]));
  });

  it("keeps the EXACT pair for a normal (non-whole-province) locality", () => {
    const clause = jurisdictionPairClause(
      [{ province: "Buenos Aires", locality: "La Plata" }],
      provinceExpr,
      localityExpr,
    );
    const { sql: text } = render(clause);
    expect(text).toContain("jurisdiction_locality");
  });

  it("returns null for an empty assignment list", () => {
    expect(jurisdictionPairClause([], provinceExpr, localityExpr)).toBeNull();
  });
});
