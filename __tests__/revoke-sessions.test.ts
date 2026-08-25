// B11 — "cerrar sesión en todos los dispositivos".
//
// WHAT THIS FILE IS REALLY GUARDING
// ---------------------------------------------------------------------------
// The obvious implementation of this feature — `supabase.auth.signOut({ scope:
// "global" })` on the request's client — is CORRECT on the cookie path and
// SILENTLY REVOKES NOTHING on the bearer path, while returning success. In
// auth-js 2.105.4 `_signOut` loads the session from STORAGE, and a bearer client
// has none (it carries the token in a header instead), so the `admin.signOut`
// call is skipped and the function returns `{ error: null }`.
//
// On a security control that is the worst available outcome: the user is told
// every device was signed out and none was. So the first assertions here are not
// about the happy path — they are about WHICH GoTrue call is made, with WHICH
// argument, because that is the part a plausible refactor would quietly break.
//
// The second thing pinned is fail-CLOSED. Every rate limiter around this
// endpoint fails open on purpose; this must not, because a user told "listo"
// stops worrying about the phone they lost.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAdminSignOut = vi.fn();
const mockCreateAnonClient = vi.fn();

vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => mockCreateAnonClient(),
}));

const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/infra/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/db", () => ({ db: { __brand: "db" } }));

const mockReportError = vi.fn();

vi.mock("@/lib/infra/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { revokeAllSessions } from "@/src/modules/auth/application/revoke-sessions";

const TOKEN = "header.payload.signature";

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminSignOut.mockResolvedValue({ data: null, error: null });
  mockCreateAnonClient.mockReturnValue({ auth: { admin: { signOut: mockAdminSignOut } } });
  mockWriteAuditLog.mockResolvedValue({ id: "audit-row-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The call itself — the part the bearer trap would break
// ---------------------------------------------------------------------------

describe("revokeAllSessions — how the revocation is performed", () => {
  it("calls admin.signOut with the RAW TOKEN and the global scope", async () => {
    const result = await revokeAllSessions({
      accessToken: TOKEN,
      userId: "user-001",
      surface: "web",
    });

    expect(result).toEqual({ ok: true });
    // The first argument is a JWT, NOT a user id — verified against auth-js
    // 2.105.4, where the endpoint authorizes with `Authorization: Bearer <jwt>`.
    // Passing the userId would revoke nothing and report success.
    expect(mockAdminSignOut).toHaveBeenCalledWith(TOKEN, "global");
  });

  it("does NOT route through a session-loading signOut, which no-ops on bearer", async () => {
    // A client offering the tempting `auth.signOut` must be left alone: on the
    // bearer path it finds no stored session and silently revokes nothing.
    const tempting = vi.fn();
    mockCreateAnonClient.mockReturnValue({
      auth: { signOut: tempting, admin: { signOut: mockAdminSignOut } },
    });

    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "api_v1" });

    expect(tempting).not.toHaveBeenCalled();
    expect(mockAdminSignOut).toHaveBeenCalledTimes(1);
  });

  it("uses the ANON client — no service-role key for a user's own act", async () => {
    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "web" });

    // The caller's own token is what authorizes revoking the caller's own
    // sessions. Reaching for createAdminClient() would add a service-role path
    // to a user-triggered endpoint and buy nothing.
    expect(mockCreateAnonClient).toHaveBeenCalledTimes(1);
  });

  it("uses scope 'global' and not 'others', so the current session dies too", async () => {
    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "web" });

    const [, scope] = mockAdminSignOut.mock.calls[0];
    expect(scope).toBe("global");
    expect(scope).not.toBe("others");
  });
});

// ---------------------------------------------------------------------------
// Fail CLOSED
// ---------------------------------------------------------------------------

describe("revokeAllSessions — failure is never reported as success", () => {
  it("refuses when GoTrue returns an error", async () => {
    mockAdminSignOut.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await revokeAllSessions({
      accessToken: TOKEN,
      userId: "user-001",
      surface: "web",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // The copy names the fallback that does not depend on us.
    expect(result.error).toMatch(/contraseña/i);
  });

  it("refuses when the transport throws", async () => {
    mockAdminSignOut.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await revokeAllSessions({
      accessToken: TOKEN,
      userId: "user-001",
      surface: "web",
    });

    expect(result.ok).toBe(false);
  });

  it("refuses an empty token instead of calling GoTrue with nothing", async () => {
    const result = await revokeAllSessions({ accessToken: "", userId: "u", surface: "web" });

    expect(result.ok).toBe(false);
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });

  it("writes NO audit row when the revocation failed", async () => {
    mockAdminSignOut.mockResolvedValue({ data: null, error: { message: "boom" } });

    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "web" });

    // Of the two ways to be wrong, "revoked but unlogged" beats "logged but
    // still signed in everywhere". The row must describe something that happened.
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The audit trail
// ---------------------------------------------------------------------------

describe("revokeAllSessions — the audit row", () => {
  it("records the act against the actor, tagged with the surface", async () => {
    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "api_v1" });

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const [, entry] = mockWriteAuditLog.mock.calls[0];
    expect(entry).toMatchObject({
      action: "sessions_revoked_self",
      actorUserId: "user-001",
      targetUserId: "user-001",
      payload: { surface: "api_v1" },
    });
  });

  it("carries no token, and nothing beyond the actor", async () => {
    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "web" });

    const [, entry] = mockWriteAuditLog.mock.calls[0];
    expect(JSON.stringify(entry)).not.toContain(TOKEN);
  });

  it("still reports success when the audit write fails, and reports the failure", async () => {
    mockWriteAuditLog.mockRejectedValue(new Error("audit table unavailable"));

    const result = await revokeAllSessions({
      accessToken: TOKEN,
      userId: "user-001",
      surface: "web",
    });

    // The sessions ARE gone. Saying otherwise would send the user chasing a
    // control that already worked. The missing row is an observability problem.
    expect(result).toEqual({ ok: true });
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it("writes the row AFTER the revocation, not before", async () => {
    const order: string[] = [];
    mockAdminSignOut.mockImplementation(async () => {
      order.push("revoke");
      return { data: null, error: null };
    });
    mockWriteAuditLog.mockImplementation(async () => {
      order.push("audit");
      return { id: "x" };
    });

    await revokeAllSessions({ accessToken: TOKEN, userId: "user-001", surface: "web" });

    expect(order).toEqual(["revoke", "audit"]);
  });
});
