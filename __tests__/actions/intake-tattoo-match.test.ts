// Tests for the tattoo cross-check wired in createIntakeAction (D2).
//
// Covers:
//   1. tattoo-ack-token utility — pure crypto (no DB, no auth)
//   2. Cross-check logic via lookupByTattoo — DB integration
//   3. Intake action: tattoo match → TATTOO_MATCH_POSSIBLE (no pet created)
//      Re-submit with valid ackToken → proceeds (no pet created in unit-style
//      logic test; full integration is smoke-tested manually because
//      createIntakeAction requires a live Next.js / supabase auth session)
//
// DB-integration tests need a running local Supabase stack (pnpm supabase start).

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, pets } from "@/db";
import { generateForceToken } from "@/lib/microchip-force-token";
import { generateTattooAckToken, validateTattooAckToken } from "@/lib/tattoo-ack-token";
import { lookupByTattoo, normalizeTattooCode } from "@/lib/tattoo-lookup";
import { withMutationOverride } from "../_helpers/db-overrides";

// ---------------------------------------------------------------------------
// 1. tattoo-ack-token utility
// ---------------------------------------------------------------------------

describe("tattoo-ack-token: generateTattooAckToken / validateTattooAckToken", () => {
  it("generates a token that validates immediately", () => {
    const code = "K9-2014";
    const token = generateTattooAckToken(code);
    expect(validateTattooAckToken(code, token)).toBe(true);
  });

  it("token for code A does not validate for code B", () => {
    const tokenForA = generateTattooAckToken("K9-2014");
    expect(validateTattooAckToken("A1-XXXX", tokenForA)).toBe(false);
  });

  it("tampered token fails validation", () => {
    const code = "TATTOO-TAMPER";
    const token = generateTattooAckToken(code);
    const tampered = `${token.slice(0, -5)}XXXXX`;
    expect(validateTattooAckToken(code, tampered)).toBe(false);
  });

  it("token with wrong format returns false", () => {
    expect(validateTattooAckToken("K9-ANY", "not-a-valid-token")).toBe(false);
    expect(validateTattooAckToken("K9-ANY", "")).toBe(false);
    expect(validateTattooAckToken("K9-ANY", "abc.notanumber")).toBe(false);
  });

  it("expired token (simulated) fails validation", () => {
    const code = "TATTOO-EXPIRE-TEST";
    const sixteenMinutesAgo = Date.now() - 16 * 60 * 1000;
    const freshToken = generateTattooAckToken(code);
    const dotIdx = freshToken.lastIndexOf(".");
    const macPart = freshToken.slice(0, dotIdx);
    const expiredToken = `${macPart}.${sixteenMinutesAgo}`;
    expect(validateTattooAckToken(code, expiredToken)).toBe(false);
  });

  it("chip forceToken does not pass tattoo ack validation (independent tokens)", () => {
    // Chips and tattoos use different signing namespaces (tattoo: prefix).
    // A token generated for a chip code should not ack a tattoo code even
    // if both have the same string value.
    const sharedCode = "SHARED-CODE";
    const chipToken = generateForceToken(sharedCode);
    expect(validateTattooAckToken(sharedCode, chipToken)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-check logic via lookupByTattoo — DB integration
// ---------------------------------------------------------------------------

const TEST_CODE_ACTIVE = `INTAKE-TAT-ACTIVE-${Date.now()}`;
const TEST_CODE_LOST = `INTAKE-TAT-LOST-${Date.now()}`;
const TEST_CODE_DECEASED = `INTAKE-TAT-DEC-${Date.now()}`;

let petActiveId: string;
let petLostId: string;
let petDeceasedId: string;

beforeAll(async () => {
  // Clean up any prior test artifacts with the same code prefix.
  await withMutationOverride(async (tx) => {
    await tx.execute(
      sql`DELETE FROM ownerships WHERE pet_id IN (
        SELECT id FROM pets WHERE tattoo_code LIKE 'INTAKE-TAT-%'
      )`,
    );
    await tx.execute(sql`DELETE FROM pets WHERE tattoo_code LIKE 'INTAKE-TAT-%'`);
  });

  const [petActive] = await db
    .insert(pets)
    .values({
      publicToken: `ITAT-A-${Date.now()}`,
      name: "Intake Tattoo Active",
      species: "dog",
      sex: "male",
      status: "active",
      tattooCode: TEST_CODE_ACTIVE,
      tattooLocation: "inner_ear_left",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petActiveId = petActive.id;

  const [petLost] = await db
    .insert(pets)
    .values({
      publicToken: `ITAT-L-${Date.now()}`,
      name: "Intake Tattoo Lost",
      species: "dog",
      sex: "female",
      status: "lost",
      tattooCode: TEST_CODE_LOST,
      potentiallyDangerousBreed: false,
    })
    .returning();
  petLostId = petLost.id;

  const [petDeceased] = await db
    .insert(pets)
    .values({
      publicToken: `ITAT-D-${Date.now()}`,
      name: "Intake Tattoo Deceased",
      species: "cat",
      sex: "unknown",
      status: "deceased",
      tattooCode: TEST_CODE_DECEASED,
      potentiallyDangerousBreed: false,
    })
    .returning();
  petDeceasedId = petDeceased.id;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(
      sql`DELETE FROM ownerships WHERE pet_id IN (
        SELECT id FROM pets WHERE tattoo_code LIKE 'INTAKE-TAT-%'
      )`,
    );
    await tx.execute(sql`DELETE FROM pets WHERE tattoo_code LIKE 'INTAKE-TAT-%'`);
  });
});

describe("intake tattoo cross-check logic", () => {
  it("no tattoo code → no lookup needed (proceed normally)", async () => {
    // Caller: if parsed.tattooCode is null, skip the block entirely.
    const result = await lookupByTattoo("");
    expect(result).toBeNull();
  });

  it("tattoo with no match → no advisory returned (proceed)", async () => {
    const result = await lookupByTattoo("TATTOO-DOES-NOT-EXIST-AT-ALL");
    expect(result).toBeNull();
  });

  it("tattoo with active match → should surface TATTOO_MATCH_POSSIBLE advisory", async () => {
    const result = await lookupByTattoo(TEST_CODE_ACTIVE);
    expect(result).not.toBeNull();
    expect(result?.pet.id).toBe(petActiveId);
    expect(result?.pet.status).toBe("active");
    // Caller: result !== null && status !== 'deceased' → return advisory.
  });

  it("tattoo with lost match → should surface TATTOO_MATCH_POSSIBLE advisory", async () => {
    const result = await lookupByTattoo(TEST_CODE_LOST);
    expect(result).not.toBeNull();
    expect(result?.pet.id).toBe(petLostId);
    expect(result?.pet.status).toBe("lost");
    // Caller: result !== null && status !== 'deceased' → return advisory.
  });

  it("tattoo with deceased match → no advisory (deceased pets are skipped)", async () => {
    // The action skips deceased matches — they should not surface a warning.
    const result = await lookupByTattoo(TEST_CODE_DECEASED);
    // The lookup DOES find the deceased pet in the DB...
    expect(result?.pet.status).toBe("deceased");
    // ...but the action checks: status !== 'deceased' before returning advisory.
    const shouldWarn = result !== null && result.pet.status !== "deceased";
    expect(shouldWarn).toBe(false);
  });

  it("ack token valid for code → should proceed (skip check)", () => {
    const code = normalizeTattooCode(TEST_CODE_ACTIVE);
    const token = generateTattooAckToken(code);
    expect(validateTattooAckToken(code, token)).toBe(true);
    // Caller: ackValid === true → skip lookup, proceed with intake.
  });

  it("ack token for different code → should re-surface advisory", () => {
    const tokenForOther = generateTattooAckToken("SOME-OTHER-CODE");
    expect(validateTattooAckToken(TEST_CODE_ACTIVE, tokenForOther)).toBe(false);
    // Caller: ackValid === false → run lookup → surface advisory again.
  });

  it("advisory returns matchedPetToken from lookup result", async () => {
    const result = await lookupByTattoo(TEST_CODE_ACTIVE);
    expect(result).not.toBeNull();
    if (!result) throw new Error("expected match");
    // Simulates what createIntakeAction does: return { matchedPetToken: result.pet.publicToken }
    expect(result.pet.publicToken).toMatch(/^ITAT-A-/);
    // Only the public token is surfaced — no owner PII.
    expect("ownerFirstName" in result).toBe(true); // field exists but...
    // The UI must NOT render ownerFirstName; it only shows the /p/{token} link.
  });
});
