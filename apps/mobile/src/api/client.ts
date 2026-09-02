// The one place this app talks to `/api/v1`.
//
// WHY A UNION AND NOT `throw`
// ---------------------------------------------------------------------------
// Most of the outcomes below are NORMAL operation, not exceptions: a 429 from
// the limiter, a 404 for a token that resolves to nothing, a 503, and a phone
// with no signal. Modelling them as thrown errors pushes every screen into a
// single `catch` that can only say "algo salió mal", which is the copy this
// product's per-section honesty exists to avoid. The shape is the one
// `credential-api.ts` established in M1; this module generalises it rather than
// starting a second vocabulary beside it.
//
// TWO LAYERS, AND THE SPLIT IS LOAD-BEARING
// ---------------------------------------------------------------------------
//   `performRequest` — transport only. Answers "did the server answer, and with
//   what status and body". It knows nothing about sessions or payload versions,
//   which is what lets the PUBLIC credential read (whose 503 carries a readable
//   degraded envelope, not a bare `{ error }`) use the same transport as every
//   authenticated read without pretending its 503 is an error.
//
//   `apiRequest` — the bearer layer. Attaches the token, maps the envelope
//   through the ONE exhaustive switch in `error-copy.ts`, gates the payload
//   version, and owns the entire session-ending policy below.
//
// THE SESSION POLICY, STATED ONCE HERE SO NO SCREEN RE-DERIVES IT
// ---------------------------------------------------------------------------
//   401 `auth_expired`          → refresh ONCE, retry ONCE. Still 401 → sign out.
//   401 `session_shift_expired` → sign out immediately, NEVER refresh. The
//                                 refresh would SUCCEED (the token is valid at
//                                 GoTrue; the 8-hour shift is our policy) and
//                                 the retry would be refused again, forever.
//                                 The web app paid for this lesson on
//                                 2026-07-04 as a redirect loop; the native
//                                 shape of the same bug is a retry loop.
//   401 `auth_required`         → the server saw no bearer at all. Sign out: our
//                                 idea of "signed in" and the server's disagree,
//                                 and the only honest resolution is a fresh
//                                 sign-in.
//   403 deactivated / erased    → sign out. The session is live and useless.
//
// ONE refresh, ONE retry. Not a loop with a counter: a counter is a knob, and a
// knob on this particular code path is how a client ends up hammering GoTrue on
// behalf of a user who is simply signed out.

import type { ApiV1ErrorCode } from "@dim/contract/api";

import { API_BASE_URL } from "../config/api";
import { apiErrorMessage, apiV1ErrorCode } from "./error-copy";

/** Nothing in this app is worth a spinner that never ends. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Why a session ended. Each value has its own sentence on the sign-in screen. */
export type SessionEndReason =
  | "auth_expired"
  | "session_shift_expired"
  | "auth_required"
  | "account_deactivated"
  | "account_erased"
  | "revoked_all"
  | "user_action";

/**
 * What `apiRequest` needs from the session, as a port.
 *
 * A port rather than a direct import of the supabase client for one concrete
 * reason: the refresh-and-retry policy above is the single most test-worthy
 * behaviour in this app, and a native module (`expo-secure-store`) cannot run
 * under Jest. With a port the policy is exercised with three fakes and no mocks
 * of anything native.
 */
export type SessionPort = {
  /** The current access token, or null when there is no session at all. */
  accessToken(): Promise<string | null>;
  /** Refresh against GoTrue. Returns the new access token, or null on failure. */
  refreshAccessToken(): Promise<string | null>;
  /** Drop the local session and send the user to sign-in, with a reason. */
  endSession(reason: SessionEndReason): Promise<void>;
};

export type RawResponse =
  /** The server answered and the body parsed as JSON. */
  | { transport: "answered"; status: number; body: unknown; retryAfterSeconds: number | null }
  /** Connected, answered, and the body was not JSON we could read. */
  | { transport: "malformed"; detail: string }
  /** Never got an answer: no signal, DNS, TLS, or the timeout above. */
  | { transport: "unreachable"; detail: string };

export type ApiResult<T> =
  | { outcome: "ok"; payload: T }
  | { outcome: "api-error"; code: ApiV1ErrorCode; retryAfterSeconds: number | null }
  /** `received` is `null` when the field was absent or not a number at all. */
  | { outcome: "unsupported-version"; received: number | null }
  | { outcome: "malformed"; detail: string }
  | { outcome: "unreachable"; detail: string };

export type RequestSpec = {
  /** Path under the origin, e.g. `/api/v1/me/pets`. */
  path: string;
  method?: "GET" | "POST";
  /** Serialized as JSON. Omit for GET. */
  body?: unknown;
  /** Extra headers — `idempotency-key`, and nothing else so far. */
  headers?: Record<string, string>;
  /**
   * The `payloadVersion` this build understands. When given, a payload that
   * declares anything else is `unsupported-version` BEFORE any field is read.
   *
   * The contract exports these constants and says they are "bumped when a change
   * would break an existing client's parse"; a client that ships the constant
   * and never compares it has taken the cost of the version field and none of
   * its benefit. An old build should say "actualizá la app", not render half a
   * screen from a shape it is guessing at.
   */
  expectedPayloadVersion?: number;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * `retry-after`, in seconds, when the server sent a usable one.
 *
 * Only the numeric form is read. The HTTP-date form is legal and this API never
 * emits it; guessing at a date would produce a countdown from a clock we do not
 * control, and a wrong countdown is worse than none.
 */
function retryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * One request. No retry, no backoff loop, no polling timer anywhere.
 *
 * The retry that DOES exist lives one layer up and fires only after a token
 * refresh — i.e. only when the first attempt failed for a reason a second
 * attempt can actually fix.
 */
export async function performRequest(
  spec: RequestSpec,
  init: { authorization?: string } = {},
): Promise<RawResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // The transport and the body are read in SEPARATE try blocks because they
    // fail for different reasons and a user can act on only one of them. Folded
    // together, a truncated or non-JSON body reports "revisá tu conexión" to
    // someone whose connection is fine — a false diagnosis, and the kind that
    // sends people to restart their router while the server is the problem.
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${spec.path}`, {
        method: spec.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(spec.body === undefined ? {} : { "content-type": "application/json" }),
          ...(init.authorization ? { authorization: init.authorization } : {}),
          ...spec.headers,
        },
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
        signal: controller.signal,
      });
    } catch (error) {
      return { transport: "unreachable", detail: describeError(error) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return { transport: "malformed", detail: describeError(error) };
    }

    return {
      transport: "answered",
      status: response.status,
      body,
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Maps a transport answer onto the typed result. No session logic here. */
function interpret<T>(raw: RawResponse, spec: RequestSpec): ApiResult<T> {
  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };

  if (raw.status < 200 || raw.status >= 300) {
    // An unrecognised code is a contract violation, not something to display
    // raw. Anything unexpected reads as a failed read, never as 404 — answering
    // 404 to a read failure is what the contract calls "the worst lie a public
    // surface can tell".
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }

  if (spec.expectedPayloadVersion !== undefined) {
    const declared = (raw.body as { payloadVersion?: unknown } | null)?.payloadVersion;
    if (declared !== spec.expectedPayloadVersion) {
      return {
        outcome: "unsupported-version",
        received: typeof declared === "number" ? declared : null,
      };
    }
  }

  return { outcome: "ok", payload: raw.body as T };
}

/** The codes that mean "this session is over", with the reason to end it under. */
function sessionEndingReason(code: ApiV1ErrorCode, status: number): SessionEndReason | null {
  if (status === 401) {
    if (code === "session_shift_expired") return "session_shift_expired";
    if (code === "auth_required") return "auth_required";
    if (code === "auth_expired") return "auth_expired";
  }
  if (status === 403) {
    if (code === "account_deactivated") return "account_deactivated";
    if (code === "account_erased") return "account_erased";
  }
  return null;
}

/**
 * A bearer request against `/api/v1`, with the session policy in the header
 * applied exactly once.
 */
export async function apiRequest<T>(
  spec: RequestSpec,
  session: SessionPort,
): Promise<ApiResult<T>> {
  const token = await session.accessToken();
  if (token === null) {
    // No session at all. NOT an `endSession` call: there is nothing to end, and
    // calling it would fire the "your session ended" copy at somebody who simply
    // opened the app signed out.
    return { outcome: "api-error", code: "auth_required", retryAfterSeconds: null };
  }

  let raw = await performRequest(spec, { authorization: `Bearer ${token}` });

  // The refresh-and-retry arm. Reached ONLY for a 401 that a new access token
  // could plausibly fix — which is `auth_expired` and nothing else.
  if (raw.transport === "answered" && raw.status === 401) {
    const code = apiV1ErrorCode(raw.body);
    if (code === "auth_expired") {
      const refreshed = await session.refreshAccessToken();
      if (refreshed === null) {
        await session.endSession("auth_expired");
        return { outcome: "api-error", code: "auth_expired", retryAfterSeconds: null };
      }
      raw = await performRequest(spec, { authorization: `Bearer ${refreshed}` });
    }
  }

  const result = interpret<T>(raw, spec);

  if (result.outcome === "api-error" && raw.transport === "answered") {
    const reason = sessionEndingReason(result.code, raw.status);
    // Reached on the SECOND attempt too, which is the whole point: a refresh
    // that succeeded and a retry that was still refused means the session is
    // over for a reason a token cannot fix.
    if (reason !== null) await session.endSession(reason);
  }

  return result;
}

/**
 * es-AR copy for a result. `null` only for the success arm.
 *
 * The switch has no `default` and no trailing return, so adding an outcome
 * without adding its copy does not compile.
 *
 * The 429 refinement in front of it is deliberate and is NOT a second switch: it
 * replaces one arm's sentence with a more specific one IF the server ever tells
 * us how long to wait. It does not today — no `/api/v1` 429 sets `Retry-After`
 * yet (`docs/architecture/api-invariants.md:860` records why: only one of the
 * two 429 branches can carry an honest value today, and setting it on one and
 * not the other would fabricate a hint on the other). This branch is defensive
 * against a future server that closes that gap, not dead code: when it does,
 * "Esperá un momento" (honest but useless) becomes "en 30 segundos" — what
 * stops a person tapping the button eight more times and spending the budget
 * of the finder standing over a lost animal in the street.
 */
export function apiFailureMessage(result: ApiResult<unknown>): string | null {
  if (
    result.outcome === "api-error" &&
    result.code === "rate_limited" &&
    result.retryAfterSeconds !== null
  ) {
    const seconds = result.retryAfterSeconds;
    return seconds === 1
      ? "Demasiadas consultas. Probá de nuevo en 1 segundo."
      : `Demasiadas consultas. Probá de nuevo en ${seconds} segundos.`;
  }

  switch (result.outcome) {
    case "ok":
      return null;
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return `Esta versión de la app no entiende la respuesta del servidor (v${
        result.received ?? "desconocida"
      }). Actualizá la app.`;
    case "malformed":
      return "El servidor respondió algo que no pudimos leer. Volvé a intentar.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
  }
}
