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
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

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

jest.mock("./supabase-auth", () => ({
  AUTH_STORAGE_KEY: "mimar.auth.session",
  authClient: () => ({ auth: mockAuth }),
  dropLocalSession: () => mockDropLocalSession(),
}));

jest.mock("../credential/credential-cache", () => ({
  forgetAllCachedCredentials: () => mockForgetAllCachedCredentials(),
}));

jest.mock("../api/endpoints", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  revokeAllSessions: () => Promise.resolve({ outcome: "ok", payload: { revoked: true } }),
}));

import { bootstrapSession, getSessionState, sessionPort, signIn } from "./session-store";

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
