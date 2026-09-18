// Second factor (TOTP) for institutional accounts — T2-S6.
//
// Three layers, all without a live GoTrue (the local stack needs a restart before
// its TOTP endpoints answer, see supabase/config.toml [auth.mfa.totp]):
//
//   1. mfa-policy.ts — the pure requirement table.
//   2. mfa-actions.ts — the /mfa and /mfa/configurar steps: who may take them,
//      the per-account code budget, the cookie client doing the verify, and the
//      `mfa_factor_enrolled` audit row.
//   3. reset-mfa-factors.ts — admin-assisted recovery (Supabase has no recovery
//      codes): admin only, never on oneself, every factor removed, audited.
//
// Where requireLiveUser and the page guards act on the policy is pinned in
// live-user-guard.test.ts and auth-guards.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getProfileCached: vi.fn(),
  enforceRateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  resolveUserLanding: vi.fn(),
  loadActorProfile: vi.fn(),
  targetRows: [] as Array<{ id: string; accountType: string }>,
  adminListFactors: vi.fn(),
  adminDeleteFactor: vi.fn(),
}));

vi.mock("@/lib/infra/request-cache", () => ({ getProfileCached: h.getProfileCached }));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return { ...actual, enforceRateLimit: h.enforceRateLimit };
});
vi.mock("@/lib/infra/audit-log", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("@/lib/infra/role-landing", () => ({
  resolveUserLanding: h.resolveUserLanding,
  safeReturnTo: (v: string | null | undefined) =>
    v?.startsWith("/") && !v.startsWith("//") ? v : null,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => h.targetRows }) }) }),
  },
  profiles: { id: "id", accountType: "account_type" },
}));
vi.mock("@/src/modules/organizations/application/admin-institutional/helpers", () => ({
  loadActorProfile: h.loadActorProfile,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: { mfa: { listFactors: h.adminListFactors, deleteFactor: h.adminDeleteFactor } },
    },
  }),
}));

import { RateLimitError } from "@/lib/infra/rate-limit";
import {
  confirmMfaEnrolmentAction,
  startMfaEnrolmentAction,
  verifyMfaChallengeAction,
} from "@/src/modules/auth/application/mfa/mfa-actions";
import { mfaRequirement } from "@/src/modules/auth/domain/mfa-policy";
import { resetMfaFactorsForAuthority } from "@/src/modules/organizations/application/admin-institutional/reset-mfa-factors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (aal: string) =>
  `${b64({ alg: "HS256" })}.${b64({ aal, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })}.sig`;
const VERIFIED = { id: "f-ok", factor_type: "totp", status: "verified" };
const UNVERIFIED = { id: "f-old", factor_type: "totp", status: "unverified" };

const govtProfile = {
  id: "op-1",
  role: "govt",
  accountType: "institutional",
  deactivatedAt: null,
  deletedAt: null,
};

function cookieClient({
  user = { id: "op-1", factors: [] as unknown[] } as { id: string; factors?: unknown[] } | null,
  aal = "aal1",
  verifyError = null as unknown,
} = {}) {
  const mfa = {
    challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: verifyError }),
    listFactors: vi.fn().mockResolvedValue({ data: { all: user?.factors ?? [] }, error: null }),
    unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
    enroll: vi.fn().mockResolvedValue({
      data: {
        id: "f-new",
        type: "totp",
        totp: {
          qr_code: "<svg/>",
          secret: "SECRETBASE32",
          uri: "otpauth://totp/miMAR:op?secret=S",
        },
      },
      error: null,
    }),
  };
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: token(aal) } } }),
      mfa,
    },
  };
  return { client: client as never, mfa };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProfileCached.mockResolvedValue(govtProfile);
  h.enforceRateLimit.mockResolvedValue(undefined);
  h.writeAuditLog.mockResolvedValue({ id: "audit-1" });
  h.resolveUserLanding.mockResolvedValue("/gob");
  h.loadActorProfile.mockResolvedValue({
    id: "admin-1",
    role: "admin",
    accountType: "institutional",
    deactivatedAt: null,
  });
  h.targetRows = [{ id: "op-1", accountType: "institutional" }];
  h.adminListFactors.mockResolvedValue({ data: { factors: [VERIFIED] }, error: null });
  h.adminDeleteFactor.mockResolvedValue({ data: { id: "f-ok" }, error: null });
});

// ---------------------------------------------------------------------------
// 1. Policy
// ---------------------------------------------------------------------------

describe("mfaRequirement", () => {
  it.each([
    [[], "aal1", "enrol"],
    [[UNVERIFIED], "aal1", "enrol"],
    [[{ ...VERIFIED, factor_type: "phone" }], "aal1", "enrol"],
    [[VERIFIED], "aal1", "challenge"],
    [[VERIFIED], "aal2", "satisfied"],
    [[VERIFIED], null, "unknown"],
    [[], null, "unknown"],
  ] as const)("factors %j at %s → %s", (factors, aal, expected) => {
    expect(mfaRequirement({ factors, aal })).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 2. The /mfa steps
// ---------------------------------------------------------------------------

describe("verifyMfaChallengeAction", () => {
  it("verifies the account's OWN verified factor on the cookie client and returns the landing", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [UNVERIFIED, VERIFIED] } });
    const result = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "123 456" }),
    );
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-ok", code: "123456" });
    expect(result).toEqual({ error: null, next: "/gob" });
  });

  it("honours a safe returnTo and ignores an unsafe one", async () => {
    const { client } = cookieClient({ user: { id: "op-1", factors: [VERIFIED] } });
    const safe = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "123456", returnTo: "/gob/cola" }),
    );
    expect(safe.next).toBe("/gob/cola");
    const unsafe = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "123456", returnTo: "//evil.example" }),
    );
    expect(unsafe.next).toBe("/gob");
  });

  it("refuses a wrong code with one sentence", async () => {
    const { client } = cookieClient({
      user: { id: "op-1", factors: [VERIFIED] },
      verifyError: { message: "Invalid TOTP code entered" },
    });
    const result = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "000000" }),
    );
    expect(result.error).toMatch(/no es correcto/);
    expect(result.next).toBeUndefined();
  });

  it("rejects a malformed code before spending the budget or calling GoTrue", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [VERIFIED] } });
    const result = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "12ab56" }),
    );
    expect(result.error).toMatch(/6 números/);
    expect(h.enforceRateLimit).not.toHaveBeenCalled();
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("spends a per-ACCOUNT budget and refuses when it is spent", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [VERIFIED] } });
    h.enforceRateLimit.mockRejectedValueOnce(new RateLimitError(new Date(), "auth_mfa_code_user"));
    const result = await verifyMfaChallengeAction(
      client,
      { error: null },
      form({ code: "123456" }),
    );
    expect(h.enforceRateLimit).toHaveBeenCalledWith(
      "auth_mfa_code_user",
      "op-1",
      expect.any(Object),
    );
    expect(result.error).toMatch(/demasiados intentos/i);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("refuses a personal account and an expired session", async () => {
    h.getProfileCached.mockResolvedValue({
      ...govtProfile,
      role: "owner",
      accountType: "personal",
    });
    const personal = cookieClient({ user: { id: "op-1", factors: [VERIFIED] } });
    expect(
      (await verifyMfaChallengeAction(personal.client, { error: null }, form({ code: "123456" })))
        .error,
    ).toMatch(/institucionales/);
    const gone = cookieClient({ user: null });
    expect(
      (await verifyMfaChallengeAction(gone.client, { error: null }, form({ code: "123456" })))
        .error,
    ).toMatch(/expiró/);
    expect(personal.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe("startMfaEnrolmentAction", () => {
  it("clears abandoned unverified factors, enrols TOTP and draws the QR itself", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [UNVERIFIED] } });
    const result = await startMfaEnrolmentAction(client);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-old" });
    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
    if (!("ok" in result)) throw new Error(result.error);
    expect(result.factorId).toBe("f-new");
    expect(result.secret).toBe("SECRETBASE32");
    // Our PNG, never GoTrue's SVG markup.
    expect(result.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses an account that already has a verified factor (a password alone must not swap the phone)", async () => {
    const { client, mfa } = cookieClient({
      user: { id: "op-1", factors: [VERIFIED] },
      aal: "aal2",
    });
    const result = await startMfaEnrolmentAction(client);
    expect("error" in result && result.error).toMatch(/ya tiene un segundo factor/);
    expect(mfa.enroll).not.toHaveBeenCalled();
  });
});

describe("confirmMfaEnrolmentAction", () => {
  it("verifies the new factor and writes mfa_factor_enrolled for the account itself", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [UNVERIFIED] } });
    const result = await confirmMfaEnrolmentAction(
      client,
      { error: null },
      form({ factorId: "f-new", code: "654321" }),
    );
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-new", code: "654321" });
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "mfa_factor_enrolled",
        actorUserId: "op-1",
        targetUserId: "op-1",
      }),
    );
    expect(result).toEqual({ error: null, next: "/gob" });
  });

  it("writes NO audit row when the code is wrong", async () => {
    const { client } = cookieClient({
      user: { id: "op-1", factors: [UNVERIFIED] },
      verifyError: { message: "Invalid TOTP code entered" },
    });
    const result = await confirmMfaEnrolmentAction(
      client,
      { error: null },
      form({ factorId: "f-new", code: "654321" }),
    );
    expect(result.error).toMatch(/no es correcto/);
    expect(h.writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses to record an 'enrolment' for an account that already has a verified factor", async () => {
    const { client, mfa } = cookieClient({ user: { id: "op-1", factors: [VERIFIED] } });
    await confirmMfaEnrolmentAction(
      client,
      { error: null },
      form({ factorId: "f-ok", code: "654321" }),
    );
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(h.writeAuditLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Admin-assisted recovery
// ---------------------------------------------------------------------------

describe("resetMfaFactorsForAuthority", () => {
  const input = { targetUserId: "op-1", reason: "Perdió el teléfono, verificado por llamada" };

  it("removes every factor of the target and audits the removed ids", async () => {
    h.adminListFactors.mockResolvedValue({
      data: { factors: [VERIFIED, UNVERIFIED] },
      error: null,
    });
    const result = await resetMfaFactorsForAuthority("admin-1", input);
    expect(h.adminDeleteFactor).toHaveBeenCalledWith({ userId: "op-1", id: "f-ok" });
    expect(h.adminDeleteFactor).toHaveBeenCalledWith({ userId: "op-1", id: "f-old" });
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "mfa_factors_reset_by_admin",
        actorUserId: "admin-1",
        targetUserId: "op-1",
        payload: expect.objectContaining({ factor_ids: ["f-ok", "f-old"], complete: true }),
      }),
    );
    expect(result).toEqual({ ok: true, removed: 2 });
  });

  it("refuses an admin resetting THEIR OWN factor", async () => {
    const result = await resetMfaFactorsForAuthority("op-1", input);
    expect("error" in result && result.error).toMatch(/propio segundo factor/);
    expect(h.adminDeleteFactor).not.toHaveBeenCalled();
  });

  it("refuses a non-admin actor", async () => {
    h.loadActorProfile.mockResolvedValue({ ...govtProfile, id: "g-2" });
    const result = await resetMfaFactorsForAuthority("g-2", input);
    expect(result).toEqual({ error: "CAPABILITY_DENIED" });
    expect(h.adminDeleteFactor).not.toHaveBeenCalled();
  });

  it("refuses a personal target and a short motivo", async () => {
    h.targetRows = [{ id: "op-1", accountType: "personal" }];
    expect(await resetMfaFactorsForAuthority("admin-1", input)).toEqual({
      error: "NOT_INSTITUTIONAL",
    });
    expect(
      "error" in (await resetMfaFactorsForAuthority("admin-1", { ...input, reason: "x" })),
    ).toBe(true);
    expect(h.adminDeleteFactor).not.toHaveBeenCalled();
  });

  it("audits what WAS removed when a deletion fails halfway, and says so", async () => {
    h.adminListFactors.mockResolvedValue({
      data: { factors: [VERIFIED, UNVERIFIED] },
      error: null,
    });
    h.adminDeleteFactor
      .mockResolvedValueOnce({ data: { id: "f-ok" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const result = await resetMfaFactorsForAuthority("admin-1", input);
    expect("error" in result).toBe(true);
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ factor_ids: ["f-ok"], complete: false }),
      }),
    );
  });

  it("writes no row when there was nothing to remove", async () => {
    h.adminListFactors.mockResolvedValue({ data: { factors: [] }, error: null });
    expect(await resetMfaFactorsForAuthority("admin-1", input)).toEqual({ ok: true, removed: 0 });
    expect(h.writeAuditLog).not.toHaveBeenCalled();
  });
});
