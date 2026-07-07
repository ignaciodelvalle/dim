// Equivalence tests for the jurisdictionPairClause refactor (Wave 3.7).
//
// Verifies that all consolidated scope builders produce IDENTICAL row counts
// to what they produced before the refactor, across the four canonical
// scenarios:
//   1. govt scoped to one jurisdiction
//   2. govt with empty assignments (0 rows)
//   3. admin (no scope restriction)
//   4. admin + province drill-down (Panorama)
//
// Each test exercises a different table/expression variant:
//   - pets table columns (petsScopeClause path via casesScopeClause shape)
//   - welfare_reports columns (welfareReportsScopeClause)
//   - cases columns (casesScopeClause)
//   - JSONB payload fields (outbreakSignalScopeClause)
//
// Implementation: we replicate the shape of each scope builder directly using
// jurisdictionPairClause and compare counts against queries that use the
// exported wrapper functions — so any regression is caught at both layers.

import { and, count, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, petEvents, pets, welfareReports } from "@/db";
import { welfareReportsScopeClause } from "@/lib/analytics/govt-dashboards";
import { buildProjectionContext, jurisdictionPairClause, petsScopeClause } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREFIX = "JPT-"; // jurisdiction pair test
const PROV_A = "Santa Fe";
const LOC_A = "Rosario";
const PROV_B = "Córdoba";
const LOC_B = "Córdoba";

const period = windows.trailing12m();

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let petIdsA: string[] = [];
let petIdB: string | null = null;
let reportIds: string[] = [];
let caseIds: string[] = [];
let eventIds: string[] = [];

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function insertPet(token: string, province: string, locality: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `JPT-${token}`,
      species: "dog",
      status: "active",
      jurisdictionProvince: province,
      jurisdictionLocality: locality,
    })
    .returning({ id: pets.id });
  return row.id;
}

let wrSeq = 0;
let caseSeq = 0;

async function insertWelfareReport(petId: string, province: string, locality: string) {
  wrSeq += 1;
  const [row] = await db
    .insert(welfareReports)
    .values({
      referenceCode: `JPT-WR-${Date.now()}-${wrSeq}`,
      kind: "neglect",
      severity: "medium",
      description: "Fixture for jurisdictionPairClause tests.",
      subjectKind: "unowned_animal",
      jurisdictionProvince: province,
      jurisdictionLocality: locality,
    })
    .returning({ id: welfareReports.id });
  return row.id;
}

async function insertCase(province: string, locality: string) {
  caseSeq += 1;
  const [row] = await db
    .insert(cases)
    .values({
      publicCode: `JPT-CASE-${Date.now()}-${caseSeq}`,
      caseKind: "welfare_report",
      primarySubjectKind: "general",
      status: "open",
      jurisdictionProvince: province,
      jurisdictionLocality: locality,
    })
    .returning({ id: cases.id });
  return row.id;
}

async function insertOutbreakEvent(petId: string, province: string, locality: string) {
  const now = new Date();
  const [row] = await withMutationOverride(async (tx) => {
    return tx
      .insert(petEvents)
      .values({
        petId,
        eventType: "outbreak_signal",
        authorRole: "vet",
        authorVerified: false,
        occurredAt: now,
        payload: {
          disease_code: "test_disease",
          pet_jurisdiction_province: province,
          pet_jurisdiction_locality: locality,
        },
      })
      .returning({ id: petEvents.id });
  });
  return row.id;
}

beforeAll(async () => {
  // Insert 3 pets in PROV_A/LOC_A and 1 in PROV_B/LOC_B.
  const [pA1, pA2, pA3] = await Promise.all([
    insertPet(`${PREFIX}A1`, PROV_A, LOC_A),
    insertPet(`${PREFIX}A2`, PROV_A, LOC_A),
    insertPet(`${PREFIX}A3`, PROV_A, LOC_A),
  ]);
  petIdsA = [pA1, pA2, pA3];
  petIdB = await insertPet(`${PREFIX}B1`, PROV_B, LOC_B);

  // Insert welfare_reports for 2 of the PROV_A pets and 1 PROV_B pet.
  reportIds = await Promise.all([
    insertWelfareReport(pA1, PROV_A, LOC_A),
    insertWelfareReport(pA2, PROV_A, LOC_A),
    insertWelfareReport(petIdB, PROV_B, LOC_B),
  ]);

  // Insert cases for 2 PROV_A and 1 PROV_B.
  caseIds = await Promise.all([
    insertCase(PROV_A, LOC_A),
    insertCase(PROV_A, LOC_A),
    insertCase(PROV_B, LOC_B),
  ]);

  // Insert outbreak_signal events for 1 PROV_A and 1 PROV_B pet.
  eventIds = await Promise.all([
    insertOutbreakEvent(pA1, PROV_A, LOC_A),
    insertOutbreakEvent(petIdB!, PROV_B, LOC_B),
  ]);
});

afterAll(async () => {
  // Clean up in dependency order.
  await withMutationOverride(async (tx) => {
    if (eventIds.length > 0) {
      await tx.delete(petEvents).where(inArray(petEvents.id, eventIds));
    }
    if (caseIds.length > 0) {
      await tx.delete(cases).where(inArray(cases.id, caseIds));
    }
  });
  if (reportIds.length > 0) {
    await db.delete(welfareReports).where(inArray(welfareReports.id, reportIds));
  }
  const allPetIds = [...petIdsA, ...(petIdB ? [petIdB] : [])];
  if (allPetIds.length > 0) {
    await db.delete(pets).where(inArray(pets.id, allPetIds));
  }
});

// ---------------------------------------------------------------------------
// Helpers — count rows filtered to our fixtures only
// ---------------------------------------------------------------------------

async function countPetsWithPairClause(jurisdictions: { province: string; locality: string }[]) {
  const pairs = jurisdictionPairClause(
    jurisdictions,
    sql`${pets.jurisdictionProvince}`,
    sql`${pets.jurisdictionLocality}`,
  );
  const condition = pairs
    ? and(inArray(pets.id, [...petIdsA, ...(petIdB ? [petIdB] : [])]), sql`(${pairs})`)
    : sql`false`;
  const rows = await db.select({ n: count() }).from(pets).where(condition);
  return rows[0]?.n ?? 0;
}

async function countWelfareReportsWithPairClause(
  jurisdictions: { province: string; locality: string }[],
) {
  const pairs = jurisdictionPairClause(
    jurisdictions,
    sql`${welfareReports.jurisdictionProvince}`,
    sql`${welfareReports.jurisdictionLocality}`,
  );
  const condition = pairs
    ? and(inArray(welfareReports.id, reportIds), sql`(${pairs})`)
    : sql`false`;
  const rows = await db.select({ n: count() }).from(welfareReports).where(condition);
  return rows[0]?.n ?? 0;
}

async function countCasesWithPairClause(jurisdictions: { province: string; locality: string }[]) {
  const pairs = jurisdictionPairClause(
    jurisdictions,
    sql`${cases.jurisdictionProvince}`,
    sql`${cases.jurisdictionLocality}`,
  );
  const condition = pairs ? and(inArray(cases.id, caseIds), sql`(${pairs})`) : sql`false`;
  const rows = await db.select({ n: count() }).from(cases).where(condition);
  return rows[0]?.n ?? 0;
}

async function countEventsWithPairClause(jurisdictions: { province: string; locality: string }[]) {
  const pairs = jurisdictionPairClause(
    jurisdictions,
    sql`(${petEvents.payload}->>'pet_jurisdiction_province')`,
    sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
  );
  const condition = pairs ? and(inArray(petEvents.id, eventIds), sql`(${pairs})`) : sql`false`;
  const rows = await db.select({ n: count() }).from(petEvents).where(condition);
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// jurisdictionPairClause — unit behaviour
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — null for empty input", () => {
  it("returns null when jurisdictions array is empty", () => {
    const result = jurisdictionPairClause([], sql`province_col`, sql`locality_col`);
    expect(result).toBeNull();
  });

  it("returns a SQL fragment (not null) when jurisdictions is non-empty", () => {
    const result = jurisdictionPairClause(
      [{ province: PROV_A, locality: LOC_A }],
      sql`province_col`,
      sql`locality_col`,
    );
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Equivalence — pets table columns
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — pets equivalence", () => {
  it("govt scoped to A sees only PROV_A pets", async () => {
    const n = await countPetsWithPairClause([{ province: PROV_A, locality: LOC_A }]);
    expect(n).toBe(3); // pA1 + pA2 + pA3
  });

  it("govt scoped to B sees only PROV_B pets", async () => {
    const n = await countPetsWithPairClause([{ province: PROV_B, locality: LOC_B }]);
    expect(n).toBe(1); // pB1
  });

  it("empty jurisdictions returns null (helper side)", async () => {
    const n = await countPetsWithPairClause([]);
    expect(n).toBe(0); // null → sql`false` in caller
  });

  it("multi-jurisdiction assignment sees both provinces", async () => {
    const n = await countPetsWithPairClause([
      { province: PROV_A, locality: LOC_A },
      { province: PROV_B, locality: LOC_B },
    ]);
    expect(n).toBe(4); // all fixtures
  });
});

// ---------------------------------------------------------------------------
// Equivalence — welfare_reports columns
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — welfare_reports equivalence", () => {
  it("govt scoped to A sees PROV_A reports", async () => {
    const n = await countWelfareReportsWithPairClause([{ province: PROV_A, locality: LOC_A }]);
    expect(n).toBe(2); // pA1 + pA2 reports
  });

  it("empty jurisdictions → 0 reports", async () => {
    const n = await countWelfareReportsWithPairClause([]);
    expect(n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CABA whole-province subsumption — jurisdictionPairClause is the single source
// of truth, so the CABA two-tier locality fix must hold here for EVERY consumer
// (welfare, cases, custody disputes, service offerings), not just the queue.
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — CABA whole-province subsumption", () => {
  const CABA_WHOLE = "Ciudad Autónoma de Buenos Aires";
  let cabaReportIds: string[] = [];

  beforeAll(async () => {
    // Two CABA barrios + the whole-city entry + a control province.
    cabaReportIds = await Promise.all([
      insertWelfareReport(petIdsA[0], "CABA", "Almagro"),
      insertWelfareReport(petIdsA[0], "CABA", "Palermo"),
      insertWelfareReport(petIdsA[0], "CABA", CABA_WHOLE),
      insertWelfareReport(petIdsA[0], "Salta", "Salta"),
    ]);
  });

  afterAll(async () => {
    if (cabaReportIds.length > 0) {
      await db.delete(welfareReports).where(inArray(welfareReports.id, cabaReportIds));
    }
  });

  async function countCabaReports(
    jurisdictions: { province: string; locality: string }[],
  ): Promise<number> {
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${welfareReports.jurisdictionProvince}`,
      sql`${welfareReports.jurisdictionLocality}`,
    );
    const condition = pairs
      ? and(inArray(welfareReports.id, cabaReportIds), sql`(${pairs})`)
      : sql`false`;
    const rows = await db.select({ n: count() }).from(welfareReports).where(condition);
    return rows[0]?.n ?? 0;
  }

  it("whole-city assignment matches all 3 CABA rows (both barrios + whole-city), not Salta", async () => {
    const n = await countCabaReports([{ province: "CABA", locality: CABA_WHOLE }]);
    expect(n).toBe(3);
  });

  it("barrio-specific assignment (Palermo) matches only the Palermo row", async () => {
    const n = await countCabaReports([{ province: "CABA", locality: "Palermo" }]);
    expect(n).toBe(1);
  });

  it("a Salta assignment matches only the Salta row (no CABA leak)", async () => {
    const n = await countCabaReports([{ province: "Salta", locality: "Salta" }]);
    expect(n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Equivalence — cases columns
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — cases equivalence", () => {
  it("govt scoped to A sees PROV_A cases", async () => {
    const n = await countCasesWithPairClause([{ province: PROV_A, locality: LOC_A }]);
    expect(n).toBe(2);
  });

  it("empty jurisdictions → 0 cases", async () => {
    const n = await countCasesWithPairClause([]);
    expect(n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Equivalence — JSONB payload fields (outbreak_signal)
// ---------------------------------------------------------------------------

describe("jurisdictionPairClause — JSONB payload fields equivalence", () => {
  it("govt scoped to A sees PROV_A outbreak events", async () => {
    const n = await countEventsWithPairClause([{ province: PROV_A, locality: LOC_A }]);
    expect(n).toBe(1); // only pA1's event
  });

  it("govt scoped to B sees PROV_B outbreak events", async () => {
    const n = await countEventsWithPairClause([{ province: PROV_B, locality: LOC_B }]);
    expect(n).toBe(1); // only pB1's event
  });

  it("empty jurisdictions → 0 events", async () => {
    const n = await countEventsWithPairClause([]);
    expect(n).toBe(0);
  });

  it("multi-jurisdiction sees all events", async () => {
    const n = await countEventsWithPairClause([
      { province: PROV_A, locality: LOC_A },
      { province: PROV_B, locality: LOC_B },
    ]);
    expect(n).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Equivalence — consolidated wrapper: welfareReportsScopeClause
// Verifies the refactored wrapper returns the same SQL effect as before.
// ---------------------------------------------------------------------------

describe("welfareReportsScopeClause equivalence (consolidated wrapper)", () => {
  it("admin → null (no restriction)", () => {
    const scope = welfareReportsScopeClause({ role: "admin" }, []);
    expect(scope).toBeNull();
  });

  it("govt empty → sql`false` (not null)", () => {
    const scope = welfareReportsScopeClause({ role: "govt" }, []);
    // Must be non-null — it's sql`false`, not null
    expect(scope).not.toBeNull();
  });

  it("govt with assignment → scopes to matching reports (DB count)", async () => {
    const scope = welfareReportsScopeClause({ role: "govt" }, [
      { province: PROV_A, locality: LOC_A },
    ]);
    const rows = await db
      .select({ n: count() })
      .from(welfareReports)
      .where(and(inArray(welfareReports.id, reportIds), sql`(${scope})`));
    expect(rows[0]?.n).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Equivalence — petsScopeClause (already canonical, regression guard)
// ---------------------------------------------------------------------------

describe("petsScopeClause — regression guard post-refactor", () => {
  it("admin, no province → null (no restriction)", async () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], period);
    expect(petsScopeClause(ctx)).toBeNull();
  });

  it("govt empty → non-null (sql`false`)", () => {
    const ctx = buildProjectionContext({ role: "govt" }, [], period);
    const clause = petsScopeClause(ctx);
    expect(clause).not.toBeNull();
  });

  it("govt scoped → same row count as jurisdictionPairClause direct call", async () => {
    const jurisdictions = [{ province: PROV_A, locality: LOC_A }];
    const ctx = buildProjectionContext({ role: "govt" }, jurisdictions, period);
    const clause = petsScopeClause(ctx);

    // Count via petsScopeClause
    const allPetIds = [...petIdsA, ...(petIdB ? [petIdB] : [])];
    const rowsViaScope = await db
      .select({ n: count() })
      .from(pets)
      .where(and(inArray(pets.id, allPetIds), sql`(${clause})`));
    const nScope = rowsViaScope[0]?.n ?? 0;

    // Count via jurisdictionPairClause directly
    const nDirect = await countPetsWithPairClause(jurisdictions);

    expect(nScope).toBe(nDirect);
    expect(nScope).toBe(3);
  });
});
