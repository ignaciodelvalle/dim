// The session, as a tiny observable store outside React.
//
// WHY NOT A CONTEXT WITH THE LOGIC INSIDE IT
// ---------------------------------------------------------------------------
// Because `client.ts` needs the same session and is not a component. The fetch
// wrapper has to be able to read the access token, refresh it, and end the
// session — from inside a request that a screen kicked off — and threading a
// React context into that is either a prop drilled through every call or a
// module-level escape hatch pretending to be a hook.
//
// So the store lives here, plain, and React subscribes to it
// (`useSyncExternalStore` in `useSession`). That also makes the interesting
// behaviour testable without a renderer.
//
// THE STATES ARE NOT INTERCHANGEABLE. In particular `session-unverified` is not
// a variant of `signed-out`: it means the device HAS tokens and could not reach
// the server to find out who they belong to — a cold start on the subway. The
// honest answer there is "we could not check", with a retry and a way out. The
// dishonest answers, both of which were considered: send the user to sign-in
// (they are not signed out, and signing in again needs the network they do not
// have), or wave them through with a fabricated profile.
//
// ===========================================================================
// EVERY auth-js CALL IN THIS FILE IS WRAPPED, AND THAT IS NOT DEFENSIVE STYLE
// ===========================================================================
// auth-js 2.105.4 RETHROWS anything that is not an AuthError. `_setSession`
// (GoTrueClient.js:2849-2854) and `_callRefreshToken` (:3935-3936) both end in
// `throw error` for a non-AuthError, and a failure coming out of
// `expo-secure-store` is a plain `Error`. So a Keystore write that fails does
// not arrive as `{ error }` — it arrives as a REJECTED PROMISE.
//
// The consequences were measured, not guessed, and every one of them is a screen
// that never comes back:
//
//   · `signIn` read `const { error } = await client.auth.setSession(...)` with no
//     catch, so its own branch below — "Iniciaste sesión, pero no pudimos
//     guardarla en este dispositivo" — was UNREACHABLE for the exact failure it
//     names. The rejection propagated into `app/ingreso.tsx`, whose `submit()`
//     has no catch either, so `setBusy(false)` never ran and the button stayed
//     "Ingresando…" forever.
//   · the two `sessionPort` reads are called from inside `client.ts`'s fetch
//     wrapper. A throw there rejects whatever request a screen kicked off, and
//     the screens call `void load()`, so the spinner never resolves.
//   · `bootstrapSession` is called as `void bootstrapSession()` from the root
//     layout's effect. A throw leaves the store at `starting` — a splash screen
//     with no way out.
//
// The direction of the fix follows the storage adapter's own rule, which was
// already right and only reached half the stack: a keychain that will not answer
// is a SIGNED-OUT user, never an app that will not start. Writes are the
// opposite — a failed write is reported to the person in front of the phone,
// because swallowing it produces the "it logs me out sometimes" mystery.

import type { MeV1User } from "@dim/contract/api";

import {
  type ApiResult,
  type SessionEndReason,
  type SessionPort,
  apiFailureMessage,
} from "../api/client";
import { fetchMe, login, revokeAllSessions, signup as signupRequest } from "../api/endpoints";
import { forgetAllCachedCredentials } from "../credential/credential-cache";
import { AUTH_STORAGE_KEY, authClient, dropLocalSession } from "./supabase-auth";

export type SessionState =
  /** Before `bootstrapSession()` has answered. Render a splash, not a screen. */
  | { phase: "starting" }
  /** This build has no auth plane. Nothing can sign in; say so. */
  | { phase: "unconfigured" }
  | { phase: "signed-out"; reason: SessionEndReason | null }
  /** Tokens on the device, identity unconfirmed — see the header. */
  | { phase: "session-unverified"; message: string }
  | { phase: "signed-in"; user: MeV1User };

let state: SessionState = { phase: "starting" };
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The port `client.ts` uses. One instance, module-level, because there is one
 * session.
 */
export const sessionPort: SessionPort = {
  async accessToken() {
    const client = authClient();
    if (client === null) return null;
    try {
      // `getSession()` refreshes on its own when the stored token is past expiry,
      // which is why this is not `session.access_token` read out of our own state:
      // the library's copy is the one that is kept current. That autorefresh is
      // also why a READ can throw a WRITE's error — see the header.
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      // No usable token, which is what the caller does with a null anyway. It
      // must not become a rejected request: the screens call `void load()`, so a
      // throw here is a spinner that never stops.
      return null;
    }
  },

  async refreshAccessToken() {
    const client = authClient();
    if (client === null) return null;
    try {
      const { data, error } = await client.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    } catch {
      // `_callRefreshToken` rethrows non-AuthErrors, so a Keystore write failure
      // during rotation lands here rather than in `error`. Same answer: no token.
      return null;
    }
  },

  async endSession(reason) {
    await clearSession();
    setState({ phase: "signed-out", reason });
  },
};

/**
 * Drop the session locally, unconditionally.
 *
 * `signOut` is attempted first so GoTrue learns about it, and its failure is
 * DELIBERATELY ignored — `dropLocalSession()` runs either way. See the long note
 * on `dropLocalSession` for why ignoring it is the honest choice here and not
 * the lazy one: the library leaves the session in place on a 5xx, and a "Cerrar
 * sesión" that leaves a live refresh token in the Keystore is a lie told to the
 * person holding the phone.
 */
async function clearSession(): Promise<void> {
  const client = authClient();
  if (client !== null) {
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // Ignored on purpose — see above.
    }
  }
  // NEITHER OF THESE MAY THROW OUT OF HERE. `clearSession` is the recovery path:
  // it runs when signing out, and again when a sign-in could not be stored. A
  // Keystore so broken that even DELETING fails would otherwise turn one failure
  // into a second, thrown one, in the exact code that exists to clean up after
  // the first. The state transition its callers perform must still happen.
  try {
    await dropLocalSession();
  } catch {
    // Nothing more to do here: the caller is already telling the user something
    // went wrong, and the local tokens are unusable either way.
  }
  // The device may be shared — a family phone, a rescue's tablet. The next
  // person to sign in must not find the previous owner's animals sitting in the
  // offline display cache. See credential-cache.ts.
  try {
    await forgetAllCachedCredentials();
  } catch {
    // A display cache that will not clear must not block a sign-out.
  }
}

/**
 * Resolve the session at app start.
 *
 * Called once from the root layout. Safe to call again (the retry button on the
 * unverified screen does).
 */
export async function bootstrapSession(): Promise<void> {
  const client = authClient();
  if (client === null) {
    setState({ phase: "unconfigured" });
    return;
  }

  let hasStoredSession: boolean;
  try {
    const { data } = await client.auth.getSession();
    hasStoredSession = data.session !== null;
  } catch {
    // A keychain that will not answer at cold start is a signed-out user, not a
    // splash screen forever. The root layout calls this as `void
    // bootstrapSession()`, so a throw would leave the store at `starting` with
    // nothing to retry from.
    hasStoredSession = false;
  }

  if (!hasStoredSession) {
    setState({ phase: "signed-out", reason: null });
    return;
  }

  const me = await fetchMe(sessionPort);
  applyMeResult(me);
}

/**
 * Turn a `/me` read into a session state.
 *
 * The `api-error` arm does NOT set `signed-out` itself: `apiRequest` has already
 * called `endSession` for every code that means the session is over, and that
 * call has already set the state WITH ITS REASON. Overwriting it here would
 * replace "tu turno de trabajo terminó" with a blank sign-in screen — the
 * refusal would still happen and the explanation would be gone.
 */
function applyMeResult(result: ApiResult<{ user: MeV1User }>): void {
  if (result.outcome === "ok") {
    setState({ phase: "signed-in", user: result.payload.user });
    return;
  }
  if (result.outcome === "api-error") {
    if (state.phase !== "signed-out") {
      setState({ phase: "signed-out", reason: null });
    }
    return;
  }
  // unreachable / malformed / unsupported-version: the tokens are fine, the
  // answer was not. Never sign the user out over a subway tunnel.
  setState({
    phase: "session-unverified",
    message: apiFailureMessage(result) ?? "No pudimos verificar tu sesión.",
  });
}

export type SignInResult = { ok: true } | { ok: false; message: string };

/**
 * Sign in: `POST /api/v1/auth/login`, then seed the SDK with what it returns.
 *
 * The order matters and is the whole design. The password never goes to GoTrue
 * from this app — it goes to `/api/v1/auth/login`, which applies OUR rate limits,
 * OUR account-state refusals and OUR non-enumerating error copy, and hands back
 * tokens. Only then is the SDK given a session to keep alive. A client that
 * called `signInWithPassword` directly would bypass every one of those.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const client = authClient();
  if (client === null) {
    return {
      ok: false,
      message:
        "Esta compilación de la app no tiene configurado el servidor de sesiones. Avisale a quien te la pasó.",
    };
  }

  const result = await login({ email, password });
  if (result.outcome !== "ok") {
    // The server's single non-enumerating sentence, verbatim. Do not decorate it
    // and do not split it by cause: `invalid_credentials` is byte-identical for
    // "no such account" and "wrong password" precisely so this screen cannot
    // become an account-enumeration oracle.
    return { ok: false, message: apiFailureMessage(result) ?? "No pudimos iniciar sesión." };
  }

  // BOTH FAILURE SHAPES LAND IN ONE BRANCH, and until 2026-08-25 only one of
  // them existed: `setSession` returns `{ error }` for an AuthError and THROWS
  // for anything else (GoTrueClient.js:2849-2854). An expo-secure-store write
  // failure is a plain Error, so the storage failure this branch is named for was
  // the one shape that never reached it — it propagated into the screen instead,
  // where `submit()` has no catch and `setBusy(false)` never ran.
  let stored: { error: unknown } = { error: null };
  try {
    stored = await client.auth.setSession({
      access_token: result.payload.session.accessToken,
      refresh_token: result.payload.session.refreshToken,
    });
  } catch (err) {
    stored = { error: err instanceof Error ? err : new Error(String(err)) };
  }

  if (stored.error) {
    // Signed in at the server, not stored on the device. Saying "listo" here
    // produces a session that evaporates on the next cold start, which is the
    // "it logs me out sometimes" report the whole storage adapter exists to
    // prevent. Refuse visibly instead.
    //
    // `clearSession` is itself unconditional and swallows its own signOut
    // failure, so this cleanup cannot turn one failure into two.
    await clearSession();
    return {
      ok: false,
      message: "Iniciaste sesión, pero no pudimos guardarla en este dispositivo. Probá de nuevo.",
    };
  }

  // The offline display cache is per-DEVICE, and this device may be shared — a
  // family phone, a rescue's tablet. `clearSession` already drops it on every
  // sign-out, so this is belt and braces; it became worth having when that call
  // started swallowing its own failure (see clearSession), which means a stale
  // cache CAN survive a sign-out now. Clearing on the way IN closes that without
  // making a failed cleanup block a sign-out.
  await forgetAllCachedCredentials().catch(() => undefined);

  setState({ phase: "signed-in", user: result.payload.user });
  return { ok: true };
}

export type SignUpResult =
  /** An account exists and this device is signed into it. */
  | { ok: true; signedIn: true }
  /**
   * The server answered 201 and handed back NO session. The person's next step
   * is the sign-in screen; see below for why this is not an error and why the
   * caller must not guess at a cause.
   */
  | { ok: true; signedIn: false }
  | { ok: false; message: string };

/**
 * Create an account: `POST /api/v1/auth/signup`, then seed the SDK with
 * whatever it returns.
 *
 * SAME ORDER AND SAME REASON AS `signIn`. The password never goes to GoTrue
 * from this app — it goes to `/api/v1/auth/signup`, which applies OUR rate
 * limit (`auth_signup_ip`, 3/min · 15/hr, spent inside the shared use-case
 * before GoTrue is touched — TIGHTER than login's, because a signup is never a
 * high-frequency legitimate action), OUR validation and OUR non-enumerating
 * response shape. A client that called `signUp` on the Supabase SDK directly
 * would bypass every one of those, and would also get the raw "User already
 * registered" error the masquerade exists to hide.
 *
 * THE 201 WITH NO SESSION IS A SUCCESS AND MUST BE REPORTED AS ONE. It has two
 * causes a caller cannot tell apart, and that indistinguishability is the whole
 * point (audit 28-#3): the email already has an account, or — if email
 * confirmations are ever turned ON in the Supabase dashboard — a genuine new
 * account is waiting to be confirmed. This function returns
 * `{ ok: true, signedIn: false }` for both and says nothing about which, so no
 * screen can accidentally become the account-enumeration oracle the server
 * refuses to be.
 *
 * THE AUTH-PLANE CHECK RUNS FIRST, BEFORE THE REQUEST, and that ordering is not
 * cosmetic. `signIn` checks it first to avoid a pointless round trip; here it
 * avoids CREATING AN ACCOUNT THIS BUILD CANNOT HOLD A SESSION FOR. Spending the
 * signup budget to mint a credential the app must then throw away is worse than
 * refusing, and the person would have no way to tell the two apart.
 */
export async function signUp(input: {
  email: string;
  password: string;
  confirmPassword: string;
  tosAccepted: boolean;
}): Promise<SignUpResult> {
  const client = authClient();
  if (client === null) {
    return {
      ok: false,
      message:
        "Esta compilación de la app no tiene configurado el servidor de sesiones. Avisale a quien te la pasó.",
    };
  }

  const result = await signupRequest(input);
  if (result.outcome !== "ok") {
    return { ok: false, message: apiFailureMessage(result) ?? "No pudimos crear la cuenta." };
  }

  const session = result.payload.session;
  if (session === null) return { ok: true, signedIn: false };

  // Same wrapping as `signIn`, for the same measured reason: `setSession`
  // returns `{ error }` for an AuthError and THROWS for anything else
  // (GoTrueClient.js:2849-2854), and an expo-secure-store write failure is a
  // plain Error. Unwrapped, that rejection propagates into the screen, whose
  // `submit()` has no catch, and the button stays "Creando la cuenta…" forever.
  let stored: { error: unknown } = { error: null };
  try {
    stored = await client.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });
  } catch (err) {
    stored = { error: err instanceof Error ? err : new Error(String(err)) };
  }

  if (stored.error) {
    // THE ACCOUNT EXISTS. It was created server-side and nothing here can undo
    // that, so the copy must not say "no pudimos crear la cuenta" — it would
    // send the person back to a form whose next submit answers with the
    // duplicate masquerade and no explanation. Point them at sign-in instead,
    // which is where an existing account is used.
    await clearSession();
    return {
      ok: false,
      message:
        "Creamos tu cuenta, pero no pudimos guardar la sesión en este dispositivo. Entrá desde la pantalla de ingreso con ese mismo email.",
    };
  }

  // Belt and braces, exactly as on the way IN through `signIn`: this device may
  // be shared, and `clearSession` now swallows its own failures, so a stale
  // display cache CAN survive a sign-out.
  await forgetAllCachedCredentials().catch(() => undefined);

  // `/me` RATHER THAN A USER OFF THE SIGNUP RESPONSE, because there is none:
  // `SignupV1` carries a session and nothing else, deliberately. That is also
  // the honest shape — a brand-new account has no profile row yet, so `/me`
  // answers `profilePending: true` and the gate sends the person to
  // `identidad-pendiente`, which is step 2 and lives on the web. Fabricating a
  // user here would be this app inventing an answer the server declined to give.
  const me = await fetchMe(sessionPort);
  applyMeResult(me);
  return { ok: true, signedIn: true };
}

/** "Cerrar sesión" — this device. */
export async function signOut(): Promise<void> {
  await clearSession();
  setState({ phase: "signed-out", reason: "user_action" });
}

export type RevokeResult = { ok: true } | { ok: false; message: string };

/**
 * "Cerrar sesión en todos los dispositivos".
 *
 * A 200 means THIS session is gone too — GoTrue rejects the access token
 * immediately and the refresh comes back `refresh_token_not_found` (measured).
 * So on success the tokens are dropped and the user goes to sign-in, and NOTHING
 * tries to refresh on the way out: that refresh is guaranteed to fail, and its
 * failure would surface as "tu sesión venció", which reads like a bug instead of
 * like the thing the user just asked for.
 *
 * On failure the session is left ALONE. A half-done revocation that also signs
 * you out locally is the worst of both: the other devices keep working and you
 * lost the one you were holding.
 */
export async function signOutEverywhere(): Promise<RevokeResult> {
  const result = await revokeAllSessions(sessionPort);
  if (result.outcome !== "ok") {
    return {
      ok: false,
      message: apiFailureMessage(result) ?? "No pudimos cerrar las otras sesiones.",
    };
  }
  await clearSession();
  setState({ phase: "signed-out", reason: "revoked_all" });
  return { ok: true };
}

/** es-AR copy for why the sign-in screen is showing. Exhaustive. */
export function sessionEndMessage(reason: SessionEndReason | null): string | null {
  if (reason === null) return null;
  switch (reason) {
    case "auth_expired":
      return "Tu sesión venció. Iniciá sesión de nuevo.";
    case "session_shift_expired":
      return "Tu turno de trabajo terminó. Volvé a iniciar sesión para seguir.";
    case "auth_required":
      return "Tu sesión ya no es válida en el servidor. Iniciá sesión de nuevo.";
    case "account_deactivated":
      return "Esta cuenta está desactivada. Contactate con tu organización.";
    case "account_erased":
      return "Esta cuenta ya no existe.";
    case "revoked_all":
      return "Cerraste la sesión en todos los dispositivos, incluido este.";
    case "user_action":
      return null;
  }
}

/** Exported for the storage test's key layout assertions. */
export { AUTH_STORAGE_KEY };
