// Unit test: createWelfareReportAction — CoordError hardening (P2).
//
// Before this fix, out-of-range coordinates submitted via the anonymous
// denuncia map pin caused normalizeLocationForWrite to throw CoordError,
// which propagated as an uncaught 500. This test verifies that the action
// now catches CoordError and returns the site's existing friendly-error
// shape — { error: string } — instead of letting it propagate.
//
// Tests:
//   1. Out-of-range lat (lat=999) → returns { error: <message> }, no throw.
//   2. Out-of-range lng (lng=-999) → returns { error: <message> }, no throw.
//   3. Valid in-range coords → does NOT return a coord-range error.
//
// Auth + rate-limit are short-circuited by mocking supabase/rate-limit.
// normalizeLocationForWrite runs for real (same as set-pet-lost-coord-range.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: server-only
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Mock: next/headers — needed for anonymous path's callerIp call. We mock a
// logged-in user so this path won't actually be invoked, but the import still
// needs to resolve.
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// ---------------------------------------------------------------------------
// Mock: supabase — return a stub logged-in user so the action uses the
// per-user rate-limit bucket and we avoid the IP-based anonymous path.
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-welfare-test-stub" } },
      }),
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mock: rate-limit — always passes (no-op).
// ---------------------------------------------------------------------------
vi.mock("@/lib/infra/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
  callerIp: vi.fn().mockReturnValue("127.0.0.1"),
  RateLimitError: class RateLimitError extends Error {},
}));

// ---------------------------------------------------------------------------
// Mock: parseLocationFromFormData — returns a loc object built from the
// formData fields "locationLat" / "locationLng" so the real
// normalizeLocationForWrite receives them and performs the range check.
// ---------------------------------------------------------------------------
vi.mock("@/lib/domain/location-value", () => ({
  parseLocationFromFormData: vi.fn().mockImplementation((fd: FormData) => ({
    province: String(fd.get("jurisdictionProvince") ?? "") || null,
    provinceCode: null,
    locality: String(fd.get("jurisdictionLocality") ?? "") || null,
    localityIndecId: null,
    lat: fd.get("locationLat") ? Number(fd.get("locationLat")) : null,
    lng: fd.get("locationLng") ? Number(fd.get("locationLng")) : null,
    address: String(fd.get("locationAddress") ?? "") || null,
  })),
}));

// ---------------------------------------------------------------------------
// Mock: DB and downstream deps — the action must not reach the DB on
// out-of-range coord paths.
// ---------------------------------------------------------------------------
const mockTransaction = vi.hoisted(() =>
  vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
);

vi.mock("@/db", () => ({
  db: {
    transaction: mockTransaction,
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
    })),
  },
  organizationMemberships: {},
  organizations: {},
  welfareReports: {},
  notifications: {},
}));

vi.mock("@/lib/infra/case-helpers", () => ({
  openCase: vi.fn(),
  closeCase: vi.fn(),
}));

vi.mock("@/lib/domain/location", () => ({
  writePoint: vi.fn(() => ({ locationLat: null, locationLng: null })),
}));

vi.mock("@/lib/infra/approval-routing", () => ({
  findAuthoritiesForJurisdiction: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(),
  requireAdminOrRedirect: vi.fn(),
  requireUserOrRedirect: vi.fn(),
}));

vi.mock("@/lib/domain/authority", () => ({
  signalWelfareReport: vi.fn(),
}));

vi.mock("@/lib/utils/format", () => ({
  parseDateInput: vi.fn(),
}));

vi.mock("@/lib/infra/storage", () => ({
  welfareAttachmentSignedUrl: vi.fn(),
}));

vi.mock("@/lib/analytics/welfare-exports", () => ({
  MPF_EXPORT_SCHEMA_VERSION: "1",
  createSignedExportUrl: vi.fn(),
  generateWelfareMpfPdf: vi.fn(),
  uploadExportToStorage: vi.fn(),
  welfareReportToMpfDto: vi.fn(),
}));

vi.mock("@/lib/infra/welfare-moderation", () => ({
  computeFlagReasons: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/infra/welfare-uploads", () => ({
  uploadWelfareEvidence: vi.fn(),
}));

vi.mock("@/src/modules/welfare/domain/reference-code", () => ({
  generateReferenceCode: vi.fn().mockReturnValue("REF-TEST"),
}));

vi.mock("@/src/modules/welfare/application/create-welfare-report", () => ({
  createWelfareReport: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/src/modules/welfare/application/create-org-welfare-report", () => ({
  createOrgWelfareReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/triage-welfare-report", () => ({
  triageWelfareReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/start-welfare-report", () => ({
  startWelfareReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/close-welfare-report", () => ({
  closeWelfareReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/pass-welfare-to-triage", () => ({
  passWelfareToTriage: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/confirm-welfare-as-spam", () => ({
  confirmWelfareAsSpam: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/assign-welfare", () => ({
  assignWelfare: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/unassign-welfare", () => ({
  unassignWelfare: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/generate-mpf-export", () => ({
  generateMpfExport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/add-intervention-note", () => ({
  addInterventionNote: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/add-reporter-comment", () => ({
  addReporterComment: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/take-derived-report", () => ({
  takeDerivedReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/application/return-derived-report", () => ({
  returnDerivedReport: vi.fn(),
}));

vi.mock("@/src/modules/welfare/infrastructure/welfare-repository", () => ({
  WelfareRepository: class {
    insertReportWithRetry = vi.fn().mockResolvedValue({ id: "report-stub" });
    findReportById = vi.fn().mockResolvedValue(null);
    findReportByIdempotencyKey = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after all mocks)
// ---------------------------------------------------------------------------

import { createWelfareReportAction } from "@/src/modules/welfare/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  // Minimal fields that survive early validation so the action reaches the
  // coord-check (which occurs before form field validation).
  fd.set("kind", "neglect");
  fd.set("severity", "medium");
  fd.set("description", "Descripción de prueba con al menos veinte caracteres.");
  fd.set("subjectKind", "unowned_animal");
  fd.set("subjectDescription", "Perro abandonado en la calle.");
  fd.set("locationAddress", "Av. Corrientes 1234, CABA");
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createWelfareReportAction — CoordError catch (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns friendly error shape for out-of-range latitude (lat=999)", async () => {
    const fd = makeFormData({ locationLat: "999", locationLng: "-58.3816" });
    const result = await createWelfareReportAction({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe("string");
    // Must not propagate as an unhandled exception — result must be the
    // friendly { error: string } shape, not a thrown CoordError.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns friendly error shape for out-of-range longitude (lng=-999)", async () => {
    const fd = makeFormData({ locationLat: "-34.6037", locationLng: "-999" });
    const result = await createWelfareReportAction({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe("string");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does not return a coord-range error for valid in-range coords", async () => {
    const fd = makeFormData({ locationLat: "-34.6037", locationLng: "-58.3816" });
    const result = await createWelfareReportAction({ error: null }, fd);
    // On success the action calls redirect() (mocked as a no-op) and returns
    // undefined. Either undefined (success path) or a non-coord error is fine;
    // the important thing is it is NOT a coord-range error.
    const isCoordError =
      result != null &&
      typeof result.error === "string" &&
      /fuera de rango|out.of.range/i.test(result.error);
    expect(isCoordError).toBe(false);
  });
});
