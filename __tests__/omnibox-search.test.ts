// Integration tests for the operator omnibox search (Wave 2 Item 10.1 / UX 1.1).
//
// Runs against the local Postgres stack (see __tests__/setup.ts). Verifies:
//
//   org scope (UX 1.1):
//     1. A held pet (active shelter_custody) is returned with the correct href.
//     2. A pet NOT held by the org is not returned.
//     3. A pet whose custody has ended is NOT returned.
//     4. A multi-custody pet appears exactly once per org query.
//
//   admin scope (UX 1.1 — pet results dropped):
//     5. searchOmnibox returns pets: [] for admin; persons + cases unaffected.
//
//   govt scope:
//     6. Jurisdiction scoping for cases still works (CABA vs Mendoza).
//     7. govt-with-zero-assignments → empty, no leak.
//
//   PII logging:
//     8. searchOmniboxAction writes a single pii_queried audit row.
//     9. Short queries (<2 chars) are not logged and return empty.

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(),
  requireOrgAccessByToken: vi.fn(),
}));

import { searchOmniboxAction } from "@/app/actions/omnibox-search";
import {
  auditLog,
  cases,
  db,
  organizations,
  ownerships,
  pets,
  profiles,
  welfareReports,
} from "@/db";
import type { AdminOrGovtSession } from "@/lib/infra/auth-guards";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { searchOmnibox } from "@/lib/infra/omnibox-search";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Shared static fixtures (admin/govt + PII logging tests)
// ---------------------------------------------------------------------------

const TAG = "OMNIBOXTEST";
const CABA_CASE_CODE = `CASO-${TAG}-CA`;
const MENDOZA_CASE_CODE = `CASO-${TAG}-MZ`;
// Welfare denuncia tracking code (DEN-, not CAS-) tagged to a CABA barrio.
const PALERMO_DEN_CODE = `DEN-${TAG}-PA`;

let cabaCaseId: string;
let mendozaCaseId: string;
let palermoDenunciaId: string;
let govtUserId: string;

const GOVT_CABA = {
  role: "govt" as const,
  jurisdictions: [{ province: "CABA", locality: "Buenos Aires" }],
};
// Whole-province (whole-CABA) operator: locality IS the INDEC single-entry that
// subsumes every barrio. Distinct from GOVT_CABA (an exact-pair locality).
const GOVT_WHOLE_CABA = {
  role: "govt" as const,
  jurisdictions: [{ province: "CABA", locality: "Ciudad Autónoma de Buenos Aires" }],
};
const GOVT_MENDOZA = {
  role: "govt" as const,
  jurisdictions: [{ province: "Mendoza", locality: "Mendoza" }],
};
const ADMIN_SCOPE = { role: "admin" as const };

function govtSession(userId: string): AdminOrGovtSession {
  return {
    supabase: {} as AdminOrGovtSession["supabase"],
    user: { id: userId },
    profile: { id: userId, role: "govt" },
    jurisdictions: GOVT_CABA.jurisdictions,
  };
}

async function cleanupStaticFixtures() {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM welfare_reports WHERE reference_code LIKE ${`%${TAG}%`}`);
    await tx.execute(sql`DELETE FROM cases WHERE public_code LIKE ${`%${TAG}%`}`);
    if (govtUserId) await tx.execute(sql`DELETE FROM profiles WHERE id = ${govtUserId}`);
  });
}

beforeAll(async () => {
  govtUserId = randomUUID();
  await cleanupStaticFixtures();

  await db.insert(profiles).values({
    id: govtUserId,
    displayName: `Oficial ${TAG}`,
    role: "govt",
    accountType: "institutional",
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

  // Welfare denuncia with a DEN- tracking code, tagged to a CABA barrio
  // (Palermo). Its code lives in welfare_reports.reference_code — NOT
  // cases.public_code — so the omnibox must resolve it via the welfare table.
  const [palermoDenuncia] = await db
    .insert(welfareReports)
    .values({
      referenceCode: PALERMO_DEN_CODE,
      kind: "neglect",
      severity: "medium",
      description: `Denuncia de prueba ${TAG}`,
      subjectKind: "general",
      status: "open",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  palermoDenunciaId = palermoDenuncia.id;
});

afterAll(cleanupStaticFixtures);

// ---------------------------------------------------------------------------
// Dynamic fixtures for org scope tests (per-test ephemeral)
// ---------------------------------------------------------------------------

const ephemeralOrgIds: string[] = [];
const ephemeralPetIds: string[] = [];

const RUN_ID = Math.random().toString(36).slice(2, 8).toUpperCase();
let counter = 0;
function nextToken(prefix = "OMB"): string {
  counter += 1;
  return `${prefix}-${RUN_ID}-${String(counter).padStart(3, "0")}`;
}

async function makeOrg(): Promise<{ id: string; publicToken: string }> {
  const token = nextToken("ORG");
  const [row] = await db
    .insert(organizations)
    .values({
      publicToken: token,
      legalName: "Omnibox Test Org",
      displayName: "Omnibox Test Org",
      orgType: "shelter",
      email: `omnibox-${counter}@dim-test.local`,
    })
    .returning({ id: organizations.id });
  ephemeralOrgIds.push(row.id);
  return { id: row.id, publicToken: token };
}

async function makePet(nameSuffix: string): Promise<{ id: string; publicToken: string }> {
  const token = nextToken("DIM");
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `OmbPet ${nameSuffix} ${RUN_ID}`,
      species: "dog",
      sex: "unknown",
    })
    .returning({ id: pets.id });
  ephemeralPetIds.push(row.id);
  return { id: row.id, publicToken: token };
}

async function makeCustody(
  petId: string,
  orgId: string,
  opts: { endedAt?: Date } = {},
): Promise<void> {
  await db.insert(ownerships).values({
    petId,
    ownerOrganizationId: orgId,
    role: "shelter_custody",
    startedAt: new Date(),
    endedAt: opts.endedAt ?? undefined,
  });
}

afterEach(async () => {
  if (ephemeralPetIds.length > 0) {
    await withMutationOverride(async (tx) => {
      await tx.execute(
        sql`DELETE FROM pet_events WHERE pet_id = ANY(${sql.raw(`ARRAY[${ephemeralPetIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
      );
    });
    await db.delete(ownerships).where(inArray(ownerships.petId, ephemeralPetIds));
    await db.delete(pets).where(inArray(pets.id, ephemeralPetIds));
    ephemeralPetIds.length = 0;
  }
  if (ephemeralOrgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, ephemeralOrgIds));
    ephemeralOrgIds.length = 0;
  }
});

// ---------------------------------------------------------------------------
// org scope
// ---------------------------------------------------------------------------

describe("searchOmnibox — org scope", () => {
  it("returns a held pet with the correct org-portal href", async () => {
    const org = await makeOrg();
    const pet = await makePet("Luna");
    await makeCustody(pet.id, org.id);

    const results = await searchOmnibox(`OmbPet Luna ${RUN_ID}`, {
      role: "org",
      organizationId: org.id,
      orgToken: org.publicToken,
    });

    expect(results.persons).toHaveLength(0);
    expect(results.cases).toHaveLength(0);
    expect(results.pets.length).toBeGreaterThanOrEqual(1);
    const found = results.pets.find((p) => p.publicToken === pet.publicToken);
    expect(found).toBeDefined();
    expect(found?.href).toBe(`/org/${org.publicToken}/mascotas/${pet.publicToken}`);
    expect(results.total).toBe(results.pets.length);
  });

  it("does not return a pet not held by the org", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const pet = await makePet("Luna");
    await makeCustody(pet.id, orgB.id);

    const results = await searchOmnibox(`OmbPet Luna ${RUN_ID}`, {
      role: "org",
      organizationId: orgA.id,
      orgToken: orgA.publicToken,
    });

    const found = results.pets.find((p) => p.publicToken === pet.publicToken);
    expect(found).toBeUndefined();
  });

  it("does not return a pet whose custody has ended", async () => {
    const org = await makeOrg();
    const pet = await makePet("Luna");
    await makeCustody(pet.id, org.id, { endedAt: new Date(Date.now() - 1000) });

    const results = await searchOmnibox(`OmbPet Luna ${RUN_ID}`, {
      role: "org",
      organizationId: org.id,
      orgToken: org.publicToken,
    });

    const found = results.pets.find((p) => p.publicToken === pet.publicToken);
    expect(found).toBeUndefined();
  });

  it("returns a multi-custody pet exactly once per org query", async () => {
    // Two different orgs both hold the same pet (allowed by schema since they
    // are different organizations). Each org query must see it exactly once.
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const pet = await makePet("Luna");
    await makeCustody(pet.id, orgA.id);
    await makeCustody(pet.id, orgB.id);

    const resultsA = await searchOmnibox(`OmbPet Luna ${RUN_ID}`, {
      role: "org",
      organizationId: orgA.id,
      orgToken: orgA.publicToken,
    });

    const matchesA = resultsA.pets.filter((p) => p.publicToken === pet.publicToken);
    expect(matchesA).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// admin scope — pet results must be empty (UX 1.1)
// ---------------------------------------------------------------------------

describe("searchOmnibox — admin scope drops pet results", () => {
  it("returns pets: [] even when a matching pet exists in custody", async () => {
    const org = await makeOrg();
    const pet = await makePet("Luna");
    await makeCustody(pet.id, org.id);

    const results = await searchOmnibox(`OmbPet Luna ${RUN_ID}`, ADMIN_SCOPE);

    expect(results.pets).toHaveLength(0);
    // total is persons + cases only
    expect(results.total).toBe(results.persons.length + results.cases.length);
  });
});

// ---------------------------------------------------------------------------
// govt scope — case scoping still works
// ---------------------------------------------------------------------------

describe("searchOmnibox — case scoping (govt)", () => {
  it("govt scoped to CABA finds the CABA case but NOT the Mendoza case", async () => {
    const r = await searchOmnibox(`CASO-${TAG}`, GOVT_CABA);
    const ids = r.cases.map((c) => c.id);
    expect(ids).toContain(cabaCaseId);
    expect(ids).not.toContain(mendozaCaseId);
  });

  it("admin finds both cases", async () => {
    const r = await searchOmnibox(`CASO-${TAG}`, ADMIN_SCOPE);
    const ids = r.cases.map((c) => c.id);
    expect(ids).toContain(cabaCaseId);
    expect(ids).toContain(mendozaCaseId);
  });

  it("an admin case result links INTO the /admin operator shell, not the public citizen route", async () => {
    // Shell-loss fix (task #47 class), admin half. This test used to assert the
    // bug: it pinned the admin href to the public /casos/[publicCode], calling
    // it "canonical". QA ronda 5 (2026-07-16) showed what that meant in
    // practice — a national operator opening a denuncia lost the rail/topbar,
    // got the citizen nav ("Adoptar · Refugios · ← Volver a mi app"), and had
    // no way back into their work. Admin now has an in-shell detail route, same
    // as govt.
    const r = await searchOmnibox(`CASO-${TAG}`, ADMIN_SCOPE);
    const cabaResult = r.cases.find((c) => c.id === cabaCaseId);
    expect(cabaResult?.href).toBe(`/admin/casos/${CABA_CASE_CODE}`);
  });

  it("no operator case result ever points at the public citizen case route", async () => {
    // Fence: the public /casos/[publicCode] renders under the citizen layout.
    // Neither operator role may be routed there from the omnibox, whatever the
    // scope. Guards both halves of the shell-loss class at once.
    for (const scope of [ADMIN_SCOPE, GOVT_CABA]) {
      const r = await searchOmnibox(`CASO-${TAG}`, scope);
      // Without this the loop below is vacuous: an empty result set would let
      // the fence pass while asserting nothing at all.
      expect(r.cases.length).toBeGreaterThan(0);
      for (const c of r.cases) {
        expect(c.href).not.toMatch(/^\/casos\//);
      }
    }
  });

  it("a govt case result links INTO the /gob operator shell, not the public citizen route", async () => {
    // Shell-loss fix (task #47 class): a govt operator navigating from the
    // omnibox must land on /gob/casos/[publicCode] — which keeps the operator
    // rail/topbar and re-gates via canReadCase — not the public /casos route
    // that renders under the citizen layout and strips the operator chrome.
    const r = await searchOmnibox(`CASO-${TAG}`, GOVT_CABA);
    const cabaResult = r.cases.find((c) => c.id === cabaCaseId);
    expect(cabaResult?.href).toBe(`/gob/casos/${CABA_CASE_CODE}`);
  });

  it("govt with zero assignments returns empty", async () => {
    const r = await searchOmnibox(`CASO-${TAG}`, { role: "govt", jurisdictions: [] });
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// welfare denuncia resolution by DEN- code (QA 2026-07-08)
//
// DEN-XXXX-XXXX codes live in welfare_reports.reference_code, NOT
// cases.public_code. An operator pasting a DEN- code must resolve the denuncia.
// ---------------------------------------------------------------------------

describe("searchOmnibox — welfare denuncia by DEN- code", () => {
  it("admin (universal) resolves a DEN- code to the denuncia with the maltrato href", async () => {
    const r = await searchOmnibox(PALERMO_DEN_CODE, ADMIN_SCOPE);
    const found = r.cases.find((c) => c.id === palermoDenunciaId);
    expect(found).toBeDefined();
    expect(found?.publicCode).toBe(PALERMO_DEN_CODE);
    expect(found?.caseKind).toBe("welfare_denuncia");
    expect(found?.href).toBe(`/gob/maltrato/${palermoDenunciaId}`);
  });

  it("whole-CABA govt resolves a Palermo-tagged DEN- denuncia (subsumption)", async () => {
    const r = await searchOmnibox(PALERMO_DEN_CODE, GOVT_WHOLE_CABA);
    const ids = r.cases.map((c) => c.id);
    expect(ids).toContain(palermoDenunciaId);
  });

  it("an out-of-scope govt (Mendoza) does NOT resolve a CABA DEN- denuncia", async () => {
    const r = await searchOmnibox(PALERMO_DEN_CODE, GOVT_MENDOZA);
    const ids = r.cases.map((c) => c.id);
    expect(ids).not.toContain(palermoDenunciaId);
  });
});

// ---------------------------------------------------------------------------
// PII logging
// ---------------------------------------------------------------------------

describe("searchOmniboxAction — PII-query logging", () => {
  it("writes a single pii_queried audit row with surface=omnibox and the result count", async () => {
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValue(govtSession(govtUserId));

    const since = new Date();
    const results = await searchOmniboxAction(`CASO-${TAG}`);

    // Fire-and-forget; give the insert a tick to land.
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
    expect(payload.query).toBe(`CASO-${TAG}`);
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
