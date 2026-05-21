// Tests for Welfare MPF CABA export (Chunk F, F1).
//
// Unit tests: welfareReportToMpfDto mapper (pure, no DB).
// Integration tests: generateMpfExportAction + audit_log assertion (against local DB).
//
// Integration tests mock Supabase Storage upload and signed URL since the
// `welfare-exports` bucket is owner-created ops and not auto-provisioned in CI.
// The audit_log insert is real (hit the DB).

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { generateMpfExportAction } from "@/app/actions/welfare-export-mpf";
import type { WelfareReport } from "@/db";
import { auditLog, db, pets, profiles, welfareReports } from "@/db";
import * as authGuards from "@/lib/auth-guards";
import * as supabaseServer from "@/lib/supabase/server";
import { MPF_EXPORT_SCHEMA_VERSION, welfareReportToMpfDto } from "@/lib/welfare-exports";
import { withMutationOverride } from "./_helpers/db-overrides";

// Hoist vi.mock calls so they apply before any imports are resolved.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(),
  requireUserOrRedirect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Unit tests — welfareReportToMpfDto (pure function, no DB)
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<WelfareReport> = {}): WelfareReport {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    referenceCode: "DEN-TEST-0001",
    reporterUserId: null,
    reporterOrganizationId: null,
    reporterContactEmail: null,
    reporterContactPhone: null,
    kind: "neglect",
    severity: "high",
    description: "Test description for welfare MPF unit tests.",
    subjectKind: "unowned_animal",
    subjectPetId: null,
    subjectDescription: "Perro callejero sin collar",
    locationAddress: "Av. Corrientes 1234",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "CABA",
    locationLat: "-34.6037",
    locationLng: "-58.3816",
    occurredAt: new Date("2026-05-15T10:00:00Z"),
    createdAt: new Date("2026-05-21T08:00:00Z"),
    status: "open",
    triagedAt: null,
    triagedByUserId: null,
    closedAt: null,
    resolutionNotes: null,
    flaggedAt: null,
    flagReasons: [],
    moderationResolvedAt: null,
    moderationResolvedByUserId: null,
    caseId: null,
    assignedToUserId: null,
    ...overrides,
  } as WelfareReport;
}

describe("welfareReportToMpfDto — anonymous redaction", () => {
  it("marks anonymous when both reporterUserId and reporterOrganizationId are null", () => {
    const report = makeReport({ reporterUserId: null, reporterOrganizationId: null });
    const dto = welfareReportToMpfDto(report, {
      reporterDisplayName: null,
      exportedByDisplayName: "Agente DIM",
      subjectPet: null,
      attachments: [],
      exportGeneratedAt: new Date(),
    });
    expect(dto.reporterIsAnonymous).toBe(true);
    expect(dto.reporterDisplayName).toBeNull();
    expect(dto.reporterContactEmail).toBeNull();
    expect(dto.reporterContactPhone).toBeNull();
  });

  it("includes reporter info when reporterUserId is set", () => {
    const report = makeReport({
      reporterUserId: "bbbbbbbb-0000-0000-0000-000000000002",
      reporterContactEmail: "reporter@example.com",
    });
    const dto = welfareReportToMpfDto(report, {
      reporterDisplayName: "Juan Pérez",
      exportedByDisplayName: "Agente DIM",
      subjectPet: null,
      attachments: [],
      exportGeneratedAt: new Date(),
    });
    expect(dto.reporterIsAnonymous).toBe(false);
    expect(dto.reporterDisplayName).toBe("Juan Pérez");
    expect(dto.reporterContactEmail).toBe("reporter@example.com");
  });
});

describe("welfareReportToMpfDto — subject pet", () => {
  it("returns subjectPet=null when no pet linked", () => {
    const report = makeReport({ subjectPetId: null, subjectDescription: null });
    const dto = welfareReportToMpfDto(report, {
      reporterDisplayName: null,
      exportedByDisplayName: "Agente",
      subjectPet: null,
      attachments: [],
      exportGeneratedAt: new Date(),
    });
    expect(dto.subjectPet).toBeNull();
    expect(dto.subjectDescription).toBeNull();
  });

  it("includes subject pet name and microchip when subjectPet is provided", () => {
    const report = makeReport({
      subjectPetId: "cccccccc-0000-0000-0000-000000000003",
      subjectKind: "registered_pet",
    });
    const dto = welfareReportToMpfDto(report, {
      reporterDisplayName: null,
      exportedByDisplayName: "Agente",
      subjectPet: { name: "Rex", microchipId: "999000000000099" },
      attachments: [],
      exportGeneratedAt: new Date(),
    });
    expect(dto.subjectPet?.name).toBe("Rex");
    expect(dto.subjectPet?.microchipId).toBe("999000000000099");
  });
});

describe("welfareReportToMpfDto — occurredAt", () => {
  it("returns 'no especificada' text when occurredAt is null", () => {
    const report = makeReport({ occurredAt: null });
    const dto = welfareReportToMpfDto(report, {
      reporterDisplayName: null,
      exportedByDisplayName: "Agente",
      subjectPet: null,
      attachments: [],
      exportGeneratedAt: new Date(),
    });
    expect(dto.occurredAtLabel).toContain("no especificada");
  });
});

describe("MPF_EXPORT_SCHEMA_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof MPF_EXPORT_SCHEMA_VERSION).toBe("string");
    expect(MPF_EXPORT_SCHEMA_VERSION.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — generateMpfExportAction (with Storage mocked)
// ---------------------------------------------------------------------------
//
// Mocking strategy: mock the Supabase client's storage methods so tests don't
// require a live `welfare-exports` bucket. The DB insert (audit_log) is real.
// Full Storage integration is marked TODO(E6-followup) per govt-exports.test.ts convention.

const WELFARE_REPORT_REF = "DEN-MPF-TEST01";
const WELFARE_PET_TOKEN = "DIM-MPF-PA01";
const MOCK_USER_ID = "dddddddd-0000-0000-0000-000000000004";
const MOCK_SIGNED_URL = "https://storage.example.com/welfare-exports/test.pdf?token=mock";

let welfareReportId: string;
let petId: string;
const govtUserId = MOCK_USER_ID;

// Typed mock accessors (works with ESM mocks via vi.mocked).
const mockCreateClient = vi.mocked(supabaseServer.createClient);
const mockRequireAdminOrGovt = vi.mocked(authGuards.requireAdminOrGovtOrRedirect);

function buildSupabaseMock(uploadError: null | string = null) {
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: MOCK_USER_ID, email: "govt@test.local" } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: uploadError ? null : { path: "welfare-exports/test.pdf" },
          error: uploadError ? { message: uploadError } : null,
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
    await tx.execute(sql`DELETE FROM welfare_reports WHERE reference_code = ${WELFARE_REPORT_REF}`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${WELFARE_PET_TOKEN}`);
  });
}

describe("generateMpfExportAction — mocked storage", () => {
  beforeAll(async () => {
    await purgeFixtures();

    await db
      .insert(profiles)
      .values({
        id: MOCK_USER_ID,
        displayName: "MPF Test Govt",
        role: "govt",
        accountType: "institutional",
      })
      .onConflictDoNothing({ target: profiles.id });

    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: WELFARE_PET_TOKEN,
        name: "WelfarePetMPF",
        species: "dog",
        sex: "unknown",
        potentiallyDangerousBreed: false,
      })
      .returning();
    petId = pet.id;

    const [report] = await db
      .insert(welfareReports)
      .values({
        referenceCode: WELFARE_REPORT_REF,
        kind: "neglect",
        severity: "medium",
        description: "Integration test welfare report for MPF export (at least 20 chars here).",
        subjectKind: "registered_pet",
        subjectPetId: petId,
        status: "open",
        jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
        jurisdictionLocality: "CABA",
      })
      .returning();
    welfareReportId = report.id;
  });

  afterAll(async () => {
    await purgeFixtures();
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`DELETE FROM pets WHERE id = ${petId}`);
    });
  });

  it("returns signed URL and inserts audit_log when storage succeeds", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireAdminOrGovt.mockResolvedValue({
      profile: { id: govtUserId, role: "govt" },
      jurisdictions: [{ province: "Ciudad Autónoma de Buenos Aires", locality: "CABA" }],
      user: { id: govtUserId },
      supabase: supabaseMock,
    } as any);

    const result = await generateMpfExportAction(welfareReportId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signedUrl).toBe(MOCK_SIGNED_URL);

    // Verify audit_log row scoped to this welfareReportId.
    const [logRow] = (await db.execute(
      sql`SELECT action, payload FROM audit_log
          WHERE actor_user_id = ${govtUserId}
            AND action = 'welfare_mpf_export_generated'
            AND payload->>'welfareReportId' = ${welfareReportId}
          ORDER BY performed_at DESC
          LIMIT 1`,
    )) as Array<{ action: string; payload: Record<string, unknown> }>;

    expect(logRow).toBeDefined();
    expect(logRow.action).toBe("welfare_mpf_export_generated");
    expect(logRow.payload.welfareReportId).toBe(welfareReportId);
    expect(logRow.payload.referenceCode).toBe(WELFARE_REPORT_REF);
    expect(logRow.payload.schemaVersion).toBe(MPF_EXPORT_SCHEMA_VERSION);
  });

  it("returns not_found for a govt out of scope", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireAdminOrGovt.mockResolvedValue({
      profile: { id: govtUserId, role: "govt" },
      jurisdictions: [{ province: "Córdoba", locality: "Córdoba Capital" }],
      user: { id: govtUserId },
      supabase: supabaseMock,
    } as any);

    const result = await generateMpfExportAction(welfareReportId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_found");
  });

  it("returns not_found for a non-existent welfareReportId", async () => {
    const supabaseMock = buildSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(supabaseMock as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRequireAdminOrGovt.mockResolvedValue({
      profile: { id: govtUserId, role: "admin" },
      jurisdictions: [],
      user: { id: govtUserId },
      supabase: supabaseMock,
    } as any);

    const result = await generateMpfExportAction("00000000-dead-beef-0000-000000000000");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_found");
  });

  it("audit_log payload storagePath has format {welfareReportId}/{timestamp}.pdf", async () => {
    // The idempotency window (24h) may cause the action to skip upload and reuse
    // the existing signed URL. Verify by inspecting the audit_log payload stored
    // by the first test in this suite.
    const [logRow] = (await db.execute(
      sql`SELECT payload FROM audit_log
          WHERE action = 'welfare_mpf_export_generated'
            AND payload->>'welfareReportId' = ${welfareReportId}
          ORDER BY performed_at DESC
          LIMIT 1`,
    )) as Array<{ payload: Record<string, unknown> }>;

    expect(logRow).toBeDefined();
    const storagePath: string = (logRow?.payload?.storagePath as string) ?? "";
    expect(storagePath).toMatch(new RegExp(`^${welfareReportId}/\\d+\\.pdf$`));
  });
});
