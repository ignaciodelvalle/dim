// Tests for PPP CABA export (Chunk F, F2).
//
// Unit tests: generatePppCabaPdf (smoke — renders without throwing), CABA_PROVINCE constant.
// Integration tests: generatePppExportAction against local DB (Storage mocked).

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dniLast4, hashDni } from "@/lib/dni-hash";

import { generatePppExportAction } from "@/app/actions/ppp-export-caba";
import { auditLog, db, ownerships, pets, profiles } from "@/db";
import * as authGuards from "@/lib/auth-guards";
import { CABA_PROVINCE, generatePppCabaPdf } from "@/lib/ppp-exports";
import * as supabaseServer from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({
  requireUserOrRedirect: vi.fn(),
  requireAdminOrGovtOrRedirect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Unit tests — CABA_PROVINCE and generatePppCabaPdf
// ---------------------------------------------------------------------------

describe("CABA_PROVINCE", () => {
  it("is a non-empty string matching the canonical CABA name", () => {
    expect(CABA_PROVINCE).toBe("CABA");
  });
});

describe("generatePppCabaPdf — smoke render", () => {
  it("renders a PDF buffer without throwing", async () => {
    const dto = {
      petName: "TestDog",
      petPublicToken: "DIM-PPP-TEST",
      petSpecies: "dog",
      petBreed: "Pit Bull",
      petDateOfBirth: "2022-03-15",
      petMicrochipId: "999000000000010",
      petPotentiallyDangerousBreed: true,
      ownerDisplayName: "María López",
      ownerDniNumber: "30123456",
      ownerEmail: "maria@example.com",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
      exportGeneratedAt: new Date().toLocaleString("es-AR"),
    };

    const bytes = await generatePppCabaPdf(dto);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000); // a real PDF is always > 1 KB
  });

  it("renders without DNI (null → fallback text)", async () => {
    const dto = {
      petName: "NoDni",
      petPublicToken: "DIM-PPP-NODNI",
      petSpecies: "dog",
      petBreed: null,
      petDateOfBirth: null,
      petMicrochipId: null,
      petPotentiallyDangerousBreed: true,
      ownerDisplayName: "Carlos García",
      ownerDniNumber: null,
      ownerEmail: "carlos@example.com",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: null,
      exportGeneratedAt: new Date().toLocaleString("es-AR"),
    };

    const bytes = await generatePppCabaPdf(dto);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — generatePppExportAction (Storage mocked, DB real)
// ---------------------------------------------------------------------------

const PPP_PET_TOKEN_CABA = "DIM-PPP-CABA01";
const PPP_PET_TOKEN_PROV = "DIM-PPP-PROV01";
const MOCK_OWNER_ID = "eeeeeeee-0000-0000-0000-000000000005";
const MOCK_SIGNED_URL = "https://storage.example.com/ppp-exports/test.pdf?token=mock";

let petIdCaba: string;
let petIdProv: string;

const mockCreateClient = vi.mocked(supabaseServer.createClient);
const mockRequireUserOrRedirect = vi.mocked(authGuards.requireUserOrRedirect);

function buildSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: MOCK_OWNER_ID, email: "ppp-owner@dim-test.local" } },
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: "ppp-exports/test.pdf" },
          error: null,
        }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: MOCK_SIGNED_URL },
          error: null,
        }),
      }),
    },
  };
}

async function purgeFixtures() {
  // Note: audit_log is append-only (DB trigger blocks DELETE) — do NOT attempt
  // to delete audit_log rows here. Tests scope queries by actorUserId + action.
  await withMutationOverride(async (tx) => {
    for (const token of [PPP_PET_TOKEN_CABA, PPP_PET_TOKEN_PROV]) {
      await tx.execute(
        sql`DELETE FROM ownerships WHERE pet_id IN (
          SELECT id FROM pets WHERE public_token = ${token}
        )`,
      );
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${token}`);
    }
  });
}

beforeAll(async () => {
  await purgeFixtures();

  await db
    .insert(profiles)
    .values({
      id: MOCK_OWNER_ID,
      displayName: "PPP Owner Test",
      role: "owner",
      accountType: "personal",
      // Wave 5 Item 25a: hash + last4 only, no plaintext.
      dniHash: hashDni("31234567"),
      dniLast4: dniLast4("31234567"),
    })
    .onConflictDoNothing({ target: profiles.id });

  // CABA pet (PPP = true, CABA jurisdiction).
  const [petCaba] = await db
    .insert(pets)
    .values({
      publicToken: PPP_PET_TOKEN_CABA,
      name: "PitBullCABA",
      species: "dog",
      sex: "male",
      breed: "Pit Bull Terrier",
      potentiallyDangerousBreed: true,
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  petIdCaba = petCaba.id;

  await db.insert(ownerships).values({
    petId: petIdCaba,
    ownerUserId: MOCK_OWNER_ID,
    role: "owner",
    startedAt: new Date(),
  });

  // Prov BA pet (PPP = true, non-CABA jurisdiction).
  const [petProv] = await db
    .insert(pets)
    .values({
      publicToken: PPP_PET_TOKEN_PROV,
      name: "PitBullProv",
      species: "dog",
      sex: "female",
      breed: "Pit Bull Terrier",
      potentiallyDangerousBreed: true,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    })
    .returning();
  petIdProv = petProv.id;

  await db.insert(ownerships).values({
    petId: petIdProv,
    ownerUserId: MOCK_OWNER_ID,
    role: "owner",
    startedAt: new Date(),
  });
});

afterAll(async () => {
  await purgeFixtures();
});

describe("generatePppExportAction — CABA happy path", () => {
  it("returns signed URL and inserts audit_log for a CABA PPP pet", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireUserOrRedirect.mockResolvedValue({
      supabase: supabaseMock,
      user: { id: MOCK_OWNER_ID },
    } as any);

    const result = await generatePppExportAction(PPP_PET_TOKEN_CABA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signedUrl).toBe(MOCK_SIGNED_URL);

    // Audit log entry created.
    const [logRow] = await db
      .select({ payload: auditLog.payload, action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.actorUserId, MOCK_OWNER_ID))
      .orderBy(auditLog.performedAt)
      .limit(1);

    expect(logRow.action).toBe("ppp_export_generated");
    const payload = logRow.payload as Record<string, unknown>;
    expect(payload.petPublicToken).toBe(PPP_PET_TOKEN_CABA);
    expect(payload.targetJurisdiction).toBe("caba");
  });
});

describe("generatePppExportAction — Prov BA rejection", () => {
  it("returns ppp_prov_ba_not_implemented for a Prov BA pet", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireUserOrRedirect.mockResolvedValue({
      supabase: supabaseMock,
      user: { id: MOCK_OWNER_ID },
    } as any);

    const result = await generatePppExportAction(PPP_PET_TOKEN_PROV);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("ppp_prov_ba_not_implemented");
  });

  it("does NOT insert an audit_log row when rejected for Prov BA", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireUserOrRedirect.mockResolvedValue({
      supabase: supabaseMock,
      user: { id: MOCK_OWNER_ID },
    } as any);

    const [{ before }] = (await db.execute(
      sql`SELECT COUNT(*)::int as before FROM audit_log WHERE action = 'ppp_export_generated' AND payload->>'petPublicToken' = ${PPP_PET_TOKEN_PROV}`,
    )) as Array<{ before: number }>;

    await generatePppExportAction(PPP_PET_TOKEN_PROV);

    const [{ after }] = (await db.execute(
      sql`SELECT COUNT(*)::int as after FROM audit_log WHERE action = 'ppp_export_generated' AND payload->>'petPublicToken' = ${PPP_PET_TOKEN_PROV}`,
    )) as Array<{ after: number }>;

    expect(after).toBe(before); // no new row
  });
});

describe("generatePppExportAction — ownership guard", () => {
  it("returns not_found when the user does not own the pet", async () => {
    const DIFFERENT_USER = "ffffffff-0000-0000-0000-000000000006";
    await db
      .insert(profiles)
      .values({ id: DIFFERENT_USER, displayName: "Other User", role: "owner" })
      .onConflictDoNothing({ target: profiles.id });

    const supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: DIFFERENT_USER, email: "other@test.local" } },
        }),
      },
      storage: { from: vi.fn().mockReturnValue({ upload: vi.fn(), createSignedUrl: vi.fn() }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireUserOrRedirect.mockResolvedValue({
      supabase: supabaseMock,
      user: { id: DIFFERENT_USER },
    } as any);

    const result = await generatePppExportAction(PPP_PET_TOKEN_CABA);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_found");
  });
});
