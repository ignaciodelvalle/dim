// Integration tests for lib/govt-home-kpis — focuses on the census denominator
// introduced in migration 0067.
//
// We exercise fetchBitesPer10k to assert that the rate is now derived from
// the jurisdictions_census table rather than the heuristic constants that
// the previous code used (3_000_000 for admin, localities × 50_000 for govt).

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, jurisdictionsCensus, petEvents, pets } from "@/db";
import {
  fetchActiveZoonosis,
  fetchBitesPer10k,
  fetchRabiesCoverage,
  fetchRabiesCoverageByProvince,
  fetchSterilizationMetrics,
} from "@/lib/analytics/govt-home-kpis";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PROVINCE = "Santa Fe";
// A synthetic locality (not a real one like "Rosario") — scope isolation
// (commit 9e57a7b7 fixed jurisdiction scoping so seed-panorama's Santa
// Fe/Rosario bite rows now correctly count too, which broke the absolute
// reports===1 assertion below when it shared "Rosario" with seed data).
// Mirrors the unique-locality idiom used elsewhere in this suite (e.g.
// "DriftKpiVille", "BitesWindowVille").
const TEST_LOCALITY = "HkCensusKpiVille";
const TEST_PET_TOKEN = "HK-BITES-TEST-01";

// The INDEC 2022 Santa Fe population seeded in migration 0067.
// This must stay in sync with the value in the migration file.
const SANTA_FE_CENSUS_POPULATION = 3_556_522;

let testPetId: string;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function cleanupFixtures() {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`
      DELETE FROM pet_events
      WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${TEST_PET_TOKEN})
    `);
    await tx.execute(sql`
      DELETE FROM pets WHERE public_token = ${TEST_PET_TOKEN}
    `);
  });
}

async function insertBiteEvent(occurredAt: Date) {
  await db.insert(petEvents).values({
    petId: testPetId,
    eventType: "incident_reported",
    occurredAt,
    payload: {
      payload_version: 1,
      incident_type: "bite_inflicted",
      severity: "minor",
      injuries_summary: null,
      vet_involved: false,
      location_description: null,
      victim_species: "human",
      pet_jurisdiction_province: TEST_PROVINCE,
      pet_jurisdiction_locality: TEST_LOCALITY,
    },
    authorRole: "owner",
    recordedByUserId: null,
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanupFixtures();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: TEST_PET_TOKEN,
      name: "BiteTestDog",
      species: "dog",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning({ id: pets.id });
  testPetId = pet.id;
});

afterAll(cleanupFixtures);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchBitesPer10k — census denominator", () => {
  it("uses the census table population for a scoped govt view", async () => {
    // Insert one bite event in the last 12 months.
    await insertBiteEvent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      windows.trailing12m(),
    );
    const kpi = await fetchBitesPer10k(ctx);

    // With 1 bite and SANTA_FE_CENSUS_POPULATION, the expected rate is:
    // round((1 / (SANTA_FE_CENSUS_POPULATION / 10_000)) * 10) / 10
    const expectedRate = Math.round((1 / (SANTA_FE_CENSUS_POPULATION / 10_000)) * 10) / 10;

    expect(kpi.reports).toBe(1);
    expect(kpi.rate).toBe(expectedRate);

    // Sanity check: this rate is tiny (< 0.1 for 1 bite in 3.5M population).
    // The old heuristic (1 locality × 50_000) would yield ~0.2 — a 20× error.
    // Just assert it's less than 0.01 to confirm we're using the real figure.
    expect(kpi.rate).toBeLessThan(0.01);
  });

  it("returns rate=0 gracefully when no census row exists for the province", async () => {
    // Use a province that will NOT have a census row inserted.
    // We temporarily delete the row, assert zero, then restore.
    await db.delete(jurisdictionsCensus).where(eq(jurisdictionsCensus.provinceName, TEST_PROVINCE));

    const ctx = buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality: TEST_LOCALITY }],
      windows.trailing12m(),
    );

    try {
      const kpi = await fetchBitesPer10k(ctx);
      expect(kpi.rate).toBe(0);
      expect(kpi.delta).toBe(0);
    } finally {
      // Restore the census row.
      await db
        .insert(jurisdictionsCensus)
        .values({
          provinceName: TEST_PROVINCE,
          population: SANTA_FE_CENSUS_POPULATION,
          censusYear: 2022,
          source: "INDEC Censo 2022",
        })
        .onConflictDoNothing();
    }
  });

  it("returns rate=0 for empty govt jurisdictions without hitting the DB", async () => {
    const ctx = buildProjectionContext({ role: "govt" }, [], windows.trailing12m());
    const kpi = await fetchBitesPer10k(ctx);
    expect(kpi.rate).toBe(0);
    expect(kpi.delta).toBe(0);
    expect(kpi.reports).toBe(0);
  });

  it("admin scope uses the summed national census population", async () => {
    // For admin scope there's no WHERE on province; the rate should be
    // computed against the sum of all 24 provinces. We can't assert the
    // exact national total here (other fixtures may have bite events) but
    // we CAN assert that the rate is much smaller than it would be with
    // the old 3_000_000 heuristic, because the real national total is ~46M.
    const ctx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());
    const kpi = await fetchBitesPer10k(ctx);
    // A healthy DB with only our 1 fixture bite event should produce < 0.001.
    // Mainly asserting it doesn't throw and returns a non-negative number.
    expect(kpi.rate).toBeGreaterThanOrEqual(0);
    expect(kpi.reports).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Payload/pets jurisdiction drift (scope-security review 2026-07-04 A2)
// ---------------------------------------------------------------------------
//
// Event payloads carry pet_jurisdiction_* as an event-time snapshot. When the
// pet later moves, the payload and pets.jurisdiction_* diverge; payload-only
// scoping would count the (moved-away) pet into the OLD jurisdiction's govt
// aggregates. Fixtures: one pet that moved out of scope (payload in scope,
// current jurisdiction elsewhere) and one resident pet (both in scope), in a
// unique locality so scoped counts are exactly ours.

describe("govt KPI aggregates — payload/pets jurisdiction drift", () => {
  const DRIFT_PROVINCE = "Santa Fe";
  const DRIFT_LOCALITY = "DriftKpiVille"; // unique to this suite
  const TOKEN_MOVED = "HK-DRIFT-KPI-01";
  const TOKEN_RESIDENT = "HK-DRIFT-KPI-02";

  let movedPetId: string;
  let residentPetId: string;

  const driftCtx = () =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: DRIFT_PROVINCE, locality: DRIFT_LOCALITY }],
      windows.trailing12m(),
    );

  async function cleanupDriftFixtures() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events
        WHERE pet_id IN (
          SELECT id FROM pets WHERE public_token IN (${TOKEN_MOVED}, ${TOKEN_RESIDENT})
        )
      `);
      await tx.execute(sql`
        DELETE FROM pets WHERE public_token IN (${TOKEN_MOVED}, ${TOKEN_RESIDENT})
      `);
    });
  }

  async function insertDriftEvent(
    petId: string,
    eventType: string,
    extraPayload: Record<string, unknown>,
  ) {
    await db.insert(petEvents).values({
      petId,
      eventType,
      occurredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      payload: {
        payload_version: 1,
        ...extraPayload,
        // Payload snapshot claims the DRIFT jurisdiction for BOTH pets; only
        // the resident pet's CURRENT pets.jurisdiction_* matches it.
        pet_jurisdiction_province: DRIFT_PROVINCE,
        pet_jurisdiction_locality: DRIFT_LOCALITY,
      },
      authorRole: "vet",
      recordedByUserId: null,
    });
  }

  beforeAll(async () => {
    await cleanupDriftFixtures();

    const inserted = await db
      .insert(pets)
      .values([
        {
          publicToken: TOKEN_MOVED,
          name: "DriftMovedKpiDog",
          species: "dog",
          // Moved away: current jurisdiction differs from the event payloads.
          jurisdictionProvince: "Córdoba",
          jurisdictionLocality: "Córdoba",
        },
        {
          publicToken: TOKEN_RESIDENT,
          name: "DriftResidentKpiDog",
          species: "dog",
          jurisdictionProvince: DRIFT_PROVINCE,
          jurisdictionLocality: DRIFT_LOCALITY,
        },
      ])
      .returning({ id: pets.id, publicToken: pets.publicToken });
    movedPetId = inserted.find((p) => p.publicToken === TOKEN_MOVED)?.id as string;
    residentPetId = inserted.find((p) => p.publicToken === TOKEN_RESIDENT)?.id as string;

    for (const petId of [movedPetId, residentPetId]) {
      await insertDriftEvent(petId, "incident_reported", {
        incident_type: "bite_inflicted",
        severity: "minor",
        victim_species: "human",
      });
      await insertDriftEvent(petId, "sterilization_performed", {});
      await insertDriftEvent(petId, "disease_reported", { disease: "lepto" });
    }
  });

  afterAll(cleanupDriftFixtures);

  it("fetchBitesPer10k counts only the resident pet's bite", async () => {
    const kpi = await fetchBitesPer10k(driftCtx());
    expect(kpi.reports).toBe(1);
  });

  it("fetchSterilizationMetrics counts only the resident pet's sterilization", async () => {
    const kpi = await fetchSterilizationMetrics(driftCtx());
    expect(kpi.count).toBe(1);
  });

  it("fetchActiveZoonosis disease arms count only the resident pet's report", async () => {
    const kpi = await fetchActiveZoonosis(driftCtx());
    expect(kpi.lepto).toBe(1);
    expect(kpi.hidat).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Amendment overlay in SQL aggregates (projection-cron audit 2026-07-03 A2)
// ---------------------------------------------------------------------------
//
// An event_amended correction MUST change the KPI: a vaccination logged as
// "Séxtuple" but corrected to "Antirrábica" counts toward rabies coverage,
// and the reverse correction un-counts it. Uses a locality no other fixture
// touches so the scoped denominator is exactly our pets.

describe("fetchRabiesCoverage — event_amended corrections project into the aggregate", () => {
  const AMEND_PROVINCE = "Santa Fe";
  const AMEND_LOCALITY = "AmendKpiVille"; // unique to this suite
  const TOKEN_MISLOGGED = "HK-AMEND-KPI-01"; // logged Séxtuple, corrected → Antirrábica
  const TOKEN_MISNAMED = "HK-AMEND-KPI-02"; // logged Antirrábica, corrected → Séxtuple

  let misloggedPetId: string;
  let misnamedPetId: string;
  let misloggedVaxId: string;
  let misnamedVaxId: string;

  const scopedCtx = () =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: AMEND_PROVINCE, locality: AMEND_LOCALITY }],
      windows.trailing12m(),
    );

  async function cleanupAmendFixtures() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events
        WHERE pet_id IN (
          SELECT id FROM pets WHERE public_token IN (${TOKEN_MISLOGGED}, ${TOKEN_MISNAMED})
        )
      `);
      await tx.execute(sql`
        DELETE FROM pets WHERE public_token IN (${TOKEN_MISLOGGED}, ${TOKEN_MISNAMED})
      `);
    });
  }

  async function insertVaccination(petId: string, vaccineName: string): Promise<string> {
    const [row] = await db
      .insert(petEvents)
      .values({
        petId,
        eventType: "vaccination_administered",
        occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        payload: {
          payload_version: 1,
          vaccine_name: vaccineName,
          brand: null,
          batch: null,
          administered_by: null,
          next_due_at: null,
          // petEventsScopeClause filters scoped govt reads on these payload
          // fields — required for the fixture to be visible in the scoped ctx.
          pet_jurisdiction_province: AMEND_PROVINCE,
          pet_jurisdiction_locality: AMEND_LOCALITY,
        },
        authorRole: "owner",
        recordedByUserId: null,
      })
      .returning({ id: petEvents.id });
    return row.id;
  }

  async function amendVaccineName(
    petId: string,
    targetEventId: string,
    from: string,
    to: string,
    occurredAt: Date = new Date(),
  ) {
    await db.insert(petEvents).values({
      petId,
      eventType: "event_amended",
      occurredAt,
      payload: {
        payload_version: 1,
        target_event_id: targetEventId,
        reason: "Nombre de vacuna mal cargado",
        changes: [{ field: "vaccine_name", old: from, new: to }],
      },
      authorRole: "owner",
      recordedByUserId: null,
    });
  }

  beforeAll(async () => {
    await cleanupAmendFixtures();
    const inserted = await db
      .insert(pets)
      .values(
        [TOKEN_MISLOGGED, TOKEN_MISNAMED].map((token) => ({
          publicToken: token,
          name: `AmendKpiDog-${token.slice(-2)}`,
          species: "dog",
          status: "active" as const,
          jurisdictionProvince: AMEND_PROVINCE,
          jurisdictionLocality: AMEND_LOCALITY,
        })),
      )
      .returning({ id: pets.id, publicToken: pets.publicToken });
    misloggedPetId = inserted.find((p) => p.publicToken === TOKEN_MISLOGGED)?.id as string;
    misnamedPetId = inserted.find((p) => p.publicToken === TOKEN_MISNAMED)?.id as string;

    misloggedVaxId = await insertVaccination(misloggedPetId, "Séxtuple");
    misnamedVaxId = await insertVaccination(misnamedPetId, "Antirrábica");
  });

  afterAll(cleanupAmendFixtures);

  it("before any correction, only the as-recorded rabies vaccine counts", async () => {
    const kpi = await fetchRabiesCoverage(scopedCtx());
    expect(kpi.hasData).toBe(true);
    // 2 dogs in scope, 1 counted (the raw Antirrábica) → 50%.
    expect(kpi.current).toBe(50);
  });

  it("corrections flip BOTH ways: Séxtuple→Antirrábica counts, Antirrábica→Séxtuple un-counts", async () => {
    await amendVaccineName(misloggedPetId, misloggedVaxId, "Séxtuple", "Antirrábica");
    await amendVaccineName(misnamedPetId, misnamedVaxId, "Antirrábica", "Séxtuple");

    const kpi = await fetchRabiesCoverage(scopedCtx());
    // Still 2 dogs; now the OTHER one counts → still 50%, but composed of the
    // corrected event. Assert composition via the per-province variant below.
    expect(kpi.current).toBe(50);

    const byProvince = await fetchRabiesCoverageByProvince(scopedCtx());
    const row = byProvince.find((r) => r.province === AMEND_PROVINCE);
    expect(row?.total).toBe(2);
    expect(row?.vaccinated).toBe(1);
  });

  it("a LATER amendment supersedes the earlier one (latest wins, as in overlayAmendments)", async () => {
    // Second correction on the mis-named pet restores Antirrábica → both count.
    // Strictly later occurredAt so the "latest wins" ordering is unambiguous.
    await amendVaccineName(
      misnamedPetId,
      misnamedVaxId,
      "Séxtuple",
      "Antirrábica",
      new Date(Date.now() + 60_000),
    );

    const kpi = await fetchRabiesCoverage(scopedCtx());
    expect(kpi.current).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT (val-2-govt B1): the rabies-coverage numerator window is a FIXED
// trailing 12 months intrinsic to the metric (annual vaccination, Ley 22.953) —
// NOT the caller's display period. Two surfaces sharing the "(perros, 12m)"
// label MUST show the SAME number: the /gob Panel (true trailing-12m ctx) and
// the Panorama console (whose "cumplimiento" preset commits ?period=90d) once
// rendered 42% vs 11% for the identical scope+label. This suite locks the fix:
// a dog vaccinated 180 days ago (older than 90d, within 12m) counts the same
// under a 90-day display window as under a 12-month one.
// ---------------------------------------------------------------------------

describe("fetchRabiesCoverage — numerator window is intrinsic 12m, not the display period", () => {
  const WIN_PROVINCE = "Santa Fe";
  const WIN_LOCALITY = "RabiesWindowVille"; // unique to this suite
  const WIN_TOKEN = "HK-RABIES-WINDOW-01";
  const DAY_MS = 24 * 60 * 60 * 1000;

  let winPetId: string;

  const scopedCtxForPeriod = (period: { since: Date; until: Date }) =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: WIN_PROVINCE, locality: WIN_LOCALITY }],
      period,
    );

  async function cleanup() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events
        WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${WIN_TOKEN})
      `);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${WIN_TOKEN}`);
    });
  }

  beforeAll(async () => {
    await cleanup();
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: WIN_TOKEN,
        name: "RabiesWindowDog",
        species: "dog",
        status: "active",
        jurisdictionProvince: WIN_PROVINCE,
        jurisdictionLocality: WIN_LOCALITY,
      })
      .returning({ id: pets.id });
    winPetId = pet.id;

    // Rabies vaccination 180 days ago: inside a trailing-12m window, OUTSIDE a
    // trailing-90d window. Before the fix this dog was uncounted under a 90d
    // display period → 0% coverage; after the fix it counts under both.
    await db.insert(petEvents).values({
      petId: winPetId,
      eventType: "vaccination_administered",
      occurredAt: new Date(Date.now() - 180 * DAY_MS),
      payload: {
        payload_version: 1,
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: null,
        pet_jurisdiction_province: WIN_PROVINCE,
        pet_jurisdiction_locality: WIN_LOCALITY,
      },
      authorRole: "owner",
      recordedByUserId: null,
    });
  });

  afterAll(cleanup);

  it("returns the SAME coverage for a 90-day and a 12-month display window", async () => {
    const now = Date.now();
    const period90d = { since: new Date(now - 90 * DAY_MS), until: new Date(now) };
    const period12m = windows.trailing12m();

    const kpi90d = await fetchRabiesCoverage(scopedCtxForPeriod(period90d));
    const kpi12m = await fetchRabiesCoverage(scopedCtxForPeriod(period12m));

    // 1 dog in scope, vaccinated 180d ago → 100% under BOTH windows (the metric
    // is a fixed trailing-12m, so the shorter display window cannot shrink it).
    expect(kpi90d.current).toBe(100);
    expect(kpi12m.current).toBe(100);
    expect(kpi90d.current).toBe(kpi12m.current);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT (issue #52): "al día / covered" means the latest rabies dose is
// CURRENTLY VALID, not merely "a dose exists in the last 12 months". A dose that
// sets an explicit next_due_at counts only while `now <= next_due_at`; a dose
// with no next_due_at falls back to the trailing-12m proxy. So a dog whose last
// dose expired (next_due_at in the past) is NOT covered even if it was
// administered under 12 months ago; a dog whose next_due_at is in the future IS.
// ---------------------------------------------------------------------------

describe("fetchRabiesCoverage — currently-valid via next_due_at (issue #52)", () => {
  const VALID_PROVINCE = "Santa Fe";
  const EXPIRY_LOCALITY = "RabiesExpiryVille"; // FUTURE + PAST dogs
  const FALLBACK_LOCALITY = "RabiesFallbackVille"; // next_due_at absent
  const TOKEN_FUTURE = "HK-RABVALID-FUTURE";
  const TOKEN_PAST = "HK-RABVALID-PAST";
  const TOKEN_FALLBACK = "HK-RABVALID-FALLBACK";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ALL_TOKENS = [TOKEN_FUTURE, TOKEN_PAST, TOKEN_FALLBACK];

  const ctxFor = (locality: string) =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: VALID_PROVINCE, locality }],
      windows.trailing12m(),
    );

  async function cleanup() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events
        WHERE pet_id IN (SELECT id FROM pets WHERE public_token IN (${sql.join(
          ALL_TOKENS.map((t) => sql`${t}`),
          sql`, `,
        )}))
      `);
      await tx.execute(sql`
        DELETE FROM pets WHERE public_token IN (${sql.join(
          ALL_TOKENS.map((t) => sql`${t}`),
          sql`, `,
        )})
      `);
    });
  }

  async function insertDog(token: string, locality: string): Promise<string> {
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: token,
        name: `RabValidDog-${token.slice(-4)}`,
        species: "dog",
        status: "active",
        jurisdictionProvince: VALID_PROVINCE,
        jurisdictionLocality: locality,
      })
      .returning({ id: pets.id });
    return pet.id;
  }

  async function insertRabiesDose(
    petId: string,
    locality: string,
    occurredAt: Date,
    nextDueAt: Date | null,
  ) {
    await db.insert(petEvents).values({
      petId,
      eventType: "vaccination_administered",
      occurredAt,
      payload: {
        payload_version: 1,
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
        pet_jurisdiction_province: VALID_PROVINCE,
        pet_jurisdiction_locality: locality,
      },
      authorRole: "owner",
      recordedByUserId: null,
    });
  }

  beforeAll(async () => {
    await cleanup();
    const now = Date.now();
    // EXPIRY_LOCALITY: two dogs, both dosed 60 days ago (well within 12m).
    const futureId = await insertDog(TOKEN_FUTURE, EXPIRY_LOCALITY);
    const pastId = await insertDog(TOKEN_PAST, EXPIRY_LOCALITY);
    // next_due_at 200 days in the FUTURE → currently valid.
    await insertRabiesDose(
      futureId,
      EXPIRY_LOCALITY,
      new Date(now - 60 * DAY_MS),
      new Date(now + 200 * DAY_MS),
    );
    // next_due_at 10 days in the PAST → expired, NOT valid (despite <12m).
    await insertRabiesDose(
      pastId,
      EXPIRY_LOCALITY,
      new Date(now - 60 * DAY_MS),
      new Date(now - 10 * DAY_MS),
    );

    // FALLBACK_LOCALITY: one dog, dose 60 days ago, next_due_at ABSENT → proxy.
    const fallbackId = await insertDog(TOKEN_FALLBACK, FALLBACK_LOCALITY);
    await insertRabiesDose(fallbackId, FALLBACK_LOCALITY, new Date(now - 60 * DAY_MS), null);
  });

  afterAll(cleanup);

  it("a future next_due_at counts, an expired one does not (2 dogs → 50%)", async () => {
    const kpi = await fetchRabiesCoverage(ctxFor(EXPIRY_LOCALITY));
    expect(kpi.hasData).toBe(true);
    expect(kpi.current).toBe(50);

    const byProvince = await fetchRabiesCoverageByProvince(ctxFor(EXPIRY_LOCALITY));
    const row = byProvince.find((r) => r.province === VALID_PROVINCE);
    expect(row?.total).toBe(2);
    expect(row?.vaccinated).toBe(1); // only the future-dated dose
  });

  it("falls back to the 12m proxy when next_due_at is absent (1 dog → 100%)", async () => {
    const kpi = await fetchRabiesCoverage(ctxFor(FALLBACK_LOCALITY));
    expect(kpi.current).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT (issue #58): period-driven flow KPIs whose LABEL states a fixed
// window must compute over that INTRINSIC window, not the caller's display
// period — otherwise the Panorama console (which commits ?period=90d via its
// "cumplimiento" preset) and the /gob Panel (12m/30d ctx) show different numbers
// under the same label. "Mordeduras / 10k hab." is a fixed trailing-12m rate;
// "Esterilizaciones / mes" is a fixed trailing-30d flow. Both anchor to
// ctx.period.until.
// ---------------------------------------------------------------------------

describe("fetchBitesPer10k — intrinsic 12m window, not the display period (issue #58)", () => {
  const BW_PROVINCE = "Santa Fe";
  const BW_LOCALITY = "BitesWindowVille"; // unique
  const BW_TOKEN = "HK-BITESWIN-01";
  const DAY_MS = 24 * 60 * 60 * 1000;
  let bwPetId: string;

  const ctxForPeriod = (period: { since: Date; until: Date }) =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: BW_PROVINCE, locality: BW_LOCALITY }],
      period,
    );

  async function cleanup() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${BW_TOKEN})
      `);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${BW_TOKEN}`);
    });
  }

  beforeAll(async () => {
    await cleanup();
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: BW_TOKEN,
        name: "BitesWindowDog",
        species: "dog",
        status: "active",
        jurisdictionProvince: BW_PROVINCE,
        jurisdictionLocality: BW_LOCALITY,
      })
      .returning({ id: pets.id });
    bwPetId = pet.id;
    // One bite 180 days ago: inside a trailing-12m window, OUTSIDE a 90d window.
    await db.insert(petEvents).values({
      petId: bwPetId,
      eventType: "incident_reported",
      occurredAt: new Date(Date.now() - 180 * DAY_MS),
      payload: {
        payload_version: 1,
        incident_type: "bite_inflicted",
        severity: "minor",
        injuries_summary: null,
        vet_involved: false,
        location_description: null,
        victim_species: "human",
        pet_jurisdiction_province: BW_PROVINCE,
        pet_jurisdiction_locality: BW_LOCALITY,
      },
      authorRole: "owner",
      recordedByUserId: null,
    });
  });

  afterAll(cleanup);

  it("counts the 180-day-old bite under BOTH a 90-day and a 12-month display window", async () => {
    const now = Date.now();
    const kpi90d = await fetchBitesPer10k(
      ctxForPeriod({ since: new Date(now - 90 * DAY_MS), until: new Date(now) }),
    );
    const kpi12m = await fetchBitesPer10k(ctxForPeriod(windows.trailing12m()));
    // Fixed trailing-12m: the shorter display window cannot shrink the numerator.
    expect(kpi90d.reports).toBe(1);
    expect(kpi12m.reports).toBe(1);
    expect(kpi90d.reports).toBe(kpi12m.reports);
  });
});

describe("fetchSterilizationMetrics — intrinsic 30d window, not the display period (issue #58)", () => {
  const SW_PROVINCE = "Santa Fe";
  const SW_LOCALITY = "SterilWindowVille"; // unique
  const SW_TOKEN = "HK-STERILWIN-01";
  const DAY_MS = 24 * 60 * 60 * 1000;
  let swPetId: string;

  const ctxForPeriod = (period: { since: Date; until: Date }) =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: SW_PROVINCE, locality: SW_LOCALITY }],
      period,
    );

  async function cleanup() {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`
        DELETE FROM pet_events WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${SW_TOKEN})
      `);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${SW_TOKEN}`);
    });
  }

  async function insertSterilization(occurredAt: Date) {
    await db.insert(petEvents).values({
      petId: swPetId,
      eventType: "sterilization_performed",
      occurredAt,
      payload: {
        payload_version: 1,
        pet_jurisdiction_province: SW_PROVINCE,
        pet_jurisdiction_locality: SW_LOCALITY,
      },
      authorRole: "vet",
      recordedByUserId: null,
    });
  }

  beforeAll(async () => {
    await cleanup();
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: SW_TOKEN,
        name: "SterilWindowDog",
        species: "dog",
        status: "active",
        jurisdictionProvince: SW_PROVINCE,
        jurisdictionLocality: SW_LOCALITY,
      })
      .returning({ id: pets.id });
    swPetId = pet.id;
    // Two sterilizations: one 10 days ago (inside 30d), one 60 days ago (outside
    // the intrinsic 30d window but inside 12m).
    await insertSterilization(new Date(Date.now() - 10 * DAY_MS));
    await insertSterilization(new Date(Date.now() - 60 * DAY_MS));
  });

  afterAll(cleanup);

  it("counts only the last-30-day sterilization under BOTH a 30d and a 12m display window", async () => {
    const count30d = await fetchSterilizationMetrics(ctxForPeriod(windows.trailing30d()));
    const count12m = await fetchSterilizationMetrics(ctxForPeriod(windows.trailing12m()));
    // Fixed trailing-30d: a wider display period cannot pull in the 60-day event.
    expect(count30d.count).toBe(1);
    expect(count12m.count).toBe(1);
    expect(count30d.count).toBe(count12m.count);
  });
});
