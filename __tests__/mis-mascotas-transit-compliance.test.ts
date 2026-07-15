// Regression test — credential-card vs list status parity for TRANSIT/FOSTER-
// role pets (pre-push review, task #9 follow-up, canon-C2 coherence gap).
//
// P5 note (owner-ia-redesign): /inicio folded away and its carousel cards now
// live on the /mis-mascotas index. This test is fetcher-level (it never
// imported the page), so it stays valid unchanged — it pins the invariant both
// the index and the profile rely on: fetchComplianceStatesForPets over a
// foster-inclusive pet set resolves the pet's REAL lnPetStatusFromCompliance
// status ("ok"), never the "registered" fallback. The historical /inicio
// narrative below is kept for context on why the union mattered there.
//
// Bug: app/(app)/inicio/page.tsx built `complianceByPet` only over the
// petIds returned by fetchPetHealthNudges (lib/infra/owner-nudges.ts),
// which filters `ownerships.role = 'owner'` — it never includes a
// transit/foster-role pet. The carousel's `carouselSource`, however, comes
// from fetchPetsForOwner (lib/analytics/owner-dashboard.ts), which has NO
// role filter. So a transit pet reached carouselStatusOf() with no
// complianceByPet entry and fell back to the raw "registered" placeholder —
// even when the pet's REAL compliance was fully "ok" (al día). Meanwhile
// /mis-mascotas (app/(app)/mis-mascotas/page.tsx, statusForPet) computes
// compliance via fetchComplianceStatesForPets over EVERY active pet
// (no role filter), so the SAME pet read "AL DÍA" there — a direct status
// contradiction between the two surfaces for one pet.
//
// Fix: inicio/page.tsx now fetches compliance over the UNION of the
// health-nudge petIds and the full (non-deceased) fetchPetsForOwner petIds,
// so a transit pet gets a real complianceByPet entry exactly like
// /mis-mascotas already computes.
//
// This test seeds a real transit-role (foster) pet in local Postgres, fully
// compliant (rabies/sterilization/microchip all vet-verified — species
// "cat" so the PPP obligation never applies), and asserts:
//   1. fetchPetHealthNudges (owner-nudges) excludes the pet — confirms the
//      root cause (owner-role filter).
//   2. fetchPetsForOwner (owner-dashboard) includes the pet — confirms the
//      carousel source has no role filter.
//   3. fetchComplianceStatesForPets, called over the UNION the fixed
//      /inicio now uses, resolves the pet's REAL status via
//      lnPetStatusFromCompliance to "ok" — the same computation
//      /mis-mascotas' statusForPet performs — proving the carousel and the
//      list now agree instead of the carousel silently reporting
//      "registered".

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets } from "@/db";
import { fetchComplianceStatesForPets, fetchPetsForOwner } from "@/lib/analytics/owner-dashboard";
import { fetchPetHealthNudges } from "@/lib/infra/owner-nudges";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const EMAIL = "inicio-carousel-transit@dim-test.local";
const PASS = "InicioCarouselTransit_2026!";
const TOKEN = "TRNS-TEST-0001";

const VET = { authorRole: "vet" as const, authorVerified: true, authorOrganizationId: null };

let userId: string;
let petId: string;

beforeAll(async () => {
  // Remove any stale fixture from a previous interrupted run.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === EMAIL);
  if (existing) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.publicToken, TOKEN));
    });
    await admin.auth.admin.deleteUser(existing.id);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  userId = data.user.id;

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: TOKEN,
      name: "Transit Compliance Test Cat",
      species: "cat", // cat is never PPP (lib/projections/pet-compliance.ts) — keeps
      // the fixture to exactly 3 obligations (rabies, sterilization, microchip).
      status: "active",
    })
    .returning({ id: pets.id });
  petId = pet.id;

  // Transit/foster ownership — the exact role fetchPetHealthNudges excludes
  // (lib/infra/owner-nudges.ts:291, `eq(ownerships.role, "owner")`) but
  // fetchPetsForOwner does NOT filter on.
  await db.insert(ownerships).values({ petId, ownerUserId: userId, role: "foster" });

  const occurredAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
  const nextDueAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days out → "upcoming"
  await db.insert(petEvents).values([
    {
      petId,
      eventType: "vaccination_administered",
      occurredAt,
      payload: { vaccine_name: "Antirrábica", next_due_at: nextDueAt.toISOString() },
      ...VET,
    },
    { petId, eventType: "microchip_implanted", occurredAt, payload: {}, ...VET },
    { petId, eventType: "sterilization_performed", occurredAt, payload: {}, ...VET },
  ]);
});

afterAll(async () => {
  if (petId) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("index cards — transit-pet compliance coverage (canon-C2 fix)", () => {
  it("fetchPetHealthNudges excludes the transit pet (owner-role filter — the root cause)", async () => {
    const nudges = await fetchPetHealthNudges(userId);
    expect(nudges.some((n) => n.petId === petId)).toBe(false);
  });

  it("fetchPetsForOwner includes the transit pet (carousel source has no role filter)", async () => {
    const { pets: ownerPets } = await fetchPetsForOwner(userId);
    expect(ownerPets.some((p) => p.id === petId)).toBe(true);
  });

  it("resolves the SAME real 'ok' status /mis-mascotas shows, not the 'registered' fallback", async () => {
    // Mirrors the fixed inicio/page.tsx: compliance fetched over the union of
    // health-nudge ids (empty here) and the full carousel pet id set — which,
    // after the fix, includes this transit pet.
    const healthPetIds: string[] = (await fetchPetHealthNudges(userId)).map((n) => n.petId);
    const carouselPetIds = (await fetchPetsForOwner(userId)).pets
      .filter((p) => p.status !== "deceased")
      .map((p) => p.id);
    const compliancePetIds = Array.from(new Set([...healthPetIds, ...carouselPetIds]));
    expect(compliancePetIds).toContain(petId);

    const complianceStates = await fetchComplianceStatesForPets(userId, compliancePetIds);
    const compliance = complianceStates.get(petId);
    expect(compliance).toBeDefined();
    expect(compliance?.summary.ok).toBe(compliance?.summary.total);

    const status = lnPetStatusFromCompliance(
      { status: "active", pregnancyStatus: null },
      compliance!,
    );
    // Before the fix this pet had NO complianceByPet entry at all, so
    // carouselStatusOf() fell back to "registered" — the exact string a
    // genuinely-pending pet also produces, which is what made the two
    // surfaces silently disagree instead of erroring loudly.
    expect(status).toBe("ok");
  });

  it("the pre-fix path (health-nudge ids only) would have produced NO compliance entry — proves the bug existed", async () => {
    const healthPetIds: string[] = (await fetchPetHealthNudges(userId)).map((n) => n.petId);
    expect(healthPetIds).not.toContain(petId);
    const preFixCompliance = await fetchComplianceStatesForPets(userId, healthPetIds);
    expect(preFixCompliance.has(petId)).toBe(false);
  });
});
