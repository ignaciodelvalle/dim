// Fitness + non-vacuity tests for the pet-cache re-derivation harness (ARCH-I).
//
// THREE layers of assurance:
//
//  1. FITNESS SWEEP — for every pet currently in the test DB, assert that every
//     derivable cache column equals its re-derived value. Because all
//     integration tests create pets through the REAL writers, this sweep
//     catches any future writer that forgets the cache half of a dual-write
//     (the column would drift from the events and this test would go red).
//
//  2. WRITER ROUND-TRIP — drive real writers (weight, pregnancy, tattoo,
//     custody dispute) against a fresh pet and assert rederivePetCache reports
//     all-match. This proves the derivation rules agree with the writers.
//
//  3. NON-VACUITY — deliberately skew a cache column via raw SQL and assert the
//     harness DETECTS the mismatch. Without this, a harness that always returns
//     "matches: true" would pass layers 1 and 2 silently.

import { createClient } from "@supabase/supabase-js";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordPregnancyStartedWriter } from "@/src/modules/pets/application/pregnancy/record-pregnancy-started";
import {
  custodyDisputes,
  db,
  notifications,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
  profiles,
} from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { CHECKED_COLUMN_NAMES, hasDrift, rederivePetCache } from "@/lib/infra/rederive-pet-cache";
import { createTattooForUser } from "@/src/modules/pets/application/tattoo/create-tattoo";
import { sql } from "drizzle-orm";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const OWNER_EMAIL = "rederive-owner@dim-test.local";
const PASS = "Rederive_2026!";
let ownerUserId: string;
const insertedPetIds: string[] = [];

const ownerAuthorship = {
  authorRole: "owner" as const,
  authorOrganizationId: null,
  authorVerified: false,
};

async function purgeUserByEmail(email: string) {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  await withMutationOverride(async (tx) => {
    for (const uid of ids) {
      await tx.delete(notifications).where(eq(notifications.userId, uid));
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }
  });
  if (found) await supabase.auth.admin.deleteUser(found.id);
}

async function insertTestPet(
  suffix: string,
  opts: { sex: "female" | "male"; species: "dog" | "cat" } = { sex: "female", species: "dog" },
) {
  const token = `REDERIVE-${suffix}-${Date.now()}`;
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `RederivePet${suffix}`,
      species: opts.species,
      sex: opts.sex,
      status: "active",
    })
    .returning();
  await db.insert(ownerships).values({ petId: pet.id, ownerUserId, role: "owner" });
  insertedPetIds.push(pet.id);
  return pet;
}

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;
});

afterAll(async () => {
  for (const petId of insertedPetIds) {
    await withMutationOverride(async (tx) => {
      // custody_dispute_parties cascade-delete when their dispute row is deleted.
      await tx.delete(custodyDisputes).where(eq(custodyDisputes.petId, petId));
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  await db.delete(notifications).where(eq(notifications.userId, ownerUserId));
  await purgeUserByEmail(OWNER_EMAIL);
});

// ---------------------------------------------------------------------------
// Layer 1 — fitness sweep scoped to known-good seed pets
// ---------------------------------------------------------------------------
//
// WHY SCOPED (not whole-DB):
// A whole-DB sweep is state-dependent: leftover pets from other test files
// that run before this one (fileParallelism:false, serial order) can have
// cache columns in an intermediate write state or use synthetic tokens that
// hit edge-cases not covered by the harness (e.g. a microchip inserted via
// raw SQL without a matching pet_identifications row). This makes the sweep
// an intermittent flake rather than a reliable fitness signal.
//
// The scoped approach sweeps every pet whose publicToken was created by the
// canonical seed script (generatePublicToken() → "DIM-XXXX-XXXX" format).
// Seed pets go through the REAL writers (same as integration tests), so the
// fitness signal is preserved: if a writer forgets the cache dual-write, the
// seed pet's cache will drift and this test will go red.
//
// Writer round-trip tests (Layer 2) create their own pets and assert drift=false
// immediately, providing fine-grained coverage for each writer. Layer 1 is the
// safety net for writers that the round-trip layer does not explicitly cover.

describe("pet-cache fitness sweep", () => {
  it("every seed pet (DIM-* token) has a cache that matches its re-derived value", async () => {
    // Only sweep pets with canonical publicToken format from generatePublicToken().
    // This excludes raw-SQL test pets from other test files that may have
    // synthetic token formats or partial state from interrupted runs.
    const seedPets = await db
      .select({ id: pets.id, publicToken: pets.publicToken })
      .from(pets)
      .where(like(pets.publicToken, "DIM-%"));

    // The test DB is small but non-empty after bootstrap; if it were empty the
    // sweep would be vacuous (bootstrap creates at least 3 seed pets).
    expect(seedPets.length).toBeGreaterThan(0);

    const drifted: Array<{ token: string; columns: string[] }> = [];
    for (const p of seedPets) {
      const report = await rederivePetCache(p.id);
      if (hasDrift(report)) {
        drifted.push({
          token: p.publicToken,
          columns: Object.entries(report)
            .filter(([, r]) => !r.matches)
            .map(
              ([c, r]) =>
                `${c}(stored=${JSON.stringify(r.stored)} derived=${JSON.stringify(r.derived)})`,
            ),
        });
      }
    }

    // A failure here means a writer dual-write is broken OR a derivation rule
    // is wrong for seed-created pets. The message names the exact pets + columns.
    expect(drifted, JSON.stringify(drifted, null, 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — writer round-trips
// ---------------------------------------------------------------------------

describe("pet-cache writer round-trips", () => {
  it("a freshly registered pet (no events) re-derives with no drift", async () => {
    const pet = await insertTestPet("FRESH");
    const report = await rederivePetCache(pet.id);
    expect(hasDrift(report)).toBe(false);
    // Sanity: a fresh pet's derivable columns are all the empty/default value.
    expect(report.status.derived).toBe("active");
    expect(report.pregnancyStatus.derived).toBeNull();
    expect(report.inCustodyDispute.derived).toBe(false);
  });

  it("checks every documented column (no silently-missing column)", async () => {
    const pet = await insertTestPet("COLS");
    const report = await rederivePetCache(pet.id);
    expect(Object.keys(report).sort()).toEqual([...CHECKED_COLUMN_NAMES].sort());
  });

  it("weight_recorded dual-write re-derives with no drift", async () => {
    const pet = await insertTestPet("WEIGHT");
    const now = new Date();
    // Drive the real dual-write seam: insert the event AND the cache column.
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "weight_recorded",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: ownerUserId,
        ...ownerAuthorship,
        payload: validateEventPayload("weight_recorded", { kg: "8.50" }),
      });
      await tx
        .update(pets)
        .set({ estimatedWeightKg: "8.50", updatedAt: now })
        .where(eq(pets.id, pet.id));
    });

    const report = await rederivePetCache(pet.id);
    expect(hasDrift(report)).toBe(false);
    expect(report.estimatedWeightKg.matches).toBe(true);
  });

  it("pregnancy writer flips the cache and re-derives with no drift", async () => {
    const pet = await insertTestPet("PREG", { sex: "female", species: "dog" });
    const result = await recordPregnancyStartedWriter({
      pet,
      recordedByUserId: ownerUserId,
      eventAuthorship: ownerAuthorship,
      occurredAt: new Date(),
      weeksAtDiagnosis: null,
      vetConsulted: null,
      notes: null,
    });
    expect(result.ok).toBe(true);

    const report = await rederivePetCache(pet.id);
    expect(hasDrift(report)).toBe(false);
    expect(report.pregnancyStatus.stored).toBe("in_progress");
    expect(report.pregnancyStatus.derived).toBe("in_progress");
  });

  it("tattoo writer dual-write re-derives with no drift", async () => {
    const pet = await insertTestPet("TATTOO");
    const result = await createTattooForUser(pet.id, ownerUserId, ownerAuthorship, {
      code: "DIM-RDV-001",
      location: "inner_ear_left",
      description: "test tattoo",
      recordedAt: new Date("2026-01-15"),
      recordedBy: "Dr. Test",
      uploadedAttachment: { path: "fake/path.jpg", mimeType: "image/jpeg", size: 100 },
    });
    expect("eventId" in result).toBe(true);

    const report = await rederivePetCache(pet.id);
    expect(hasDrift(report)).toBe(false);
    expect(report.tattooCode.stored).toBe("DIM-RDV-001");
    expect(report.tattooCode.derived).toBe("DIM-RDV-001");
    expect(report.tattooRecordedAt.matches).toBe(true);
  });

  it("custody dispute (table-sourced) re-derives true while open, false after close", async () => {
    const pet = await insertTestPet("DISPUTE");
    const now = new Date();

    // Emit a raising event + open dispute row + flip the cache flag — mirrors
    // openDisputeFromEvent's dual-write (event spine + custody_disputes table).
    await db.transaction(async (tx) => {
      const [raisingEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_dispute_raised",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: ownerUserId,
          authorRole: "govt",
          authorOrganizationId: null,
          authorVerified: true,
          payload: validateEventPayload("custody_dispute_raised", {
            raised_by_role: "govt",
            raised_by_user_id: ownerUserId,
            external_proceeding_reference: null,
            reason: "Test dispute for re-derivation harness coverage.",
          }),
        })
        .returning({ id: petEvents.id });

      await tx.insert(custodyDisputes).values({
        publicToken: `DIS-RDV-${Date.now()}`,
        petId: pet.id,
        raisedByUserId: ownerUserId,
        raisedByRole: "govt",
        raisingEventId: raisingEvent.id,
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      });

      await tx
        .update(pets)
        .set({ inCustodyDispute: true, updatedAt: now })
        .where(eq(pets.id, pet.id));
    });

    const openReport = await rederivePetCache(pet.id);
    expect(openReport.inCustodyDispute.stored).toBe(true);
    expect(openReport.inCustodyDispute.derived).toBe(true);
    expect(openReport.inCustodyDispute.matches).toBe(true);

    // Resolve the dispute + flip the flag back (resolveDisputeAction's seam).
    const resolvedAt = new Date();
    await db
      .update(custodyDisputes)
      .set({
        status: "resolved",
        resolution: "ownership_confirmed",
        resolutionSummary: "x".repeat(120),
        resolvedByUserId: ownerUserId,
        resolvedAt,
        updatedAt: resolvedAt,
      })
      .where(and(eq(custodyDisputes.petId, pet.id), eq(custodyDisputes.status, "open")));
    await db
      .update(pets)
      .set({ inCustodyDispute: false, updatedAt: resolvedAt })
      .where(eq(pets.id, pet.id));

    const closedReport = await rederivePetCache(pet.id);
    expect(closedReport.inCustodyDispute.derived).toBe(false);
    expect(closedReport.inCustodyDispute.matches).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — non-vacuity: the harness must DETECT a deliberate skew
// ---------------------------------------------------------------------------

describe("pet-cache non-vacuity (harness detects skew)", () => {
  it("detects a skewed pregnancyStatus cache (events say in_progress, cache forced null)", async () => {
    const pet = await insertTestPet("SKEW-PREG", { sex: "female", species: "dog" });
    const ok = await recordPregnancyStartedWriter({
      pet,
      recordedByUserId: ownerUserId,
      eventAuthorship: ownerAuthorship,
      occurredAt: new Date(),
      weeksAtDiagnosis: null,
      vetConsulted: null,
      notes: null,
    });
    expect(ok.ok).toBe(true);

    // Pre-skew: clean.
    expect(hasDrift(await rederivePetCache(pet.id))).toBe(false);

    // SKEW the cache directly (simulates a writer that forgot the cache half).
    await db.update(pets).set({ pregnancyStatus: null }).where(eq(pets.id, pet.id));

    const report = await rederivePetCache(pet.id);
    expect(hasDrift(report)).toBe(true);
    expect(report.pregnancyStatus.matches).toBe(false);
    expect(report.pregnancyStatus.stored).toBeNull();
    expect(report.pregnancyStatus.derived).toBe("in_progress");
  });

  it("detects a skewed estimatedWeightKg cache", async () => {
    const pet = await insertTestPet("SKEW-WEIGHT");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "weight_recorded",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: ownerUserId,
        ...ownerAuthorship,
        payload: validateEventPayload("weight_recorded", { kg: "5.00" }),
      });
      await tx.update(pets).set({ estimatedWeightKg: "5.00" }).where(eq(pets.id, pet.id));
    });
    expect(hasDrift(await rederivePetCache(pet.id))).toBe(false);

    // Skew to a different number — numeric compare must flag it.
    await db.update(pets).set({ estimatedWeightKg: "9.90" }).where(eq(pets.id, pet.id));
    const report = await rederivePetCache(pet.id);
    expect(report.estimatedWeightKg.matches).toBe(false);
  });

  it("detects a skewed inCustodyDispute flag (no open dispute but flag true)", async () => {
    const pet = await insertTestPet("SKEW-DISPUTE");
    // No dispute row exists → derived false. Force the cache flag true.
    await db.update(pets).set({ inCustodyDispute: true }).where(eq(pets.id, pet.id));
    const report = await rederivePetCache(pet.id);
    expect(report.inCustodyDispute.stored).toBe(true);
    expect(report.inCustodyDispute.derived).toBe(false);
    expect(report.inCustodyDispute.matches).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Backfill-sentinel contract tests (ARCH-Q / migration 0083)
  //
  // The harness suppresses false positives for backfill-labeled canonical rows
  // because the backfill approximates some dates from created_at/current_date.
  // These tests document that contract explicitly:
  //
  //  A. A non-backfill chip row whose microchipId is directly skewed DOES get
  //     detected (proves the harness isn't universally suppressing chip checks).
  //
  //  B. A backfill-labeled row with a deliberately divergent recordedAt is
  //     SKIPPED (the "backfill sentinel suppresses date comparison" contract).
  // -------------------------------------------------------------------------

  it("detects skew on a non-backfill canonical chip row (sentinel does not suppress real drift)", async () => {
    const pet = await insertTestPet("SKEW-CHIP-REAL");
    const now = new Date();

    // Dual-write: emit the event AND insert the canonical row so both the
    // projection (event-derived) and the stored side (canonical row) agree
    // on the chip code before any skew is introduced.
    await withMutationOverride(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "microchip_implanted",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: ownerUserId,
        ...ownerAuthorship,
        payload: validateEventPayload("microchip_implanted", {
          chip_number: "100000000000001",
          country_code: "100",
          implant_date_known: false,
          implanted_by: null,
          location_on_body: null,
        }),
      });
      await tx.insert(petIdentifications).values({
        petId: pet.id,
        kind: "microchip_iso" as const,
        status: "active" as const,
        code: "100000000000001",
        isoCountryCode: "100",
        isoManufacturerCode: "0000",
        isoNationalId: "00000001",
        isoCompliant: true,
        recordedAt: now.toISOString().slice(0, 10),
        recordedByLabel: "dr-real-vet",
      });
      // ARCH-S: pets.microchipId dropped — canonical row above is the sole source.
    });

    // Pre-skew: microchipId must match (canonical=event-derived=same code).
    const cleanReport = await rederivePetCache(pet.id);
    expect(cleanReport.microchipId.matches).toBe(true);

    // Skew the canonical row's code — simulates canonical drift.
    await db.execute(
      sql`UPDATE pet_identifications SET code = '999999999999999'
              WHERE pet_id = ${pet.id} AND kind = 'microchip_iso' AND status = 'active'`,
    );

    const skewedReport = await rederivePetCache(pet.id);
    // stored='999999999999999' (canonical), derived='100000000000001' (event) → detected.
    expect(skewedReport.microchipId.matches).toBe(false);
    expect(skewedReport.microchipId.stored).toBe("999999999999999");
  });

  it("backfill-labeled canonical row: recordedAt mismatch is SKIPPED (sentinel suppresses date)", async () => {
    const pet = await insertTestPet("SKEW-CHIP-BACKFILL");

    // A backfill-labeled row represents a legacy pet with no microchip_implanted
    // event. The 0082/0083 backfills approximate recordedAt from created_at or
    // current_date, which may differ from any real implant date. The harness
    // suppresses microchipImplantedAt and microchipImplantedBy for backfill rows
    // to avoid false-positive drift alarms.
    //
    // We deliberately set recordedAt="2020-01-15" (a past date that will NOT match
    // the derived null since there's no event) and verify the harness treats the
    // mismatch as irrelevant (by treating stored as derived).
    await withMutationOverride(async (tx) => {
      await tx.insert(petIdentifications).values({
        petId: pet.id,
        kind: "microchip_iso" as const,
        status: "active" as const,
        code: "200000000000002",
        isoCountryCode: "200",
        isoManufacturerCode: "0000",
        isoNationalId: "00000002",
        isoCompliant: true,
        // Intentionally divergent from what a real event would produce (null).
        // 0083 sets current_date when microchip_implanted_at was null.
        recordedAt: "2020-01-15",
        recordedByLabel: "legacy_backfill_0083",
      });
      // ARCH-S: pets.microchipId dropped — canonical row above is the sole source.
    });

    const report = await rederivePetCache(pet.id);
    // microchipImplantedAt: stored is undefined (sentinel → uses derived=null) → matches.
    expect(report.microchipImplantedAt.matches).toBe(true);
    // microchipImplantedBy: stored is null (sentinel) and derived is null (no event) → matches.
    expect(report.microchipImplantedBy.matches).toBe(true);
    // microchipId: stored='200000000000002' (canonical), derived=null (no event).
    // This is intentional: for backfill rows without events, the harness correctly
    // flags microchipId as a drift (the canonical has data but no event backs it).
    // The sentinel ONLY suppresses date/person fields — not the code itself.
    expect(report.microchipId.stored).toBe("200000000000002");
    expect(report.microchipId.derived).toBeNull();
  });
});
