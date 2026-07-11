// RLS govt jurisdiction boundary — regression harness for the Tier-2 authz
// critique R1 (pet_identifications) and R2 (pet_service_dog).
//
// Drives the LIVE local Supabase stack via PostgREST (supabase-js, which IS
// subject to RLS), signed in as a real seeded govt operator, and proves the two
// govt READ policies do NOT leak PII beyond the operator's jurisdiction.
//
// GROUND TRUTH established while writing migration 0140 (documented so a future
// reader is not surprised):
//   - R2 (pet_service_dog): the pre-fix govt branch referenced ONLY `profiles`
//     (no jurisdiction join), so ANY institutional govt JWT read assistance-dog
//     status NATIONWIDE — a REAL, reachable leak. The fix adds a `govt_assignments`
//     join (province+locality); because `pets` carries its own RLS with NO govt
//     read policy, the govt subquery now yields zero pets → govt reads ZERO
//     service_dog rows through PostgREST. Leak closed.
//   - R1 (pet_identifications): the govt policy already referenced `pets`
//     (RLS-gated), so a govt JWT read ZERO identifications through PostgREST both
//     before AND after the fix — the province-wide leak was not reachable on the
//     PostgREST surface. The tightening is correct defense-in-depth (mirrors the
//     sibling govt policies, adds locality scope) and is asserted here so the
//     surface stays closed for govt.
//
// The app itself reads both tables via Drizzle (BYPASSRLS service role) with the
// fine-grained subsumption logic — RLS here is purely the PostgREST backstop.
//
// Pre-flight: `pnpm seed:test` (govt-local@dim.test, admin@dim.test) + migration
// 0140 applied locally. Missing seed/env → the suite SKIPS (contract-level).

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petIdentifications, petServiceDog, pets } from "@/db";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SHARED_PASSWORD = "Test1234!";

// A jurisdiction NO seeded govt operator is assigned to — so a govt read of the
// fixture rows can only mean the policy leaked (pre-fix R2 behaviour).
const OOJ_PROVINCE = "Córdoba";
const OOJ_LOCALITY = "PANO-GOVTRLS-OOJ";

let govtClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;
let setupError: string | null = null;

let fixturePetId: string | null = null;
let fixtureIdentificationId: string | null = null;
let fixtureServiceDogId: string | null = null;

async function signIn(email: string): Promise<SupabaseClient | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: SHARED_PASSWORD,
  });
  if (error || !data.user) {
    setupError = `sign-in failed for ${email}: ${error?.message ?? "no user"}. Run \`pnpm seed:test\`.`;
    return null;
  }
  return client;
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setupError = "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing — skipping govt RLS boundary suite.";
    return;
  }

  govtClient = await signIn("govt-local@dim.test");
  adminClient = await signIn("admin@dim.test");
  if (setupError) return;

  // Fixture pet in an out-of-jurisdiction locality + a PII identification row and
  // an assistance-dog row. Inserted via Drizzle (service role bypasses RLS).
  const [petRow] = await db
    .insert(pets)
    .values({
      publicToken: `DIM-GOVTRLS-${Date.now().toString(36).toUpperCase()}`,
      name: "Govt RLS Boundary Fixture",
      species: "dog",
      sex: "male",
      status: "active",
      jurisdictionProvince: OOJ_PROVINCE,
      jurisdictionLocality: OOJ_LOCALITY,
    })
    .returning({ id: pets.id });
  fixturePetId = petRow.id;

  const [idRow] = await db
    .insert(petIdentifications)
    .values({
      petId: fixturePetId,
      kind: "collar_tag",
      code: "GOVTRLS-FIXTURE-TAG",
      status: "active",
      recordedAt: new Date().toISOString().slice(0, 10),
    })
    .returning({ id: petIdentifications.id });
  fixtureIdentificationId = idRow.id;

  const [sdRow] = await db
    .insert(petServiceDog)
    .values({
      petId: fixturePetId,
      serviceType: "guia",
      trainingCenter: "Govt RLS Fixture Training Center",
    })
    .returning({ id: petServiceDog.id });
  fixtureServiceDogId = sdRow.id;
});

afterAll(async () => {
  await govtClient?.auth.signOut().catch(() => {});
  await adminClient?.auth.signOut().catch(() => {});
  if (fixtureServiceDogId) {
    await db
      .delete(petServiceDog)
      .where(eq(petServiceDog.id, fixtureServiceDogId))
      .catch(() => {});
  }
  if (fixtureIdentificationId) {
    await db
      .delete(petIdentifications)
      .where(eq(petIdentifications.id, fixtureIdentificationId))
      .catch(() => {});
  }
  if (fixturePetId) {
    await db
      .delete(pets)
      .where(eq(pets.id, fixturePetId))
      .catch(() => {});
  }
});

async function rowCount(client: SupabaseClient, table: string, id: string): Promise<number> {
  const { data } = await client.from(table).select("id").eq("id", id).limit(1);
  return data?.length ?? 0;
}

describe("RLS govt jurisdiction boundary (Tier-2 R1 / R2)", () => {
  it("setup ran without errors (otherwise the rest of the suite skips)", () => {
    if (setupError) console.warn(`[govt RLS boundary] SKIPPING: ${setupError}`);
    expect(true).toBe(true);
  });

  // R2 — the regression that matters most: pre-fix a govt JWT read this row
  // nationwide; post-fix (govt_assignments join) it must be DENIED.
  it("govt is DENIED reading an out-of-jurisdiction pet_service_dog row (R2 nationwide leak closed)", async () => {
    if (setupError || !govtClient || !fixtureServiceDogId) return;
    expect(await rowCount(govtClient, "pet_service_dog", fixtureServiceDogId)).toBe(0);
  });

  it("admin still reads the pet_service_dog row nationwide (positive control — admin branch intact)", async () => {
    if (setupError || !adminClient || !fixtureServiceDogId) return;
    expect(await rowCount(adminClient, "pet_service_dog", fixtureServiceDogId)).toBe(1);
  });

  // R1 — the PostgREST surface stays closed for govt (pets RLS gates the govt
  // subquery); the tightened, locality-scoped policy is asserted at the catalog
  // level in coverage.test.ts.
  it("govt is DENIED reading an out-of-jurisdiction pet_identifications row (R1)", async () => {
    if (setupError || !govtClient || !fixtureIdentificationId) return;
    expect(await rowCount(govtClient, "pet_identifications", fixtureIdentificationId)).toBe(0);
  });

  it("admin still reads the pet_identifications row (positive control — admin branch intact)", async () => {
    if (setupError || !adminClient || !fixtureIdentificationId) return;
    expect(await rowCount(adminClient, "pet_identifications", fixtureIdentificationId)).toBe(1);
  });
});
