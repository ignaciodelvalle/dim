// Unit tests for the panorama API institutional gate (HIGH-2 + CRITICAL-1 exfil).
//
// The three /api/panorama/* routes used to gate ONLY on
//   profile.role === 'admin' | 'govt'
// which skipped the account_type / deactivation / erasure invariants that the
// PAGE guard (loadActiveInstitutionalProfile) enforces. resolveInstitutional-
// PanoramaActor closes that gap: a personal-account 'admin', a deactivated
// operator, and an erased operator must get 401/403, never data. A legit ACTIVE
// institutional admin/govt is admitted.
//
// Pure mock-based — no DB, no Supabase instance (mirrors __tests__/auth-guards.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted before the module-under-test import)
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSupabaseClient = { auth: { getUser: () => mockGetUser() } };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}));

const mockGetProfileCached = vi.fn();
const mockGetJurisdictionsCached = vi.fn();

vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: (...args: unknown[]) => mockGetProfileCached(...args),
  getJurisdictionsCached: (...args: unknown[]) => mockGetJurisdictionsCached(...args),
}));

// Mock the DB-backed rate limiter so the guard's per-operator cap (MED-2) does
// not hit Postgres in this pure unit test. Provide a faithful RateLimitError so
// the guard's `instanceof` check matches when we simulate a breach.
const mockEnforceRateLimit = vi.fn();
vi.mock("@/lib/infra/rate-limit", () => {
  class RateLimitError extends Error {
    resetAt: Date;
    reason: string;
    constructor(resetAt: Date, reason: string) {
      super(`Rate limit exceeded: ${reason}`);
      this.name = "RateLimitError";
      this.resetAt = resetAt;
      this.reason = reason;
    }
  }
  return {
    RateLimitError,
    enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  };
});

const mockGetPanoramaKpis = vi.fn();
vi.mock("@/src/modules/panorama/application/get-panorama-kpis", () => ({
  getPanoramaKpis: (...args: unknown[]) => mockGetPanoramaKpis(...args),
  // The route imports degradedPanoramaKpis for its degraded/503 envelope — keep a
  // faithful stand-in so mocking the module doesn't strip it.
  degradedPanoramaKpis: () => ({
    kpis: [],
    recalculatedFor:
      "No pudimos cargar los indicadores en este momento. Reintentá en unos segundos.",
    dataAsOf: null,
  }),
}));

import { RateLimitError } from "@/lib/infra/rate-limit";
import { resolveInstitutionalPanoramaActor } from "../_guard";
import { GET as kpisGET } from "../kpis/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function session(id = "user-1") {
  return { data: { user: { id, email: `${id}@dim-test.local` } }, error: null };
}
function noSession() {
  return { data: { user: null }, error: null };
}

type ProfileOverrides = Partial<{
  id: string;
  role: "owner" | "vet" | "govt" | "admin";
  displayName: string;
  accountType: "personal" | "institutional";
  deactivatedAt: Date | null;
  deletedAt: Date | null;
}>;

function profile(o: ProfileOverrides = {}) {
  return {
    id: "user-1",
    role: "admin",
    displayName: "Test",
    accountType: "institutional",
    deactivatedAt: null,
    deletedAt: null,
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue(noSession());
});

// ---------------------------------------------------------------------------
// resolveInstitutionalPanoramaActor — the single gate all three routes share
// ---------------------------------------------------------------------------

describe("resolveInstitutionalPanoramaActor — rejections", () => {
  it("401 when there is no session", async () => {
    mockGetUser.mockResolvedValue(noSession());
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("401 when the profile row is missing", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(null);
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("401 when the account has been erased (deletedAt set)", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-07-01") }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  // CRITICAL-1 exfil half: a personal-account row that somehow carries role=admin
  // must NOT read panorama data through the API.
  it("403 when role=admin but accountType is personal", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ accountType: "personal" }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    // No scope lookup for a rejected caller.
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });

  it("403 when an institutional admin is deactivated", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deactivatedAt: new Date("2026-01-01") }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("403 when an institutional govt is deactivated", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({ role: "govt", deactivatedAt: new Date("2026-01-01") }),
    );
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("403 for role=owner", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ role: "owner", accountType: "personal" }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("403 for role=vet", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ role: "vet", accountType: "personal" }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });
});

describe("resolveInstitutionalPanoramaActor — admits legit operators", () => {
  it("admits an active institutional admin with empty jurisdictions", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor.role).toBe("admin");
      expect(r.actor.jurisdictions).toEqual([]);
    }
    // Admin has universal scope — no jurisdictions read.
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });

  it("admits an active institutional govt and returns its jurisdiction tuples", async () => {
    mockGetUser.mockResolvedValue(session("govt-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "govt-ok", role: "govt" }));
    mockGetJurisdictionsCached.mockResolvedValue([
      { province: "Buenos Aires", locality: "La Plata" },
    ]);
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor.role).toBe("govt");
      expect(r.actor.jurisdictions).toEqual([{ province: "Buenos Aires", locality: "La Plata" }]);
    }
    expect(mockGetJurisdictionsCached).toHaveBeenCalledWith("govt-ok");
  });
});

// ---------------------------------------------------------------------------
// MED-2 — per-operator aggregate request cap on /api/panorama/*
// ---------------------------------------------------------------------------

describe("resolveInstitutionalPanoramaActor — per-operator rate cap (MED-2)", () => {
  it("enforces the panorama_api limit keyed on profile id, after auth resolves", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(true);
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("panorama_api", "admin-ok", {
      maxPerMinute: 120,
    });
  });

  it("429s (Retry-After) when the operator exceeds the aggregate cap", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    mockEnforceRateLimit.mockRejectedValueOnce(
      new RateLimitError(new Date(Date.now() + 60_000), "panorama_api breach"),
    );
    const r = await resolveInstitutionalPanoramaActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get("Retry-After")).toBe("60");
    }
    // Rejected before any scope lookup.
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// End-to-end through a real route handler (/api/panorama/kpis) to prove the
// route wires the gate and never reaches the use-case for a rejected caller.
// ---------------------------------------------------------------------------

describe("GET /api/panorama/kpis wires the institutional gate", () => {
  const req = () => new Request("http://localhost/api/panorama/kpis");

  it("403s a personal-account admin and never calls the KPI use-case", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ accountType: "personal" }));
    const res = await kpisGET(req());
    expect(res.status).toBe(403);
    expect(mockGetPanoramaKpis).not.toHaveBeenCalled();
  });

  it("401s an erased operator", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-07-01") }));
    const res = await kpisGET(req());
    expect(res.status).toBe(401);
    expect(mockGetPanoramaKpis).not.toHaveBeenCalled();
  });

  it("200s a legit active institutional admin and delegates to the use-case", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ role: "admin" }));
    mockGetPanoramaKpis.mockResolvedValue({ kpis: [] });
    const res = await kpisGET(req());
    expect(res.status).toBe(200);
    expect(mockGetPanoramaKpis).toHaveBeenCalledTimes(1);
  });

  // NEVER-CRASH (task #74): a rejected fan-out must yield a 503 JSON envelope,
  // never a thrown error that crashes the lambda.
  it("503s with a JSON error envelope when the KPI use-case rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ role: "admin" }));
    mockGetPanoramaKpis.mockRejectedValue(new Error("pooler degraded"));

    const res = await kpisGET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("panorama_kpis_unavailable");
    // Carries the degraded strip so a caller can still render an honest state.
    expect(body.kpis).toEqual([]);
    expect(body.dataAsOf).toBeNull();
  });
});
