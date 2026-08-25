// Unit tests for requireLiveUser() — the ONE result-shaped liveness guard
// (lib/infra/live-user.ts).
//
// "Live" means all four of: the platform is accepting writes, a session exists,
// the account was not erased (Ley 25.326 art. 16), and the account was not
// deactivated. Before this guard those four checks were scattered — maintenance
// in four layouts, erasure in two guards plus five hand-copied inline snippets,
// deactivation only inside loadActiveInstitutionalProfile — so a maintenance
// window never stopped an in-flight server action and 19 write boundaries had
// no erasure check at all.
//
// Strategy mirrors __tests__/auth-guards.test.ts: mock @/lib/supabase/server and
// @/lib/infra/request-cache; no DB, no Supabase instance.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase/server
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockCreateClient = vi.fn();
// getSession is part of the shape because requireLiveUser reads the access token
// back from it on the cookie path to date the session (B9, lib/infra/operator-shift.ts).
// A mock without it would pass only because the guard swallows the failure — which
// is a real safety net, but not something these tests should be silently exercising.
const mockSupabaseClient = {
  auth: { getUser: () => mockGetUser(), getSession: () => mockGetSession() },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/infra/request-cache
// ---------------------------------------------------------------------------

const mockGetProfileCached = vi.fn();

vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: (...args: unknown[]) => mockGetProfileCached(...args),
}));

import {
  type LiveUserFailureReason,
  liveUserMessage,
  requireLiveUser,
  resolveOptionalLiveUser,
} from "@/lib/infra/live-user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function session(id = "user-001", email = "user@dim-test.local") {
  return { data: { user: { id, email } }, error: null };
}

function noSession() {
  return { data: { user: null }, error: null };
}

function profile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-001",
    role: "owner",
    displayName: "Test",
    accountType: "personal",
    deactivatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "0");
  mockCreateClient.mockResolvedValue(mockSupabaseClient);
  mockGetUser.mockResolvedValue(noSession());
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockGetProfileCached.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Precedence — maintenance is the kill switch and runs FIRST
// ---------------------------------------------------------------------------

describe("requireLiveUser() — maintenance", () => {
  it("refuses with MAINTENANCE when the kill-switch is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");
    mockGetUser.mockResolvedValue(session());

    const result = await requireLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("MAINTENANCE");
  });

  // The four portal layouts short-circuit on maintenance BEFORE any auth or data
  // fetch, precisely so the screen still renders when the database is the thing
  // being maintained. The guard has to keep that property or it would turn a
  // maintenance window into a 500.
  it("does not touch auth or the database when maintenance is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "true");

    await requireLiveUser();

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetProfileCached).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Session / erasure / deactivation
// ---------------------------------------------------------------------------

describe("requireLiveUser() — session and account state", () => {
  it("refuses with NO_SESSION when there is no user", async () => {
    const result = await requireLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("NO_SESSION");
    expect(result.user).toBeNull();
  });

  it("refuses with ACCOUNT_ERASED when profiles.deleted_at is set", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date("2026-01-01") }));

    const result = await requireLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("ACCOUNT_ERASED");
    expect(result.user).toEqual({ id: "user-001" });
  });

  it("refuses with DEACTIVATED for a deactivated INSTITUTIONAL account", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({ accountType: "institutional", role: "govt", deactivatedAt: new Date() }),
    );

    const result = await requireLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("DEACTIVATED");
  });

  // Documented, deliberate scope line: `deactivated_at` on a PERSONAL account is
  // today a bookkeeping flag with no access consequence anywhere in the codebase
  // (nothing reads it outside isDeactivatedInstitutional). Making it a lockout is
  // a product change with no "cuenta desactivada" landing to bounce to, so this
  // guard reproduces today's semantics exactly and the gap is reported instead of
  // silently closed.
  it("admits a deactivated PERSONAL account (matches isDeactivatedInstitutional)", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({ accountType: "personal", deactivatedAt: new Date() }),
    );

    const result = await requireLiveUser();

    expect(result.ok).toBe(true);
  });

  it("erasure outranks deactivation when both are set", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({
        accountType: "institutional",
        deactivatedAt: new Date(),
        deletedAt: new Date(),
      }),
    );

    const result = await requireLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("ACCOUNT_ERASED");
  });

  it("admits a healthy session and returns the user plus the resolved profile", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile());

    const result = await requireLiveUser();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.user).toEqual({ id: "user-001", email: "user@dim-test.local" });
    expect(result.profile?.role).toBe("owner");
  });

  // Signup writes auth.users before the profile row exists; the pre-existing
  // guards all used `profile?.deletedAt != null`, i.e. a missing row passed.
  it("admits a session whose profile row does not exist yet (mid-signup)", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(null);

    const result = await requireLiveUser();

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Injected client — the bearer entry point (T1.2 item 4 / Track 2)
// ---------------------------------------------------------------------------

describe("requireLiveUser() — injected client", () => {
  it("uses the supplied client and never builds a cookie client", async () => {
    const bearerGetUser = vi.fn().mockResolvedValue(session("bearer-user"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "bearer-user" }));

    const result = await requireLiveUser({
      supabase: { auth: { getUser: bearerGetUser } } as never,
    });

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(bearerGetUser).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  // The load-bearing invariant: authorization is 100% DB-resolved. A bearer
  // caller must be subject to the SAME profile lookup as a cookie caller — the
  // token says who, the database says what they may do.
  it("resolves the profile from the database for a bearer caller too", async () => {
    const bearerGetUser = vi.fn().mockResolvedValue(session("bearer-user"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "bearer-user", deletedAt: new Date() }));

    const result = await requireLiveUser({
      supabase: { auth: { getUser: bearerGetUser } } as never,
    });

    expect(mockGetProfileCached).toHaveBeenCalledWith("bearer-user");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("ACCOUNT_ERASED");
  });
});

// ---------------------------------------------------------------------------
// resolveOptionalLiveUser — the anonymous-allowed write boundaries
// ---------------------------------------------------------------------------
//
// Three writes accept an anonymous caller BY DESIGN: the anonymous denuncia
// (createWelfareReportAction) and the two adoption-application actions, which
// pass `applicant: user ? {…} : null` into the use-case. requireLiveUser is the
// wrong shape for them — it refuses NO_SESSION — but "anonymous is allowed"
// never meant "erased, deactivated and mid-maintenance are allowed too", which
// is what a bare getUser() gave them.

describe("resolveOptionalLiveUser()", () => {
  it("admits an anonymous caller with user: null", async () => {
    const result = await resolveOptionalLiveUser();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.user).toBeNull();
  });

  it("admits a healthy authenticated caller", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile());

    const result = await resolveOptionalLiveUser();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.user?.id).toBe("user-001");
  });

  it("refuses during maintenance — anonymous or not, the platform is not writing", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");

    const result = await resolveOptionalLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("MAINTENANCE");
  });

  // The hole this closes: an erased account keeps a valid JWT, so a bare
  // getUser() handed the use-case a live `applicant.userId` for a subject whose
  // PII has already been hashed. Falling back to "anonymous" would be worse
  // still — it would silently launder the submission.
  it("refuses an erased account rather than downgrading it to anonymous", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(profile({ deletedAt: new Date() }));

    const result = await resolveOptionalLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("ACCOUNT_ERASED");
  });

  it("refuses a deactivated institutional account", async () => {
    mockGetUser.mockResolvedValue(session());
    mockGetProfileCached.mockResolvedValue(
      profile({ accountType: "institutional", deactivatedAt: new Date() }),
    );

    const result = await resolveOptionalLiveUser();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("DEACTIVATED");
  });
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

describe("liveUserMessage()", () => {
  const reasons: LiveUserFailureReason[] = [
    "NO_SESSION",
    "ACCOUNT_ERASED",
    "MAINTENANCE",
    "DEACTIVATED",
  ];

  it("returns a distinct, non-empty es-AR message for every reason", () => {
    const messages = reasons.map(liveUserMessage);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) expect(message.length).toBeGreaterThan(0);
  });

  // These two strings are already on screen today, hand-copied across ~24 write
  // boundaries. Keeping them byte-identical means the migration is invisible to
  // users and to the copy tests that assert on them.
  it("keeps the existing wording for the two pre-existing refusals", () => {
    expect(liveUserMessage("NO_SESSION")).toBe("Sesión expirada.");
    expect(liveUserMessage("ACCOUNT_ERASED")).toBe("Tu cuenta fue eliminada.");
  });
});
