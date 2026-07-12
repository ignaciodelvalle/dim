// Unit tests for the /api/gob/* institutional gate (task #12). Mirrors the
// panorama gate test: a personal-account 'admin', a deactivated operator, an
// erased operator, and non-institutional roles must get 401/403 — never data —
// and the aggregate per-operator cap answers 429. A legit ACTIVE institutional
// admin/govt is admitted with its jurisdiction tuples.
//
// Pure mock-based — no DB, no Supabase instance.

import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { RateLimitError } from "@/lib/infra/rate-limit";
import { resolveInstitutionalGobActor } from "../_guard";

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

describe("resolveInstitutionalGobActor — rejections", () => {
  it("401 when there is no session", async () => {
    mockGetUser.mockResolvedValue(noSession());
    const r = await resolveInstitutionalGobActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("401 when the profile row is missing", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(null);
    const r = await resolveInstitutionalGobActor();
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("401 when the account has been erased (deletedAt set)", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-07-01") }));
    const r = await resolveInstitutionalGobActor();
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("403 when role=admin but accountType is personal", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ accountType: "personal" }));
    const r = await resolveInstitutionalGobActor();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });

  it("403 when an institutional govt is deactivated", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({ role: "govt", deactivatedAt: new Date("2026-01-01") }),
    );
    const r = await resolveInstitutionalGobActor();
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("403 for role=owner", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ role: "owner", accountType: "personal" }));
    const r = await resolveInstitutionalGobActor();
    if (!r.ok) expect(r.response.status).toBe(403);
  });
});

describe("resolveInstitutionalGobActor — admits legit operators", () => {
  it("admits an active institutional admin with empty jurisdictions", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    const r = await resolveInstitutionalGobActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor.role).toBe("admin");
      expect(r.actor.jurisdictions).toEqual([]);
    }
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });

  it("admits an active institutional govt and returns its jurisdiction tuples", async () => {
    mockGetUser.mockResolvedValue(session("govt-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "govt-ok", role: "govt" }));
    mockGetJurisdictionsCached.mockResolvedValue([{ province: "CABA", locality: "Palermo" }]);
    const r = await resolveInstitutionalGobActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor.role).toBe("govt");
      expect(r.actor.jurisdictions).toEqual([{ province: "CABA", locality: "Palermo" }]);
    }
    expect(mockGetJurisdictionsCached).toHaveBeenCalledWith("govt-ok");
  });
});

describe("resolveInstitutionalGobActor — per-operator rate cap", () => {
  it("enforces the gob_api limit keyed on profile id, after auth resolves", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    await resolveInstitutionalGobActor();
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("gob_api", "admin-ok", {
      maxPerMinute: 120,
    });
  });

  it("429s (Retry-After) when the operator exceeds the aggregate cap", async () => {
    mockGetUser.mockResolvedValue(session("admin-ok"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "admin-ok", role: "admin" }));
    mockEnforceRateLimit.mockRejectedValueOnce(
      new RateLimitError(new Date(Date.now() + 60_000), "gob_api breach"),
    );
    const r = await resolveInstitutionalGobActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get("Retry-After")).toBe("60");
    }
    expect(mockGetJurisdictionsCached).not.toHaveBeenCalled();
  });
});
