// `completeIdentityForUser` — the act, with no transport in it.
//
// WHAT THIS FILE IS FOR
// ---------------------------------------------------------------------------
// The route test mocks this function, so nothing there exercises the RULES. Two
// surfaces now write `profiles.display_name` through it — the web's server action
// and `POST /api/v1/me/identity` — and every property that used to be an argument
// in `completeIdentityAction`'s docblock is now a property of THIS function:
//
//   · both halves required and trimmed, judged by the contract's own schema;
//   · one UPDATE, carrying the name, the optional DNI hash and the consent
//     stamp together — never two writes with a window between them;
//   · `COALESCE` on `tos_accepted_at`, so a retry preserves the ORIGINAL instant;
//   · a name that would leave `isIdentityPending` true is REFUSED, not stored;
//   · every driver failure collapses into ONE arm, which is the DNI-enumeration
//     defence (audit 28-#3) and not laziness;
//   · the fresh `MeV1User` comes from the UPDATE's own `RETURNING`, not from a
//     follow-up read that could observe a different row.
//
// Mocked at the driver: what is under test is the SQL this builds and the
// decisions around it, and a live version would need a seeded account per case on
// a shared Supabase.

import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  set: null as null | Record<string, unknown>,
  where: null as unknown,
  returning: [] as unknown[],
  throwOnReturning: null as null | (() => never),
  calls: 0,
}));

vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        control.calls += 1;
        control.set = values;
        return {
          where: (clause: unknown) => {
            control.where = clause;
            return {
              returning: async () => {
                control.throwOnReturning?.();
                return control.returning;
              },
            };
          },
        };
      },
    }),
  },
  profiles: {
    id: { name: "id" },
    displayName: { name: "display_name" },
    role: { name: "role" },
    accountType: { name: "account_type" },
    tosAcceptedAt: { name: "tos_accepted_at" },
  },
}));

import { completeIdentityForUser } from "@/src/modules/auth/application/complete-identity-for-user";

const USER_ID = "0f3f2e4a-2222-4222-8222-abcdefabcdef";
const EMAIL = "ana.perez@example.com";

/** What the UPDATE hands back for a completed row. */
const ROW = { displayName: "Ana Pérez", role: "owner", accountType: "personal" } as const;

function run(overrides: Partial<Parameters<typeof completeIdentityForUser>[0]> = {}) {
  return completeIdentityForUser({
    userId: USER_ID,
    email: EMAIL,
    firstName: "Ana",
    lastName: "Pérez",
    ...overrides,
  });
}

beforeEach(() => {
  control.set = null;
  control.where = null;
  control.returning = [ROW];
  control.throwOnReturning = null;
  control.calls = 0;
});

describe("completeIdentityForUser — the happy path", () => {
  it("stores the two halves joined by a single space", async () => {
    const result = await run();

    expect(result).toEqual({
      ok: true,
      user: {
        profilePending: false,
        id: USER_ID,
        displayName: "Ana Pérez",
        role: "owner",
        accountType: "personal",
      },
    });
    expect(control.set?.displayName).toBe("Ana Pérez");
  });

  it("trims each half before joining", async () => {
    await run({ firstName: "  Ana  ", lastName: "  Pérez  " });
    expect(control.set?.displayName).toBe("Ana Pérez");
  });

  it("writes exactly ONE statement", async () => {
    await run();
    // The name, the consent stamp and (when present) the DNI go together. Two
    // writes would leave a window in which one landed and the other did not.
    expect(control.calls).toBe(1);
  });

  it("records the consent version and COALESCEs the instant", async () => {
    await run();

    expect(control.set?.tosVersion).toBeDefined();
    // Not a plain `new Date()`: a retry must not overwrite the ORIGINAL consent
    // timestamp (Ley 25.326 art. 5), so the value is SQL, not a JS date.
    expect(control.set?.tosAcceptedAt).not.toBeInstanceOf(Date);
    expect(control.set?.updatedAt).toBeInstanceOf(Date);
  });

  it("is idempotent for a profile that is already complete with the same names", async () => {
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);
  });

  it("reports the user built from the row the UPDATE returned, not from its input", async () => {
    // A concurrent writer moved the row. The answer must describe what is stored,
    // which is the whole reason this uses RETURNING instead of trusting its own
    // arithmetic.
    control.returning = [{ displayName: "Ana Pérez", role: "vet", accountType: "institutional" }];

    const result = await run();

    expect(result).toEqual({
      ok: true,
      user: {
        profilePending: false,
        id: USER_ID,
        displayName: "Ana Pérez",
        role: "vet",
        accountType: "institutional",
      },
    });
  });
});

describe("completeIdentityForUser — the DNI", () => {
  it("writes no DNI columns when none is given — the native step's shape", async () => {
    await run();

    expect(control.set).not.toHaveProperty("dniHash");
    expect(control.set).not.toHaveProperty("dniLast4");
  });

  it("hashes the DNI and keeps only the last four in the clear", async () => {
    await run({ dni: "30123456" });

    expect(control.set?.dniLast4).toBe("3456");
    expect(typeof control.set?.dniHash).toBe("string");
    // Invariant #5: no DNI in plaintext, anywhere, ever.
    expect(JSON.stringify(control.set)).not.toContain("30123456");
  });

  it("treats an empty DNI as absent rather than as a value to hash", async () => {
    await run({ dni: "" });
    expect(control.set).not.toHaveProperty("dniHash");
  });
});

describe("completeIdentityForUser — the refusals", () => {
  it.each([
    ["an empty first name", { firstName: "" }, "firstName"],
    ["a whitespace-only first name", { firstName: "   " }, "firstName"],
    ["an empty last name", { lastName: "" }, "lastName"],
    ["a first name past the bound", { firstName: "A".repeat(200) }, "firstName"],
    ["a last name past the bound", { lastName: "P".repeat(200) }, "lastName"],
  ])("refuses %s and writes nothing", async (_label, overrides, field) => {
    const result = await run(overrides);

    expect(result).toEqual({ ok: false, error: "VALIDATION", field });
    expect(control.calls).toBe(0);
  });

  it("refuses a name that would STILL read as the email local part", async () => {
    // Reached through a quoted local part, which is a legal address. The stored
    // value would satisfy `isIdentityPending`, so a 200 here would hand a client
    // `profilePending: false` that `/me` contradicts on the next cold start.
    const result = await completeIdentityForUser({
      userId: USER_ID,
      email: '"ana perez"@example.com',
      firstName: '"ana',
      lastName: 'perez"',
    });

    expect(result).toEqual({ ok: false, error: "STILL_PROVISIONAL" });
    expect(control.calls).toBe(0);
  });

  it("does NOT refuse a real name that merely shares a prefix with the address", async () => {
    const result = await run({ firstName: "Ana", lastName: "Perez" });
    expect(result.ok).toBe(true);
  });

  it("collapses every driver failure into one arm — the DNI-enumeration defence", async () => {
    control.throwOnReturning = () => {
      throw Object.assign(new Error("duplicate key value"), { code: "23505" });
    };

    const result = await run({ dni: "30123456" });

    // Byte-identical to any other write failure. A distinct message would confirm
    // to an authenticated attacker which DNIs already exist (audit 28-#3); the
    // duplicate is still prevented by `profiles_dni_hash_unique`.
    expect(result).toEqual({ ok: false, error: "WRITE_FAILED" });
  });

  it("refuses when no row matched, rather than projecting an undefined row", async () => {
    control.returning = [];

    const result = await run();

    expect(result).toEqual({ ok: false, error: "WRITE_FAILED" });
  });
});
