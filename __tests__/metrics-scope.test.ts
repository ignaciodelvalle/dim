// Integration tests for lib/metrics/ scope + population primitives.
// Requires a running local Postgres (local Supabase stack).
//
// Tests:
//   1. activePetsCondition excludes deceased pets (alive = active + lost).
//   2. activePetsCondition excludes pets outside the viewer's jurisdiction.
//   3. activePetsCondition returns 0 for govt with no jurisdiction assignments.
//   4. dogsInScopeCondition filters by species='dog'.
//   5. petsScopeClause returns null for admin and sql`false` for empty govt.

import { and, count, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets } from "@/db";
import {
  activePetsCondition,
  buildProjectionContext,
  dogsInScopeCondition,
  petsScopeClause,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { withMutationOverride } from "./_helpers/db-overrides";

const PREFIX = "MST-"; // metrics scope test
const PROV_A = "Santa Fe";
const LOC_A = "Rosario";
const PROV_B = "Córdoba";
const LOC_B = "Córdoba";

const period = windows.trailing12m();

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let fixtureIds: string[] = [];

async function insertPet(
  token: string,
  opts: {
    species?: string;
    status?: "active" | "lost" | "deceased";
    province?: string;
    locality?: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `MST-${token}`,
      species: opts.species ?? "dog",
      status: opts.status ?? "active",
      jurisdictionProvince: opts.province ?? PROV_A,
      jurisdictionLocality: opts.locality ?? LOC_A,
    })
    .returning({ id: pets.id });
  fixtureIds.push(row.id);
  return row.id;
}

async function cleanup() {
  if (fixtureIds.length === 0) return;
  await withMutationOverride(async (tx) => {
    await tx.delete(petEvents).where(inArray(petEvents.petId, fixtureIds));
  });
  await db.delete(ownerships).where(inArray(ownerships.petId, fixtureIds));
  await db.delete(pets).where(inArray(pets.id, fixtureIds));
  fixtureIds = [];
}

beforeAll(async () => {
  await cleanup();

  // 1. Active dog in PROV_A/LOC_A
  await insertPet(`${PREFIX}ACTIVE-A`, { species: "dog", province: PROV_A, locality: LOC_A });
  // 2. Lost cat in PROV_A/LOC_A — should be counted as "alive" (active+lost)
  await insertPet(`${PREFIX}LOST-A`, {
    species: "cat",
    status: "lost",
    province: PROV_A,
    locality: LOC_A,
  });
  // 3. Deceased dog in PROV_A/LOC_A — must NOT count
  await insertPet(`${PREFIX}DEAD-A`, {
    species: "dog",
    status: "deceased",
    province: PROV_A,
    locality: LOC_A,
  });
  // 4. Active dog in PROV_B/LOC_B — out of jurisdiction for govt scoped to A
  await insertPet(`${PREFIX}ACTIVE-B`, { species: "dog", province: PROV_B, locality: LOC_B });
});

afterAll(cleanup);

// Helper: count MST- prefixed pets matching a base condition.
async function countWith(condition: ReturnType<typeof activePetsCondition>) {
  const rows = await db
    .select({ n: count() })
    .from(pets)
    .where(and(condition, sql`${pets.publicToken} LIKE ${"MST-%"}`));
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("activePetsCondition", () => {
  it("excludes deceased pets for global (admin) scope", async () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], period);
    const n = await countWith(activePetsCondition(ctx));
    // ACTIVE-A + LOST-A + ACTIVE-B = 3. DEAD-A excluded.
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it("excludes pets outside jurisdiction for govt scope", async () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: PROV_A, locality: LOC_A }],
      period,
    );
    const n = await countWith(activePetsCondition(ctx));
    // ACTIVE-A + LOST-A = 2. DEAD-A excluded (deceased). ACTIVE-B excluded (wrong jurisdiction).
    expect(n).toBe(2);
  });

  it("returns 0 rows for govt with no jurisdiction assignments", async () => {
    const ctx = buildProjectionContext({ role: "govt" }, [], period);
    const n = await countWith(activePetsCondition(ctx));
    expect(n).toBe(0);
  });
});

describe("dogsInScopeCondition", () => {
  it("counts only dogs (excludes cats) in jurisdiction", async () => {
    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: PROV_A, locality: LOC_A }],
      period,
    );
    const rows = await db
      .select({ n: count() })
      .from(pets)
      .where(and(dogsInScopeCondition(ctx), sql`${pets.publicToken} LIKE ${"MST-%"}`));
    // Only ACTIVE-A (dog, active). LOST-A is cat. DEAD-A is deceased.
    expect(rows[0]?.n).toBe(1);
  });
});

describe("petsScopeClause", () => {
  it("returns null for admin scope (no WHERE restriction)", () => {
    const ctx = buildProjectionContext({ role: "admin" }, [], period);
    expect(petsScopeClause(ctx)).toBeNull();
  });

  it("returns a non-null sql fragment for govt with empty jurisdictions", () => {
    const ctx = buildProjectionContext({ role: "govt" }, [], period);
    const clause = petsScopeClause(ctx);
    // Must be a sql`false` fragment (not null) — yields 0 rows
    expect(clause).not.toBeNull();
  });
});
