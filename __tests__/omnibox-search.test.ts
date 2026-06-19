// Integration tests for the operator omnibox search (Wave 2 Item 10.1).
//
// Runs against the local Postgres stack (see __tests__/setup.ts). Verifies:
//   1. Jurisdiction scoping: a govt viewer scoped to CABA sees CABA pets/cases
//      but NOT Mendoza ones; admin sees both (universal scope).
//   2. govt-with-zero-assignments → empty, no leak.
//   3. Pet matching by name, DIM token, and active microchip code.
//   4. Case matching by public code, scoped.
//   5. searchOmniboxAction writes a single pii_queried audit row with the
//      actual result count and surface='omnibox' (PII-query logging).
//
// Person scoping is delegated to searchUsers (already covered by
// user-search-scope.test.ts), so here we focus on pets + cases + the action.

import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(),
}));

import { searchOmniboxAction } from "@/app/actions/omnibox-search";
import { auditLog, cases, db, petIdentifications, pets, profiles } from "@/db";
import type { AdminOrGovtSession } from "@/lib/auth-guards";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { searchOmnibox } from "@/lib/omnibox-search";
import { withMutationOverride } from "./_helpers/db-overrides";

// Unique markers so cleanup is surgical and parallel-safe.
const TAG = "OMNIBOXTEST";
const CABA_PET_TOKEN = "DIM-OMBX-CA01";
const MENDOZA_PET_TOKEN = "DIM-OMBX-MZ01";
// microchip_iso requires a 15-char code per the chip_requires_iso_fields check
// (ISO 11784/11785 = 15 digits).
const CHIP_CODE = "999000000111222";
const CABA_CASE_CODE = `CASO-${TAG}-CA`;
const MENDOZA_CASE_CODE = `CASO-${TAG}-MZ`;

let cabaPetId: string;
let mendozaPetId: string;
let cabaCaseId: string;
let mendozaCaseId: string;
let govtUserId: string;

const GOVT_CABA = {
  role: "govt" as const,
  jurisdictions: [{ province: "CABA", locality: "Buenos Aires" }],
};
const ADMIN = { role: "admin" as const };

// Build a fully-typed govt session stub for the action (no `as any` needed).
// The supabase client is never touched by searchOmniboxAction.
function govtSession(userId: string): AdminOrGovtSession {
  return {
    supabase: {} as AdminOrGovtSession["supabase"],
    user: { id: userId },
    profile: { id: userId, role: "govt" },
    jurisdictions: GOVT_CABA.jurisdictions,
  };
}

async function cleanup() {
  await withMutationOverride(async (tx) => {
    for (const token of [CABA_PET_TOKEN, MENDOZA_PET_TOKEN]) {
      await tx.execute(sql`DELETE FROM pet_identifications WHERE pet_id IN (
        SELECT id FROM pets WHERE public_token = ${token}
      )`);
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
        SELECT id FROM pets WHERE public_token = ${token}
      )`);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${token}`);
    }
    await tx.execute(sql`DELETE FROM cases WHERE public_code LIKE ${`%${TAG}%`}`);
    // audit_log is append-only (DELETE is trigger-blocked). We never delete the
    // pii_queried rows; the FK is ON DELETE SET NULL, so deleting the stub
    // profile nulls the actor. Test queries scope by the fresh per-run actor id
    // + a `since` timestamp, so leftover rows from prior runs never interfere.
    if (govtUserId) await tx.execute(sql`DELETE FROM profiles WHERE id = ${govtUserId}`);
  });
}

beforeAll(async () => {
  // Govt user (stub profile — no auth.users row needed for action testing).
  govtUserId = randomUUID();

  await cleanup();

  await db.insert(profiles).values({
    id: govtUserId,
    displayName: `Oficial ${TAG}`,
    role: "govt",
    accountType: "institutional",
  });

  const [cabaPet] = await db
    .insert(pets)
    .values({
      publicToken: CABA_PET_TOKEN,
      name: `Firulais ${TAG}`,
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Buenos Aires",
    })
    .returning();
  cabaPetId = cabaPet.id;

  const [mendozaPet] = await db
    .insert(pets)
    .values({
      publicToken: MENDOZA_PET_TOKEN,
      name: `Firulais ${TAG}`,
      species: "cat",
      sex: "female",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "Mendoza",
      jurisdictionLocality: "Mendoza",
    })
    .returning();
  mendozaPetId = mendozaPet.id;

  // Active microchip on the CABA pet — exercises the chip-match path.
  await db.insert(petIdentifications).values({
    petId: cabaPetId,
    kind: "microchip_iso",
    status: "active",
    code: CHIP_CODE,
    recordedAt: "2026-01-01",
  });

  const [cabaCase] = await db
    .insert(cases)
    .values({
      publicCode: CABA_CASE_CODE,
      caseKind: "bite_incident",
      status: "open",
      primarySubjectKind: "general",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Buenos Aires",
    })
    .returning();
  cabaCaseId = cabaCase.id;

  const [mendozaCase] = await db
    .insert(cases)
    .values({
      publicCode: MENDOZA_CASE_CODE,
      caseKind: "bite_incident",
      status: "open",
      primarySubjectKind: "general",
      jurisdictionProvince: "Mendoza",
      jurisdictionLocality: "Mendoza",
    })
    .returning();
  mendozaCaseId = mendozaCase.id;
});

afterAll(cleanup);

describe("searchOmnibox — pet scoping", () => {
  it("govt scoped to CABA finds the CABA pet but NOT the Mendoza pet (same name)", async () => {
    const r = await searchOmnibox(`Firulais ${TAG}`, GOVT_CABA);
    const tokens = r.pets.map((p) => p.publicToken);
    expect(tokens).toContain(CABA_PET_TOKEN);
    expect(tokens).not.toContain(MENDOZA_PET_TOKEN);
  });

  it("admin (universal) finds both pets", async () => {
    const r = await searchOmnibox(`Firulais ${TAG}`, ADMIN);
    const tokens = r.pets.map((p) => p.publicToken);
    expect(tokens).toContain(CABA_PET_TOKEN);
    expect(tokens).toContain(MENDOZA_PET_TOKEN);
  });

  it("matches an exact DIM token", async () => {
    const r = await searchOmnibox(CABA_PET_TOKEN, GOVT_CABA);
    expect(r.pets.map((p) => p.id)).toContain(cabaPetId);
  });

  it("matches an active microchip code", async () => {
    const r = await searchOmnibox(CHIP_CODE, GOVT_CABA);
    expect(r.pets.map((p) => p.id)).toContain(cabaPetId);
  });

  it("govt with zero assignments returns empty without a DB hit", async () => {
    const r = await searchOmnibox(`Firulais ${TAG}`, { role: "govt", jurisdictions: [] });
    expect(r.total).toBe(0);
  });
});

describe("searchOmnibox — case scoping", () => {
  it("govt scoped to CABA finds the CABA case but NOT the Mendoza case", async () => {
    const r = await searchOmnibox(`CASO-${TAG}`, GOVT_CABA);
    const ids = r.cases.map((c) => c.id);
    expect(ids).toContain(cabaCaseId);
    expect(ids).not.toContain(mendozaCaseId);
  });

  it("admin finds both cases", async () => {
    const r = await searchOmnibox(`CASO-${TAG}`, ADMIN);
    const ids = r.cases.map((c) => c.id);
    expect(ids).toContain(cabaCaseId);
    expect(ids).toContain(mendozaCaseId);
  });
});

describe("searchOmniboxAction — PII-query logging", () => {
  it("writes a single pii_queried audit row with surface=omnibox and the result count", async () => {
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValue(govtSession(govtUserId));

    const since = new Date();
    const results = await searchOmniboxAction(`Firulais ${TAG}`);
    expect(results.pets.map((p) => p.publicToken)).toContain(CABA_PET_TOKEN);

    // The action logs fire-and-forget; give the insert a tick to land.
    await new Promise((res) => setTimeout(res, 100));

    const rows = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, govtUserId),
          eq(auditLog.action, "pii_queried"),
          gte(auditLog.performedAt, since),
        ),
      );

    expect(rows.length).toBe(1);
    const payload = rows[0].payload as { surface?: string; result_count?: number; query?: string };
    expect(payload.surface).toBe("omnibox");
    expect(payload.query).toBe(`Firulais ${TAG}`);
    expect(payload.result_count).toBe(results.total);
  });

  it("does not log or query for a query shorter than 2 chars", async () => {
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValue(govtSession(govtUserId));

    const since = new Date();
    const results = await searchOmniboxAction("a");
    expect(results.total).toBe(0);

    await new Promise((res) => setTimeout(res, 50));
    const rows = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, govtUserId),
          eq(auditLog.action, "pii_queried"),
          gte(auditLog.performedAt, since),
        ),
      );
    expect(rows.length).toBe(0);
  });
});
