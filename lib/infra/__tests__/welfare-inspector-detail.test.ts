// Scope-guard + audit-on-open tests for loadWelfareInspectorDetail (task #12).
//
// FENCE PROOF: the loader is the single place the inspector route enforces the
// govt jurisdiction scope and fires the coordinate-view audit. These tests lock:
//   - a govt operator OUT of scope gets { ok: false } (route → 404, no leak) and
//     NO audit row is written (we return before the audit);
//   - a govt operator IN scope with a coordinate gets { ok: true } AND
//     logWelfareLocationViewed fires ON OPEN with (userId, reportId, refCode) —
//     parity with the full page's route-prefetch audit;
//   - an admin (universal scope) is never scope-blocked;
//   - a non-existent report is { ok: false }, identical to out-of-scope.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Chainable @/db stub — every query builder method returns the same thenable;
// awaiting it shifts the pre-seeded result queue (default []). Table exports are
// dummy proxies (drizzle operators only need a ref, the builder is mocked).
// Declared via vi.hoisted so the (hoisted) vi.mock factories can reference it.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const dbState = { queue: [] as unknown[] };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
    builder[m] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable query-builder stub for the @/db mock
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(dbState.queue.length ? dbState.queue.shift() : []).then(resolve, reject);
  const tableProxy = new Proxy({}, { get: () => ({}) });
  const mockLogAudit = vi.fn((..._args: unknown[]): Promise<void> => Promise.resolve());
  return { dbState, builder, tableProxy, mockLogAudit };
});

const mockLogAudit = h.mockLogAudit;

vi.mock("@/db", () => ({
  db: h.builder,
  welfareReports: h.tableProxy,
  welfareReportAttachments: h.tableProxy,
  organizations: h.tableProxy,
  profiles: h.tableProxy,
  pets: h.tableProxy,
  caseEvents: h.tableProxy,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/infra/storage", () => ({ welfareAttachmentSignedUrl: vi.fn(async () => null) }));
vi.mock("@/lib/analytics/govt-dashboards", () => ({ fetchWelfareTimeline: vi.fn(async () => []) }));

vi.mock("@/lib/infra/welfare-location-audit", () => ({
  logWelfareLocationViewed: (...args: unknown[]) => h.mockLogAudit(...args),
}));

import { loadWelfareInspectorDetail } from "../welfare-inspector-detail";

function report(over: Record<string, unknown> = {}) {
  return {
    id: "rep-1",
    referenceCode: "DEN-ABCD-1234",
    kind: "abandono",
    severity: "high",
    status: "triaged",
    description: "desc",
    subjectKind: "unregistered_animal",
    subjectPetId: null,
    subjectDescription: null,
    locationAddress: null,
    jurisdictionProvince: "CABA",
    jurisdictionLocality: "Palermo",
    locationLat: "-34.603700",
    locationLng: "-58.381600",
    occurredAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    triagedAt: null,
    triagedByUserId: null,
    closedAt: null,
    resolutionNotes: null,
    caseId: null,
    assignedToUserId: null,
    derivedToOrganizationId: null,
    derivedAt: null,
    orgInterventionStatus: null,
    orgInterventionAt: null,
    reporterUserId: null,
    reporterContactEmail: null,
    reporterContactPhone: null,
    ...over,
  };
}

const GOVT_CABA = {
  profile: { id: "u-1", role: "govt" as const },
  jurisdictions: [{ province: "CABA", locality: "Palermo" }],
  user: { id: "u-1" },
};
const GOVT_SALTA = {
  profile: { id: "u-2", role: "govt" as const },
  jurisdictions: [{ province: "Salta", locality: "Salta" }],
  user: { id: "u-2" },
};
const ADMIN = {
  profile: { id: "admin-1", role: "admin" as const },
  jurisdictions: [] as { province: string; locality: string }[],
  user: { id: "admin-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.dbState.queue = [];
});

describe("loadWelfareInspectorDetail — scope 404-no-leak", () => {
  it("out-of-scope govt → { ok:false } and NO audit row written", async () => {
    h.dbState.queue = [[report()]]; // report exists, but in CABA
    const res = await loadWelfareInspectorDetail(GOVT_SALTA, "rep-1");
    expect(res.ok).toBe(false);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("non-existent report → { ok:false } (identical outcome to out-of-scope)", async () => {
    h.dbState.queue = [[]]; // report query returns nothing
    const res = await loadWelfareInspectorDetail(GOVT_CABA, "rep-1");
    expect(res.ok).toBe(false);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

describe("loadWelfareInspectorDetail — audit-on-open", () => {
  it("in-scope govt with a coordinate → { ok:true } AND audit fires on open", async () => {
    h.dbState.queue = [[report()]];
    const res = await loadWelfareInspectorDetail(GOVT_CABA, "rep-1");
    expect(res.ok).toBe(true);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith("u-1", "rep-1", "DEN-ABCD-1234");
  });

  it("does NOT audit when the report has no coordinate", async () => {
    h.dbState.queue = [[report({ locationLat: null, locationLng: null })]];
    const res = await loadWelfareInspectorDetail(GOVT_CABA, "rep-1");
    expect(res.ok).toBe(true);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("admin (universal scope) is never scope-blocked and audits on open", async () => {
    h.dbState.queue = [[report({ jurisdictionProvince: "Salta", jurisdictionLocality: "Salta" })]];
    const res = await loadWelfareInspectorDetail(ADMIN, "rep-1");
    expect(res.ok).toBe(true);
    expect(mockLogAudit).toHaveBeenCalledWith("admin-1", "rep-1", "DEN-ABCD-1234");
  });
});
