// POST /api/v1/auth/login and POST /api/v1/auth/signup — the two adapters that
// let a client with no cookie jar establish a session.
//
// WHAT THIS FILE HAS TO PROVE, AND WHY EACH PART EXISTS
// ---------------------------------------------------------------------------
// The use-cases' own behaviour (gate ORDER, fail-closed, the enumeration
// masquerade) is proved without a web request in
// src/modules/auth/application/__tests__/auth-use-cases.test.ts. This file
// proves the things that are the ROUTE's own:
//
//   1. THE ENVELOPE. Status codes, the single-key `{ error }` body, and
//      `cache-control: no-store` on EVERY branch. §4: no-store is NOT inherited
//      — middleware stamps it from a path-prefix allowlist `/api/…` is not on —
//      so a test that checks the happy path only would certify exactly the
//      branch nobody forgets. These bodies carry session TOKENS.
//   2. NON-ENUMERATION AS EQUALITY. An unknown email and a wrong password must
//      produce the same status, the same body AND the same headers. Asserted as
//      one equality, not as two "looks generic enough" checks.
//   3. THE SHARED BUDGET. The bucket names and keys this route spends are the
//      form's — `auth_login_ip` and `auth_login_email` keyed on the SHA-256 of
//      the normalized email. If they ever diverge, an attacker gets a second
//      budget by switching transport, and nothing else in the suite would see
//      it.
//   4. THE WIRE SHAPE a native client consumes: camelCase, `expiresAt` in
//      SECONDS, and no web landing path anywhere in the payload.
//
// HOW THE MOCKING WORKS
// ---------------------------------------------------------------------------
// GoTrue is replaced (there is no local user to sign in as, and the point here
// is the mapping, not Supabase's password check). EVERYTHING ELSE IS REAL: the
// real schemas, the real use-cases, the real profile and membership queries
// against the local database — a random UUID simply resolves to no rows, which
// is the "brand new account" path. The limiter is mocked to a no-op by default
// so the routes do not write counters for every case; the cases that are ABOUT
// the limiter drive it explicitly.

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  /** GoTrue's answer for the next call. */
  answer: null as null | Record<string, unknown>,
  /** Every collaborator the route reached, in order. */
  calls: [] as string[],
  /** Buckets + keys handed to the limiter, in order. */
  limits: [] as Array<{ endpoint: string; identifier: string }>,
  /**
   * The CEILINGS handed to the limiter, in order — recorded separately from
   * `limits` so the existing `toEqual` assertions on bucket+key keep their
   * exact shape. This is what catches a call site that goes back to writing an
   * object literal instead of spending the derived constant.
   */
  limitConfigs: [] as unknown[],
  /** When set, the limiter throws it. */
  limiterThrows: null as null | (() => never),
}));

vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => {
    control.calls.push("anon-client");
    return {
      auth: {
        signInWithPassword: async () => {
          control.calls.push("signInWithPassword");
          return control.answer;
        },
        signUp: async () => {
          control.calls.push("signUp");
          return control.answer;
        },
        signOut: async () => {
          control.calls.push("signOut");
          return { error: null };
        },
      },
    };
  },
}));

vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: async (endpoint: string, identifier: string, config: unknown) => {
      control.limits.push({ endpoint, identifier });
      control.limitConfigs.push(config);
      control.limiterThrows?.();
    },
  };
});

import { RateLimitError, emailRateLimitKey } from "@/lib/infra/rate-limit";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_SIMULTANEOUS_CALLERS,
} from "@/src/modules/auth/application/login-limits";

import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as signupRoute } from "@/app/api/v1/auth/signup/route";

const IP = "203.0.113.7";

const GOTRUE_SESSION = {
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
  expires_in: 3600,
  expires_at: 1_800_000_000,
  token_type: "bearer",
};

function post(path: string, body: unknown, init?: { raw?: string }) {
  return new Request(`http://localhost:3000/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": IP },
    body: init?.raw ?? JSON.stringify(body),
  });
}

/** Status + body + the headers a client can observe, as one comparable value. */
async function fingerprint(res: Response) {
  return {
    status: res.status,
    body: await res.json(),
    cacheControl: res.headers.get("cache-control"),
    contentType: res.headers.get("content-type"),
    retryAfter: res.headers.get("retry-after"),
  };
}

beforeEach(() => {
  control.answer = null;
  control.calls = [];
  control.limits = [];
  control.limitConfigs = [];
  control.limiterThrows = null;
});

// ---------------------------------------------------------------------------
// The envelope, on every branch
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/login — the envelope", () => {
  it("sets cache-control: no-store on a REFUSAL as well as a success", async () => {
    // A login response carries either a reason to retry or a pair of session
    // tokens. Neither may ever sit in a shared cache.
    control.answer = { data: { user: null, session: null }, error: { message: "Invalid" } };
    const refusal = await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));
    expect(refusal.headers.get("cache-control")).toBe("no-store");

    control.answer = {
      data: { user: { id: randomUUID() }, session: GOTRUE_SESSION },
      error: null,
    };
    const success = await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(success.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("answers invalid_request for a body that is not JSON at all", async () => {
    const res = await loginRoute(post("/auth/login", null, { raw: "not json{" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    // A malformed body costs the platform no counter, and reveals nothing.
    expect(control.limits).toEqual([]);
    expect(control.calls).toEqual([]);
  });

  it("answers invalid_request when the body misses a required field", async () => {
    const res = await loginRoute(post("/auth/login", { email: "a@b.co" }));
    expect(res.status).toBe(400);
    // Single-key envelope (§2): no field detail. The client validated with the
    // same schema before sending and already has per-field codes locally.
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });
});

// ---------------------------------------------------------------------------
// Non-enumeration
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/login — refusals are not an oracle", () => {
  it("answers an unknown email and a wrong password IDENTICALLY", async () => {
    // Same status, same body, same headers. Two hand-written generic messages
    // drift apart; one equality assertion cannot.
    control.answer = {
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    };
    const unknownEmail = await fingerprint(
      await loginRoute(post("/auth/login", { email: "nadie@example.com", password: "x" })),
    );

    control.answer = {
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    };
    const wrongPassword = await fingerprint(
      await loginRoute(post("/auth/login", { email: "existe@example.com", password: "mala" })),
    );

    expect(unknownEmail).toEqual(wrongPassword);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual({ error: "invalid_credentials" });
  });

  it("never leaks the submitted email back in the body", async () => {
    // The web form echoes the email so React 19's post-action reset does not
    // wipe it. There is no form here, and a body that repeated the address
    // would make a 401 quotable as proof somebody tried that account.
    control.answer = { data: { user: null, session: null }, error: { message: "Invalid" } };
    const res = await loginRoute(
      post("/auth/login", { email: "secreto@example.com", password: "x" }),
    );
    expect(JSON.stringify(await res.json())).not.toContain("secreto@example.com");
  });

  it("carries NO retry-after on the 429 — only one branch could be honest", async () => {
    control.limiterThrows = () => {
      throw new RateLimitError(new Date(), "auth_login_ip");
    };
    const res = await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    // A header on the per-IP branch and not the per-email one would make the
    // two 429s distinguishable (api-invariants.md §10).
    expect(res.headers.get("retry-after")).toBeNull();
    // And GoTrue was never reached — not even the client was built.
    expect(control.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The shared budget
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/login — the budget is the web form's", () => {
  it("spends auth_login_ip then auth_login_email, keyed on IP and the HASHED email", async () => {
    control.answer = { data: { user: null, session: null }, error: { message: "Invalid" } };
    await loginRoute(post("/auth/login", { email: "  ANA@Example.com ", password: "x" }));

    // Identical buckets and identical keys to the form's. This is what stops an
    // attacker from getting a fresh budget by switching transport — and the
    // only place in the suite where that equivalence is checked from the API
    // side.
    expect(control.limits).toEqual([
      { endpoint: "auth_login_ip", identifier: IP },
      { endpoint: "auth_login_email", identifier: emailRateLimitKey("ana@example.com") },
    ]);
    // The raw address never becomes a bucket key: rate_limit_buckets is
    // readable by every worker and an email is PII (Ley 25.326).
    expect(control.limits[1]?.identifier).not.toContain("ana@example.com");
  });

  it("keys the per-IP budget on the trusted edge IP, not a spoofable one", async () => {
    control.answer = { data: { user: null, session: null }, error: { message: "Invalid" } };
    const req = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The FIRST x-forwarded-for segment is client-controlled. callerIp
        // takes the LAST hop, and x-real-ip outranks both.
        "x-forwarded-for": "1.2.3.4, 198.51.100.9",
      },
      body: JSON.stringify({ email: "a@b.co", password: "x" }),
    });
    await loginRoute(req);
    expect(control.limits[0]).toEqual({ endpoint: "auth_login_ip", identifier: "198.51.100.9" });
  });

  it("spends the derived ceilings themselves, not a literal at the call site", async () => {
    // The two ceilings lived as object literals inside `login.ts` until the
    // per-IP one was re-derived (see login-limits.ts). A literal at the call
    // site is how the old number got to be twice the per-email one without ever
    // meeting an argument, so the route is held to spending the CONSTANTS —
    // which is what makes the relationship assertions below mean anything about
    // what actually runs, rather than about two numbers nobody reads.
    //
    // `toBe` AND NOT `toEqual`, WHICH IS THE ENTIRE ASSERTION. This test claimed
    // to catch "a call site that went back to an object literal" while comparing
    // STRUCTURALLY, so `{ maxPerMinute: 60, maxPerHour: 240 }` re-inlined in
    // `login.ts` passed it — the exact edit the test names, sailing through the
    // test that names it. Identity is what "spends the CONSTANT" means: the
    // limiter records the object it was handed, so only the shared reference
    // satisfies this. A re-inlined literal now fails on the first spend.
    control.answer = { data: { user: null, session: null }, error: { message: "Invalid" } };
    await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));

    expect(control.limitConfigs).toHaveLength(2);
    expect(control.limitConfigs[0]).toBe(LOGIN_IP_LIMIT);
    expect(control.limitConfigs[1]).toBe(LOGIN_EMAIL_LIMIT);
  });

  it("keeps the per-EMAIL anchor where the brute-force argument put it", async () => {
    // The non-vacuity floor for the two assertions after this one. They are
    // equalities against a product, and `0 === 0 * 12` is true — an anchor
    // silently zeroed would make both of them pass while the ceiling they
    // describe collapsed. It is also the assertion a change to the per-account
    // brute-force ceiling has to walk past on purpose: this bucket is what
    // stops a distributed attack on ONE account, and it is spent on failed
    // attempts too.
    expect(LOGIN_EMAIL_LIMIT.maxPerMinute).toBe(5);
    expect(LOGIN_EMAIL_LIMIT.maxPerHour).toBe(20);
  });

  it("sizes the per-IP ceiling at N callers at their own per-email ceiling, per MINUTE", async () => {
    // The IP bucket's only job is to stay far enough above the email bucket that
    // the EMAIL one is the binding constraint for any plausible crowd behind one
    // address. At the old 10/min it was not: two people at their own ceiling
    // exhausted the whole gateway, which is the shape api-v1-limits.ts named as
    // upside down for the authenticated-write family and fixed there first.
    expect(LOGIN_IP_LIMIT.maxPerMinute).toBe(
      (LOGIN_EMAIL_LIMIT.maxPerMinute ?? 0) * LOGIN_SIMULTANEOUS_CALLERS,
    );
  });

  it("sizes it at the same N per HOUR, and pins that window separately", async () => {
    // PINNED SEPARATELY on purpose, the way password-reset's pair is: the two
    // windows are only multiplied by the same factor here because login's
    // per-email anchor happens to have both. A reader who assumes one factor is
    // structural would "tidy" one of these away, and the hour is the window a
    // whole nightly run — or a whole carrier at 03:00 — actually spends.
    expect(LOGIN_IP_LIMIT.maxPerHour).toBe(
      (LOGIN_EMAIL_LIMIT.maxPerHour ?? 0) * LOGIN_SIMULTANEOUS_CALLERS,
    );
  });
});

// ---------------------------------------------------------------------------
// The wire shape
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/login — what a native client receives", () => {
  it("reports profilePending — it does NOT fabricate a role — for an account with no profile row", async () => {
    const userId = randomUUID();
    control.answer = { data: { user: { id: userId }, session: GOTRUE_SESSION }, error: null };

    const res = await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      // THE REGRESSION THIS PINS (pre-push review of the WU-A range). A UUID with
      // no profile row is the brand-new-account path, and it is the NORMAL state
      // of a native user: signup parks them there because identity completion has
      // no /api/v1 door yet. This endpoint used to answer `role: "owner"` for it —
      // the use-case's LANDING default, which exists to pick a web destination —
      // while `GET /api/v1/me`, for the same account in the same second, answered
      // `profilePending: true` and deliberately declined to name a role. Two
      // endpoints, one account, two answers, and the guess came first.
      //
      // `user` is now `MeV1User` on both, so a client writes ONE exhaustive
      // switch. The real profile lookup is the use-case's and is exercised
      // against seeded rows in __tests__/auth-actions.test.ts.
      user: { profilePending: true, id: userId },
      session: {
        accessToken: "access-token-value",
        refreshToken: "refresh-token-value",
        expiresIn: 3600,
        // SECONDS, GoTrue's unit. A silent conversion to milliseconds is a bug
        // that only surfaces at the moment a session should have been refreshed.
        expiresAt: 1_800_000_000,
        tokenType: "bearer",
      },
    });
  });

  it("carries NO web landing path — a native client owns its navigation", async () => {
    control.answer = {
      data: { user: { id: randomUUID() }, session: GOTRUE_SESSION },
      error: null,
    };
    const res = await loginRoute(
      // Even when the caller supplies one. `returnTo` is the form's N3 hint and
      // is deliberately not forwarded; shipping it would invite a native app to
      // hard-code "/inicio".
      post("/auth/login", { email: "a@b.co", password: "x", returnTo: "/mascotas" }),
    );
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("redirectTo");
    expect(body).not.toContain("landingPath");
    expect(body).not.toContain("/mascotas");
  });

  it("refuses rather than returning a 200 with no session", async () => {
    // Impossible per GoTrue's own types. A 200 carrying `session: null` would
    // be a "success" a native client cannot act on — there is no cookie here to
    // have quietly carried the credential.
    control.answer = { data: { user: { id: randomUUID() }, session: null }, error: null };
    const res = await loginRoute(post("/auth/login", { email: "a@b.co", password: "x" }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "temporarily_unavailable" });
    expect(res.headers.get("retry-after")).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/signup", () => {
  const VALID = {
    email: "nueva@example.com",
    password: "supersecreta",
    confirmPassword: "supersecreta",
    tosAccepted: true,
  };

  it("answers 201 with the session for a genuine new account", async () => {
    control.answer = {
      data: { user: { id: randomUUID() }, session: GOTRUE_SESSION },
      error: null,
    };
    const res = await signupRoute(post("/auth/signup", VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      session: {
        accessToken: "access-token-value",
        refreshToken: "refresh-token-value",
        expiresIn: 3600,
        expiresAt: 1_800_000_000,
        tokenType: "bearer",
      },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(control.limits).toEqual([{ endpoint: "auth_signup_ip", identifier: IP }]);
  });

  it("answers 201 with session:null for an email that already exists", async () => {
    // The masquerade. A distinguishable "ya existe" is the account-enumeration
    // oracle audit 28-#3 closed on the web form; the status and the key set are
    // the same as a genuine signup's, so a client cannot branch on existence.
    control.answer = {
      data: { user: null, session: null },
      error: { message: "User already registered" },
    };
    const res = await signupRoute(post("/auth/signup", { ...VALID, email: "existe@example.com" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ session: null });
  });

  it("never surfaces the provider's own text on any other failure", async () => {
    control.answer = {
      data: { user: null, session: null },
      error: { message: "password is too weak: entropy 12" },
    };
    const res = await signupRoute(post("/auth/signup", VALID));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "signup_failed" });
  });

  it("rejects an unaccepted TOS before spending anything", async () => {
    // A legal acceptance is never defaulted into being, and the schema is where
    // that is enforced for both transports.
    const res = await signupRoute(post("/auth/signup", { ...VALID, tosAccepted: false }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(control.limits).toEqual([]);
    expect(control.calls).toEqual([]);
  });

  it("answers 429 without reaching GoTrue when the per-IP budget refuses", async () => {
    control.limiterThrows = () => {
      throw new RateLimitError(new Date(), "auth_signup_ip");
    };
    const res = await signupRoute(post("/auth/signup", VALID));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(control.calls).toEqual([]);
  });
});
