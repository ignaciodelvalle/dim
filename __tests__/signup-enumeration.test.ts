// Account-enumeration defense tests (audit 28-#3, pilot MED).
//
// Two probe surfaces must NOT reveal whether an email / DNI already exists:
//   1. signupAction        — an existing email must return the SAME shape as a
//      brand-new signup, never a distinguishable "ya existe" message.
//   2. completeIdentityAction — a DNI already held by another account must return
//      the SAME generic error as any other write failure, never "ese DNI ya está
//      registrado por otra cuenta".
//
// Pure mock-based: no DB, no Supabase instance. We drive signUp / getUser / the
// profile UPDATE through mocks and assert the responses are indistinguishable.

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (declared before importing the actions) --------------------------

const mockSignUp = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  })),
}));

// THE PROFILE WRITE, AS IT NOW HAPPENS: one transaction carrying a read, the
// UPDATE (which ends in `RETURNING`) and the audit row.
//
// WHAT THIS DOUBLE USED TO BE, AND WHY IT WENT SILENTLY WRONG (2026-09-05). It
// stopped at `.where()`, and the writer grew a `.returning()` when signup step 2
// moved into `completeIdentityForUser`. Three things then happened at once and
// only one of them was visible:
//
//   · the happy-path case went RED, because `.where()` returned a promise with
//     no `.returning` on it and the resulting TypeError was caught by the
//     writer's own catch and reported as a write failure;
//   · both DNI-enumeration cases went VACUOUSLY GREEN. `mockWhere.mockRejected‐
//     Value(dniUniqueViolation())` was never awaited — `.returning()` threw
//     first — so the 23505 branch these tests exist for was exercised by
//     nothing, and they would have passed with the defence deleted.
//
// So the rejection is driven through `returning` now, which is where the driver
// actually raises a unique violation, and the double models the transaction
// rather than one link of it. `writeAuditLog` is deliberately NOT mocked: it
// runs for real against the `insert` below, which is what keeps this file honest
// about the audit row now sharing the transaction with the DNI write.
const mockWhere = vi.fn();
const mockReturning = vi.fn<() => Promise<unknown[]>>();
const mockAuditValues = vi.fn();

/** The row the UPDATE hands back for a completed profile. */
const UPDATED_ROW = { displayName: "Ana Pérez", role: "owner", accountType: "personal" };

vi.mock("@/db", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ displayName: "ana.perez" }] }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => {
          mockWhere(...args);
          return { returning: () => mockReturning() };
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => ({
        returning: async () => {
          mockAuditValues(values);
          return [{ id: "audit-0001" }];
        },
      }),
    }),
  };
  return {
    db: { transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) },
    profiles: {},
    auditLog: {},
  };
});

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// signupAction now reads request headers (callerIp) for its per-IP rate-limit
// budget. Provide a trusted edge IP so the header read succeeds.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "10.0.0.1" : null),
  })),
}));

// Rate limiter: always allow — enumeration tests exercise the Supabase branch,
// not the budget. Keep RateLimitError / callerIp real.
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: vi.fn(async () => undefined),
  };
});

import { completeIdentityAction, signupAction } from "@/app/actions/auth";

function identityForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("firstName", "Ana");
  fd.set("lastName", "Pérez");
  fd.set("dni", "30111222");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function signupForm(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", "supersecreta");
  fd.set("confirmPassword", "supersecreta");
  fd.set("tosAccepted", "on");
  return fd;
}

// GoTrue's success answer, as `AuthResponse` actually shapes it: `data` is
// always present, and with email confirmations OFF a genuine new signup carries
// a session. The fixture spells that out because the use-case now READS the
// session (a native client needs the tokens) — a mock that answers `{ error:
// null }` and nothing else describes a provider response that cannot occur.
function signUpOk() {
  return {
    data: {
      user: { id: "user-nuevo" },
      session: {
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        expires_at: 1_800_000_000,
        token_type: "bearer",
      },
    },
    error: null,
  };
}

// A postgres-js-shaped unique-violation on the DNI index (drizzle wraps it under
// `.cause`, which pgError would normally unwrap).
function dniUniqueViolation(): Error {
  const pg = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint_name: "profiles_dni_hash_unique",
    detail: "Key (dni_hash)=(abc) already exists.",
  });
  return Object.assign(new Error("Failed query: update profiles ..."), { cause: pg });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-0001" } } });
  mockReturning.mockResolvedValue([UPDATED_ROW]);
});

// ---------------------------------------------------------------------------
// signupAction — email enumeration
// ---------------------------------------------------------------------------

describe("signupAction — email enumeration defense", () => {
  it("returns the success shape for a brand-new email", async () => {
    mockSignUp.mockResolvedValue(signUpOk());
    const result = await signupAction({ error: null }, signupForm("nuevo@example.com"));
    expect(result).toEqual({ error: null, ok: true });
  });

  it("returns the SAME success shape for an already-registered email (no leak)", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "User already registered" } });
    const result = await signupAction({ error: null }, signupForm("existe@example.com"));
    expect(result).toEqual({ error: null, ok: true });
  });

  it("existing vs new email are byte-for-byte indistinguishable", async () => {
    mockSignUp.mockResolvedValueOnce(signUpOk());
    const fresh = await signupAction({ error: null }, signupForm("a@example.com"));
    mockSignUp.mockResolvedValueOnce({ error: { message: "User already registered" } });
    const existing = await signupAction({ error: null }, signupForm("b@example.com"));
    expect(existing).toEqual(fresh);
  });

  it("returns a generic message (never raw Supabase text) for other failures", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "password is too weak: entropy 12" } });
    const result = await signupAction({ error: null }, signupForm("c@example.com"));
    expect(result.error).toMatch(/No pudimos completar el registro/);
    expect(result.error).not.toMatch(/entropy|weak|password/i);
    expect(result.ok).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// completeIdentityAction — DNI enumeration
// ---------------------------------------------------------------------------

describe("completeIdentityAction — DNI enumeration defense", () => {
  it("returns a generic error on a DNI unique violation (does not confirm existence)", async () => {
    mockReturning.mockRejectedValue(dniUniqueViolation());
    const result = await completeIdentityAction({ error: null }, identityForm());
    expect(result.error).toMatch(/No pudimos guardar tus datos/);
    expect(result.error).not.toMatch(/DNI ya está registrado|otra cuenta/i);
    // NON-VACUITY: the rejection has to have been REACHED. Without this the case
    // passes when nothing at all runs, which is exactly how it passed for the
    // length of the `.returning()` regression this file's mock header describes.
    expect(mockReturning).toHaveBeenCalledTimes(1);
  });

  it("returns the SAME generic error for a DNI collision and an unrelated failure", async () => {
    mockReturning.mockRejectedValueOnce(dniUniqueViolation());
    const collision = await completeIdentityAction({ error: null }, identityForm());
    mockReturning.mockRejectedValueOnce(new Error("connection reset"));
    const other = await completeIdentityAction({ error: null }, identityForm());
    // Indistinguishable — an attacker cannot tell a taken DNI from any error.
    expect(collision).toEqual(other);
    // And the raw internal error is never surfaced.
    expect(other.error).not.toMatch(/connection reset/i);
    expect(mockReturning).toHaveBeenCalledTimes(2);
  });

  it("succeeds when the write goes through (no collision)", async () => {
    const result = await completeIdentityAction({ error: null }, identityForm());
    expect(result).toEqual({ error: null, ok: true });
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it("writes the audit row inside the same transaction, carrying no DNI", async () => {
    await completeIdentityAction({ error: null }, identityForm());

    expect(mockAuditValues).toHaveBeenCalledTimes(1);
    const [[values]] = mockAuditValues.mock.calls as [[Record<string, unknown>]];
    expect(values.action).toBe("profile_self_updated");
    // THE DNI NEVER REACHES THE AUDIT ROW, in any form. `audit_log.payload` is
    // free-form jsonb read by operators in `/gob/historial`; a DNI in it would be
    // plaintext PII on a surface the hashing exists to keep it off (invariant #5).
    const serialised = JSON.stringify(values);
    expect(serialised).not.toContain("30111222");
    expect(serialised).not.toContain("dni");
  });

  it("does not write an audit row when the profile write fails", async () => {
    mockReturning.mockRejectedValue(dniUniqueViolation());

    await completeIdentityAction({ error: null }, identityForm());

    // The audit row is written AFTER the update inside the same transaction, so a
    // failed write cannot leave a row claiming a rename that never happened.
    expect(mockAuditValues).not.toHaveBeenCalled();
  });
});
