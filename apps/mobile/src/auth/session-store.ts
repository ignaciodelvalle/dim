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

import type { MeV1User } from "@dim/contract/api";

import {
  type ApiResult,
  type SessionEndReason,
  type SessionPort,
  apiFailureMessage,
} from "../api/client";
import { fetchMe, login, revokeAllSessions } from "../api/endpoints";
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
    // `getSession()` refreshes on its own when the stored token is past expiry,
    // which is why this is not `session.access_token` read out of our own state:
    // the library's copy is the one that is kept current.
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  },

  async refreshAccessToken() {
    const client = authClient();
    if (client === null) return null;
    const { data, error } = await client.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
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
  await dropLocalSession();
  // The device may be shared — a family phone, a rescue's tablet. The next
  // person to sign in must not find the previous owner's animals sitting in the
  // offline display cache. See credential-cache.ts.
  await forgetAllCachedCredentials();
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

  const { data } = await client.auth.getSession();
  if (data.session === null) {
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

  const { error } = await client.auth.setSession({
    access_token: result.payload.session.accessToken,
    refresh_token: result.payload.session.refreshToken,
  });
  if (error) {
    // Signed in at the server, not stored on the device. Saying "listo" here
    // produces a session that evaporates on the next cold start, which is the
    // "it logs me out sometimes" report the whole storage adapter exists to
    // prevent. Refuse visibly instead.
    await clearSession();
    return {
      ok: false,
      message: "Iniciaste sesión, pero no pudimos guardarla en este dispositivo. Probá de nuevo.",
    };
  }

  setState({ phase: "signed-in", user: result.payload.user });
  return { ok: true };
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
