// The session store's failure paths — the ones auth-js reaches by THROWING.
//
// WHY THESE AND NOT THE HAPPY PATH
// ---------------------------------------------------------------------------
// auth-js 2.105.4 rethrows anything that is not an AuthError: `_setSession`
// (GoTrueClient.js:2849-2854) and `_callRefreshToken` (:3935-3936) both end in
// `throw error` for a non-AuthError. A failure coming out of `expo-secure-store`
// is a plain `Error`. So the Keystore failure this module has an es-AR message
// for did not arrive as `{ error }` — it arrived as a rejected promise, and the
// branch that names it was unreachable for exactly the case it names.
//
// Every one of these failures is a screen that never comes back: a sign-in
// button stuck on "Ingresando…", a splash that never resolves, a spinner behind
// `void load()`. None of them is visible in a type and none of them shows up in
// a happy-path test, which is why they get their own file.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
// The REAL error classes, not hand-rolled stand-ins: `isAuthRetryableFetchError`
// matches on `isAuthError(e) && e.name === "AuthRetryableFetchError"`, so a fake
// with the right shape would pin the fake. `@supabase/supabase-js` re-exports
// everything from `@supabase/auth-js` (dist/index.d.mts: `export * from`).
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

// The `mock` prefix is load-bearing, not a naming preference: babel-plugin-jest-
// hoist lifts `jest.mock` factories above the imports and refuses any factory
// that closes over an out-of-scope variable — except one whose name begins with
// `mock`. Without the prefix this file fails to TRANSFORM, with an error about
// the factory rather than about the test.
type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockAuth: Record<"getSession" | "setSession" | "refreshSession" | "signOut", AsyncMock> = {
  getSession: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  setSession: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  refreshSession: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  signOut: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};

const mockDropLocalSession: AsyncMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockForgetAllCachedCredentials: AsyncMock =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLogin: AsyncMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchMe: AsyncMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSignup: AsyncMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCompleteIdentity: AsyncMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const mockReadStoredSession = jest.fn<() => Promise<string | null>>();
const mockRestoreStoredSession = jest.fn<(raw: string) => Promise<void>>();

jest.mock("./supabase-auth", () => ({
  AUTH_STORAGE_KEY: "mimar.auth.session",
  authClient: () => ({ auth: mockAuth }),
  dropLocalSession: () => mockDropLocalSession(),
  readStoredSession: () => mockReadStoredSession(),
  restoreStoredSession: (raw: string) => mockRestoreStoredSession(raw),
}));

jest.mock("../credential/credential-cache", () => ({
  forgetAllCachedCredentials: () => mockForgetAllCachedCredentials(),
}));

jest.mock("../api/endpoints", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  completeIdentity: (...args: unknown[]) => mockCompleteIdentity(...args),
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  signup: (...args: unknown[]) => mockSignup(...args),
  revokeAllSessions: () => Promise.resolve({ outcome: "ok", payload: { revoked: true } }),
}));

import {
  SESSION_SERVER_UNAVAILABLE_MESSAGE,
  SESSION_UNREACHABLE_MESSAGE,
  bootstrapSession,
  completeIdentity,
  getSessionState,
  sessionPort,
  signIn,
  signOut,
  signUp,
} from "./session-store";

const LOGIN_OK = {
  outcome: "ok" as const,
  payload: {
    session: { accessToken: "at", refreshToken: "rt" },
    user: {
      id: "user-001",
      displayName: "Ana",
      role: "owner" as const,
      accountType: "personal" as const,
      profilePending: false,
    },
  },
};

/** The shape expo-secure-store failures actually have: a plain Error. */
const KEYSTORE_FAILURE = new Error("SecureStore: could not write value");

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.setSession.mockResolvedValue({ data: {}, error: null });
  mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
  mockDropLocalSession.mockResolvedValue(undefined);
  mockForgetAllCachedCredentials.mockResolvedValue(undefined);
  mockLogin.mockResolvedValue(LOGIN_OK);
  mockFetchMe.mockResolvedValue({ outcome: "ok", payload: { user: LOGIN_OK.payload.user } });
  mockSignup.mockResolvedValue({
    outcome: "ok",
    payload: { session: { accessToken: "at", refreshToken: "rt" } },
  });
  // A keystore with nothing in it is the DEFAULT, so every pre-existing test
  // keeps reading "this device is signed out" exactly as it did.
  mockReadStoredSession.mockResolvedValue(null);
  mockRestoreStoredSession.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// signIn — the write path
// ---------------------------------------------------------------------------

describe("signIn — a Keystore write that THROWS", () => {
  it("returns the storage message instead of rejecting", async () => {
    mockAuth.setSession.mockRejectedValue(KEYSTORE_FAILURE);

    // The assertion is that this RESOLVES. Before the fix it rejected, the
    // screen's `submit()` had no catch, and `setBusy(false)` never ran — the
    // button stayed "Ingresando…" with no way forward.
    const result = await signIn("ana@dim.test", "hunter2");

    expect(result).toEqual({
      ok: false,
      message: "Iniciaste sesión, pero no pudimos guardarla en este dispositivo. Probá de nuevo.",
    });
  });

  it("reaches the same REFUSAL as an AuthError, and says a different thing", async () => {
    // THIS CASE USED TO ASSERT THE OPPOSITE, and its premise was wrong. It read
    // `expect(viaThrow).toEqual(viaError)` under "the library reports the same
    // condition two different ways ... and the user must not be able to tell".
    //
    // They are not the same condition. `setSession` calls `_getUser` over the
    // network BEFORE it saves anything (GoTrueClient.js:2835, `_saveSession` at
    // :2847), so a RETURNED AuthError means the server refused and storage was
    // never reached — while a REJECTED promise is the storage failure, because
    // auth-js rethrows non-AuthErrors (:2849-2854).
    //
    // What the collapse cost, on 2026-08-30: an app pointed at local Supabase
    // while `API_BASE_URL` still defaulted to staging signed in at staging and
    // handed a staging-signed token to local GoTrue, which answered
    // `invalid JWT: unrecognized JWT kid`. The screen blamed "este dispositivo",
    // and it was written up as an unexplained Keystore fault — an emulator PIN
    // tried and refuted, `adb logcat` searched for SecureStore lines that could
    // not exist, because that code never ran.
    mockAuth.setSession.mockResolvedValue({ data: {}, error: { message: "invalid session" } });
    const viaError = await signIn("ana@dim.test", "hunter2");

    mockAuth.setSession.mockRejectedValue(KEYSTORE_FAILURE);
    const viaThrow = await signIn("ana@dim.test", "hunter2");

    // Both still REFUSE — that half was right and is not being loosened.
    expect(viaError.ok).toBe(false);
    expect(viaThrow.ok).toBe(false);

    // But they name different subsystems, and only the throw names the device.
    expect(viaError).toEqual({
      ok: false,
      // NOT "en este dispositivo": the device is the one subsystem provably not
      // involved on the returned-error path (2026-09-01 review, finding 3a).
      message: "Iniciaste sesión, pero el servidor no aceptó la sesión. Probá de nuevo.",
    });
    expect(viaThrow).toEqual({
      ok: false,
      message: "Iniciaste sesión, pero no pudimos guardarla en este dispositivo. Probá de nuevo.",
    });
    expect(viaThrow).not.toEqual(viaError);
  });

  it("cleans up on the SERVER-refused shape too, not just on the throw", async () => {
    // The split must not turn one of the two into a softer path: a session the
    // server refused is as unusable as one that failed to store, so both clear.
    mockAuth.setSession.mockResolvedValue({ data: {}, error: { message: "invalid session" } });

    await signIn("ana@dim.test", "hunter2");

    expect(mockDropLocalSession).toHaveBeenCalledTimes(1);
    expect(getSessionState().phase).not.toBe("signed-in");
  });

  it("names the NETWORK for auth-js's retryable shape — not the server, not the device", async () => {
    // The THIRD shape, measured by the 2026-09-01 pre-push review: a fetch that
    // never reaches a server comes back as AuthRetryableFetchError — RETURNED,
    // not thrown (auth-js lib/fetch.js:33-40 wraps it, GoTrueClient.js:2836
    // returns it). Under the old two-way split it read as "el servidor no
    // aceptó", sending the reader to auth configuration when the actual fault
    // was the Supabase plane being unreachable — the WinNAT/container-down
    // class this repo's own memory documents. The guard is the library's own
    // (`__isAuthError` + name), so this fake is the exact shape it tests for.
    mockAuth.setSession.mockResolvedValue({
      data: {},
      error: { __isAuthError: true, name: "AuthRetryableFetchError", message: "fetch failed" },
    });

    const result = await signIn("ana@dim.test", "hunter2");

    expect(result).toEqual({
      ok: false,
      message:
        "Iniciaste sesión, pero no pudimos confirmarla con el servidor. Revisá tu conexión y probá de nuevo.",
    });
    // Same cleanup as every other refusal — a half-usable session must not
    // survive to the next cold start.
    expect(mockDropLocalSession).toHaveBeenCalledTimes(1);
    expect(getSessionState().phase).not.toBe("signed-in");
  });

  it("cleans up so a half-stored session cannot survive to the next cold start", async () => {
    mockAuth.setSession.mockRejectedValue(KEYSTORE_FAILURE);

    await signIn("ana@dim.test", "hunter2");

    expect(mockDropLocalSession).toHaveBeenCalledTimes(1);
    expect(getSessionState().phase).not.toBe("signed-in");
  });

  it("still refuses when even the CLEANUP throws", async () => {
    // A Keystore broken enough to fail a write can fail a delete. The recovery
    // path must not turn one failure into a second, thrown one.
    mockAuth.setSession.mockRejectedValue(KEYSTORE_FAILURE);
    mockDropLocalSession.mockRejectedValue(new Error("SecureStore: delete failed"));
    mockAuth.signOut.mockRejectedValue(new Error("network down"));

    const result = await signIn("ana@dim.test", "hunter2");

    expect(result.ok).toBe(false);
  });

  it("signs in normally when the write succeeds", async () => {
    // The control. Without it the tests above would pass on a function that
    // always failed.
    const result = await signIn("ana@dim.test", "hunter2");

    expect(result).toEqual({ ok: true });
    expect(getSessionState()).toEqual({ phase: "signed-in", user: LOGIN_OK.payload.user });
  });

  it("clears the shared device's display cache on the way IN", async () => {
    await signIn("ana@dim.test", "hunter2");

    // A family phone. The next person must not find the previous owner's
    // animals in the offline cache — and since `clearSession` now swallows a
    // failed clear, the sign-in is the second place that guarantees it.
    expect(mockForgetAllCachedCredentials).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sessionPort — the read paths, called from inside the fetch wrapper
// ---------------------------------------------------------------------------

describe("sessionPort — a keychain that will not answer", () => {
  it("accessToken() returns null rather than rejecting a request", async () => {
    mockAuth.getSession.mockRejectedValue(KEYSTORE_FAILURE);

    // `client.ts` calls this from inside a request a screen kicked off with
    // `void load()`. A throw here is a spinner that never stops.
    await expect(sessionPort.accessToken()).resolves.toBeNull();
  });

  it("refreshAccessToken() answers 'refused' rather than rejecting", async () => {
    // `_callRefreshToken` rethrows non-AuthErrors, so a Keystore write failure
    // during token ROTATION lands here and not in `error`. It is a DEVICE
    // failure: retrying the same call fails the same way, so it is not the
    // "unreachable" arm — see RefreshOutcome.
    mockAuth.refreshSession.mockRejectedValue(KEYSTORE_FAILURE);

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  // -------------------------------------------------------------------------
  // A REFRESH THAT NEVER REACHED A SERVER IS NOT A DEAD SESSION (QA batch 2, D7)
  //
  // auth-js RETURNS a network-level failure as `AuthRetryableFetchError`
  // (lib/fetch.js:33-40) instead of throwing it, so `{ error }` covers both
  // "GoTrue refused this refresh token" and "the request never got there". This
  // port answered `null` for both and `apiRequest` ended the session for both —
  // a forced re-login over a dead spot, holding a refresh token nobody had
  // revoked. `signIn` in the same file has drawn this line since 2026-09-01.
  // -------------------------------------------------------------------------
  it("reports 'unreachable' for a refresh that never reached a server", async () => {
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("reports 'refused' for a refresh the server examined and rejected", async () => {
    // The shape GoTrue produces for a rotated or revoked refresh token: a plain
    // AuthError, not the retryable one. This session really is over.
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError(
        "Invalid Refresh Token: Already Used",
        400,
        "refresh_token_already_used",
      ),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
  });

  it("hands back the rotated token when the refresh works", async () => {
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: { access_token: "rotated-token" } },
      error: null,
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: true,
      token: "rotated-token",
    });
  });

  it("still reads a token when the keychain is healthy", async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: "live-token" } },
      error: null,
    });

    await expect(sessionPort.accessToken()).resolves.toBe("live-token");
  });
});

// ---------------------------------------------------------------------------
// bootstrapSession — the splash screen
// ---------------------------------------------------------------------------

describe("bootstrapSession — a cold start on a broken keychain", () => {
  it("lands on signed-out instead of leaving the store at `starting`", async () => {
    mockAuth.getSession.mockRejectedValue(KEYSTORE_FAILURE);

    // The root layout calls this as `void bootstrapSession()`. A rejection
    // leaves the phase at `starting` forever — a splash with no way out and
    // nothing to retry from.
    await bootstrapSession();

    expect(getSessionState()).toEqual({ phase: "signed-out", reason: null });
  });

  it("verifies the identity when there IS a stored session", async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: "live-token" } },
      error: null,
    });

    await bootstrapSession();

    expect(mockFetchMe).toHaveBeenCalledTimes(1);
    expect(getSessionState().phase).toBe("signed-in");
  });
});

// ---------------------------------------------------------------------------
// A1-entrada-01 / A6-cuenta-resiliencia-01 — THE SUBWAY COLD START
//
// An access token past its expiry makes `getSession()` refresh before it
// answers, and a refresh that cannot reach GoTrue answers `{ session: null }`.
// That is byte-identical, at the call site, to a phone nobody ever signed in on
// — and the app read it as the second: sign-in screen, password please, over a
// network that could not have checked one.
// ---------------------------------------------------------------------------

describe("bootstrapSession — tokens on the device, server unreachable", () => {
  it("expired token, refresh unreachable → session-unverified", async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });

    await bootstrapSession();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_UNREACHABLE_MESSAGE,
    });
    // The tokens are NOT dropped: there is nothing wrong with them.
    expect(mockDropLocalSession).not.toHaveBeenCalled();
  });

  it("uses the keystore as the tiebreaker when auth-js reports no error at all", async () => {
    // The shape the RETURNED error does not cover: a version or a path that
    // swallows its own refresh failure and answers `{ session: null, error:
    // null }`. The raw key is the only remaining witness that this device has a
    // session, and it is what tells "never signed in" from "could not check".
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockReadStoredSession.mockResolvedValue('{"refresh_token":"rt"}');

    await bootstrapSession();

    expect(getSessionState().phase).toBe("session-unverified");
  });

  it("still signs out a device that really has no session", async () => {
    // THE CONTROL. Without it the two above would pass on a function that never
    // signs anybody out — which would be its own bug, and a worse one.
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await bootstrapSession();

    expect(getSessionState()).toEqual({ phase: "signed-out", reason: null });
  });
});

// ---------------------------------------------------------------------------
// A1-entrada-02 — A 503 IS NOT A DEAD SESSION
// ---------------------------------------------------------------------------

describe("bootstrapSession — /me refuses for a reason that is not about the session", () => {
  beforeEach(async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: "live-token" } },
      error: null,
    });
    // A LIVE SESSION AS THE STARTING POINT, because the store is module state and
    // the phase it is IN is part of what these arms read: `markSessionUnverified`
    // refuses to overwrite `signed-out`, which is what keeps `apiRequest`'s
    // reason ("tu turno de trabajo terminó") from being replaced by "revisá tu
    // conexión". A test left signed-out by the file above would exercise that
    // guard instead of this arm.
    await signIn("ana@dim.test", "hunter2");
  });

  it("routes a 503 to session-unverified instead of the sign-in screen", async () => {
    mockFetchMe.mockResolvedValue({
      outcome: "api-error",
      code: "temporarily_unavailable",
      retryAfterSeconds: null,
    });

    await bootstrapSession();

    expect(getSessionState().phase).toBe("session-unverified");
  });

  it("honours retry-after on a 429, in the message", async () => {
    mockFetchMe.mockResolvedValue({
      outcome: "api-error",
      code: "rate_limited",
      retryAfterSeconds: 30,
    });

    await bootstrapSession();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: "Demasiadas consultas. Probá de nuevo en 30 segundos.",
    });
  });

  it("still signs out for a code that DOES mean the session is over", async () => {
    // The control for the split. `auth_required` is in `sessionEndingReason`'s
    // list in client.ts, and the two lists must agree.
    mockFetchMe.mockResolvedValue({
      outcome: "api-error",
      code: "auth_required",
      retryAfterSeconds: null,
    });

    await bootstrapSession();

    expect(getSessionState()).toEqual({ phase: "signed-out", reason: null });
  });

  // -------------------------------------------------------------------------
  // lote 1b F5 — A SYNTHESIZED `auth_required` IS NOT A SERVER VERDICT
  //
  // `apiRequest` answers `{ outcome: "api-error", code: "auth_required" }`
  // whenever `accessToken()` hands it a null token, WITHOUT ending anything and
  // without a status behind it. But `accessToken()` may have just set
  // `session-unverified` on its way out — so the code that means "the server saw
  // no bearer" arrived on a store that had just said "we could not reach the
  // server", and the guard only skipped `signed-out`. The person landed on the
  // sign-in screen with no sentence explaining why.
  // -------------------------------------------------------------------------
  it("keeps 'we could not check' instead of a blank sign-in screen", async () => {
    mockFetchMe.mockImplementation(async () => {
      // What `apiRequest` does first, and what it does with the null it gets.
      mockAuth.getSession.mockResolvedValue({
        data: { session: null },
        error: new AuthRetryableFetchError("network request failed", 0),
      });
      await sessionPort.accessToken();
      return { outcome: "api-error", code: "auth_required", retryAfterSeconds: null };
    });

    await bootstrapSession();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_UNREACHABLE_MESSAGE,
    });
  });
});

// ---------------------------------------------------------------------------
// A1-refuter-M1 / A6-refuter-M1 — A NULL TOKEN IS NOT ONE FACT
// ---------------------------------------------------------------------------

describe("sessionPort.accessToken — what a null token means", () => {
  it("ends the session when the refresh was REFUSED, so the gate can show sign-in", async () => {
    await signIn("ana@dim.test", "hunter2");
    expect(getSessionState().phase).toBe("signed-in");

    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    });

    await expect(sessionPort.accessToken()).resolves.toBeNull();

    // Before: the store stayed `signed-in` and every screen rendered
    // "Necesitás iniciar sesión" with no way to do it — the gate never saw a
    // state to redirect on.
    expect(getSessionState()).toEqual({ phase: "signed-out", reason: "auth_expired" });
  });

  it("says 'we could not check' when the refresh was UNREACHABLE, and keeps the tokens", async () => {
    await signIn("ana@dim.test", "hunter2");

    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });

    await expect(sessionPort.accessToken()).resolves.toBeNull();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_UNREACHABLE_MESSAGE,
    });
    expect(mockDropLocalSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lote 1b F1 / F8 — THE ARM THAT DELETES THINGS
//
// `accessToken()`'s refused arm runs `clearSession()`, which drops the tokens
// AND calls `forgetAllCachedCredentials()`. Every status the old denylist did
// not name landed there, so the offline credential cache this whole batch
// exists to make reachable was destroyed by a rate limit.
// ---------------------------------------------------------------------------

describe("sessionPort.accessToken — a rate limit must not end the session", () => {
  it("keeps the tokens AND the credential cache when GoTrue answers 429", async () => {
    await signIn("ana@dim.test", "hunter2");
    mockDropLocalSession.mockClear();
    mockForgetAllCachedCredentials.mockClear();

    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Too Many Requests", 429, "over_request_rate_limit"),
    });

    await expect(sessionPort.accessToken()).resolves.toBeNull();

    // NOT signed-out: a per-IP limit — a clinic, a municipal office, CGNAT —
    // says nothing whatsoever about the tokens on this phone.
    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_SERVER_UNAVAILABLE_MESSAGE,
    });
    expect(mockDropLocalSession).not.toHaveBeenCalled();
    expect(mockForgetAllCachedCredentials).not.toHaveBeenCalled();
  });

  it("names the SERVER, not the connection, when the answer carried a status (F8)", async () => {
    // A 500 already classified as unreachable before this batch — what was wrong
    // was the sentence. Somebody with four bars whose GoTrue fell over was told
    // to check their connection, which is the one thing that cannot help.
    await signIn("ana@dim.test", "hunter2");
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Internal Server Error", 500, undefined),
    });

    await expect(sessionPort.accessToken()).resolves.toBeNull();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_SERVER_UNAVAILABLE_MESSAGE,
    });
  });

  it("still says 'no hay conexión' when nothing came back at all", async () => {
    // The control for the split: a transport failure carries status 0, and for
    // that person the connection really is the subject.
    await signIn("ana@dim.test", "hunter2");
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });

    await expect(sessionPort.accessToken()).resolves.toBeNull();

    expect(getSessionState()).toEqual({
      phase: "session-unverified",
      message: SESSION_UNREACHABLE_MESSAGE,
    });
  });
});

// ---------------------------------------------------------------------------
// lote 1b F2 / F6 — A DELIBERATE SIGN-OUT MUST NOT BE UNDONE
//
// `restoreSnapshot`'s only guard was "is the key empty now?" — which is exactly
// what "Cerrar sesión" produces. The whole sequence fits inside one dead spot: a
// 401 starts a refresh, the refresh hangs, the person signs out, the refresh
// resolves `unreachable`, and the live refresh token is written back. The UI
// says signed out; the next cold start signs back in, and on a shared phone the
// display-only gate then renders the PREVIOUS person's cached credentials.
// ---------------------------------------------------------------------------

/** Let every already-queued microtask and 0 ms timer run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("signOut — the resurrection window", () => {
  it("does not restore a snapshot the sign-out deleted on purpose", async () => {
    await signIn("ana@dim.test", "hunter2");

    // The snapshot read lands first; the key is empty afterwards because the
    // sign-out emptied it — indistinguishable, to the old guard, from
    // `_removeSession()` throwing a good token away.
    mockReadStoredSession.mockResolvedValueOnce('{"refresh_token":"rt"}');
    mockReadStoredSession.mockResolvedValue(null);
    mockRestoreStoredSession.mockClear();

    let answerRefresh: (value: unknown) => void = () => {};
    mockAuth.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        answerRefresh = resolve;
      }),
    );

    const refreshing = sessionPort.refreshAccessToken();
    // The snapshot and the epoch are both read before the call; without this the
    // test would read the epoch AFTER the bump and pass for the wrong reason.
    await flush();

    await signOut("/mascotas");

    answerRefresh({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });
    await expect(refreshing).resolves.toEqual({ ok: false, reason: "unreachable" });

    expect(mockRestoreStoredSession).not.toHaveBeenCalled();
    expect(getSessionState()).toEqual({
      phase: "signed-out",
      reason: "user_action",
      endedAt: "/mascotas",
    });
  });

  it("still restores when NO sign-out happened — the epoch is not a way to never restore", async () => {
    // The control. Without it the assertion above would pass on a
    // `restoreSnapshot` that was simply deleted.
    await signIn("ana@dim.test", "hunter2");
    mockReadStoredSession.mockResolvedValueOnce('{"refresh_token":"rt"}');
    mockReadStoredSession.mockResolvedValue(null);
    mockRestoreStoredSession.mockClear();

    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("network request failed", 0),
    });

    await sessionPort.refreshAccessToken();

    expect(mockRestoreStoredSession).toHaveBeenCalledWith('{"refresh_token":"rt"}');
  });

  it("re-deletes the local session when signOut outlives its 10 s budget (F6)", async () => {
    await signIn("ana@dim.test", "hunter2");
    jest.useFakeTimers();
    try {
      let answerSignOut: (value: unknown) => void = () => {};
      mockAuth.signOut.mockReturnValue(
        new Promise((resolve) => {
          answerSignOut = resolve;
        }),
      );
      mockDropLocalSession.mockClear();

      const pending = signOut("/ajustes");
      await jest.advanceTimersByTimeAsync(10_000);
      await pending;

      // The budget fired and the local delete ran without the server's answer —
      // which is the behaviour A6-cuenta-resiliencia-04 added and is correct.
      expect(mockDropLocalSession).toHaveBeenCalledTimes(1);

      // auth-js finally answers. Anything it had queued behind that answer — a
      // `_saveSession` from the auto-refresh ticker — lands AFTER the delete,
      // and the library's storage lock is no longer ordering us against it.
      answerSignOut({ error: null });
      await jest.advanceTimersByTimeAsync(0);

      expect(mockDropLocalSession).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("sessionPort.refreshAccessToken — the shapes auth-js deletes the session over", () => {
  it("reads an unparseable answer as unreachable and puts the session back", async () => {
    // A6-refuter-M1: `AuthUnknownError` is what auth-js raises when the body is
    // not JSON — an HTML 502, a captive portal, a proxy. It is not in its retry
    // list, so `_callRefreshToken` calls `_removeSession()`: a refresh token
    // GoTrue never saw, deleted by a hotel wifi.
    mockReadStoredSession
      .mockResolvedValueOnce('{"refresh_token":"rt"}')
      .mockResolvedValueOnce(null);
    // THE REAL CLASS, like every other error in this file. A hand-rolled
    // `{ __isAuthError: true, name: "AuthUnknownError" }` pinned the fake: it
    // could keep passing after auth-js renamed the class or started carrying a
    // status, which is exactly what `authFailureReason` reads.
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthUnknownError("Unexpected token <", new SyntaxError("Unexpected token <")),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
    expect(mockRestoreStoredSession).toHaveBeenCalledWith('{"refresh_token":"rt"}');
  });

  it("reads a 500 as unreachable too — a server that fell over said nothing", async () => {
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Internal Server Error", 500, undefined),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  // -------------------------------------------------------------------------
  // lote 1b F1 — A RATE LIMIT IS NOT A REFUSAL
  //
  // auth-js maps only [502,503,504,520,521,522,523,524,530] to
  // `AuthRetryableFetchError` (lib/fetch.js:32-40). EVERYTHING else becomes a
  // plain `AuthApiError`, so 429 arrived at a classifier whose default was
  // "refused" — and in `accessToken()` the refused arm runs `clearSession()`,
  // which drops the refresh token AND wipes the offline credential cache. One
  // clinic, one municipal office, one CGNAT range hitting a per-IP limit was
  // enough to destroy a session GoTrue never rejected.
  // -------------------------------------------------------------------------
  it("reads a 429 as unreachable and puts the session back", async () => {
    mockReadStoredSession
      .mockResolvedValueOnce('{"refresh_token":"rt"}')
      .mockResolvedValueOnce(null);
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Too Many Requests", 429, "over_request_rate_limit"),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
    expect(mockRestoreStoredSession).toHaveBeenCalledWith('{"refresh_token":"rt"}');
  });

  it("reads a 408 as unreachable too — a timeout is not a verdict", async () => {
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Request Timeout", 408, undefined),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("still reads a 401 as REFUSED — the allow-list is not a way to never sign out", async () => {
    // THE CONTROL for the inversion. Without it every test above would pass on a
    // classifier that answers "unreachable" to everything, which would be its own
    // bug and a worse one: a retry button that can never succeed.
    mockReadStoredSession.mockResolvedValue('{"refresh_token":"rt"}');
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Unauthorized", 401, "refresh_token_not_found"),
    });

    await expect(sessionPort.refreshAccessToken()).resolves.toEqual({
      ok: false,
      reason: "refused",
    });
    expect(mockRestoreStoredSession).not.toHaveBeenCalled();
  });

  it("does NOT put a session back when the refresh rotated one", async () => {
    // The guard on the restore: a successful refresh writes a NEWER value under
    // the same key, and blindly restoring the snapshot would replace a live
    // refresh token with the one it just superseded.
    mockReadStoredSession.mockResolvedValue('{"refresh_token":"rt"}');
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: { access_token: "rotated-token" } },
      error: null,
    });

    await sessionPort.refreshAccessToken();

    expect(mockRestoreStoredSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A6-cuenta-resiliencia-04 — THE AUTH PLANE GETS THE SAME 10 s BUDGET
// ---------------------------------------------------------------------------

describe("the auth plane under the request timeout", () => {
  it("gives up on a getSession that never answers", async () => {
    await signIn("ana@dim.test", "hunter2");
    jest.useFakeTimers();
    try {
      // A network that accepts the connection and answers nothing. The SDK's
      // own fetch has no timeout, so this used to hang for as long as the
      // platform allowed — under a splash, or a spinner behind `void load()`.
      mockAuth.getSession.mockReturnValue(new Promise(() => {}));

      const pending = sessionPort.accessToken();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBeNull();
      expect(getSessionState()).toEqual({
        phase: "session-unverified",
        message: SESSION_UNREACHABLE_MESSAGE,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives up on a refreshSession that never answers, as unreachable", async () => {
    jest.useFakeTimers();
    try {
      mockAuth.refreshSession.mockReturnValue(new Promise(() => {}));

      const pending = sessionPort.refreshAccessToken();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toEqual({ ok: false, reason: "unreachable" });
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// A1-entrada-03 — "ok" WITH A `/me` THAT NEVER LANDED
//
// Both callers leave their button disabled on the success arm on purpose: the
// gate is supposed to redirect. When the follow-up `/me` failed, nothing
// redirected and nothing re-enabled — "Creando la cuenta…" forever.
// ---------------------------------------------------------------------------

describe("signUp — the follow-up /me read fails", () => {
  it("refuses instead of reporting a signed-in session that does not exist", async () => {
    mockFetchMe.mockResolvedValue({
      outcome: "api-error",
      code: "temporarily_unavailable",
      retryAfterSeconds: null,
    });

    const result = await signUp({
      email: "ana@dim.test",
      password: "hunter2hunter2",
      confirmPassword: "hunter2hunter2",
      tosAccepted: true,
    });

    expect(result.ok).toBe(false);
    // The account EXISTS — the copy must say so, or the person retries into the
    // duplicate masquerade with no explanation.
    expect(result.ok === false && result.message).toContain("Creamos tu cuenta");
    expect(result.ok === false && result.message).toContain("ingreso");
  });

  it("still reports the signed-in success when /me lands", async () => {
    const result = await signUp({
      email: "ana@dim.test",
      password: "hunter2hunter2",
      confirmPassword: "hunter2hunter2",
      tosAccepted: true,
    });

    expect(result).toEqual({ ok: true, signedIn: true });
  });
});

// ---------------------------------------------------------------------------
// A1-entrada-04 — STEP 2 WAS COMPLETED ON THE WEB
// ---------------------------------------------------------------------------

describe("completeIdentity — the server says it is already done", () => {
  it("re-reads /me and reports success instead of sending the person to Ajustes", async () => {
    // The DNI still lives on the web and this screen offers the link, so
    // finishing there and coming back to a phone still sitting on the form is a
    // NORMAL path. The 409's own sentence ("Ya completaste tus datos, volvé a
    // Ajustes") pointed at a screen that cannot advance anybody: the gate only
    // lets go when `/me` says `profilePending: false`, and nothing re-read it.
    await signIn("ana@dim.test", "hunter2");
    mockCompleteIdentity.mockResolvedValue({
      outcome: "api-error",
      code: "identity_already_complete",
      retryAfterSeconds: null,
    });
    mockFetchMe.mockResolvedValue({
      outcome: "ok",
      payload: { user: { ...LOGIN_OK.payload.user, displayName: "Ana Pérez" } },
    });

    await expect(completeIdentity({ firstName: "Ana", lastName: "Pérez" })).resolves.toEqual({
      ok: true,
    });
    expect(getSessionState()).toEqual({
      phase: "signed-in",
      user: { ...LOGIN_OK.payload.user, displayName: "Ana Pérez" },
    });
  });

  it("still refuses when the re-read says the identity is STILL pending", async () => {
    // The control: the 409 arm must not become a way to walk past a gate that
    // is still closed.
    await signIn("ana@dim.test", "hunter2");
    mockCompleteIdentity.mockResolvedValue({
      outcome: "api-error",
      code: "identity_already_complete",
      retryAfterSeconds: null,
    });
    mockFetchMe.mockResolvedValue({
      outcome: "ok",
      payload: { user: { ...LOGIN_OK.payload.user, profilePending: true } },
    });

    const result = await completeIdentity({ firstName: "Ana", lastName: "Pérez" });
    expect(result.ok).toBe(false);
  });
});
