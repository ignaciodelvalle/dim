// The one network read this app makes, and every way it can fail.
//
// WHY A UNION AND NOT `throw`
// ---------------------------------------------------------------------------
// Most of the outcomes below are NORMAL operation of a public endpoint, not
// exceptions: a 429 from the per-IP limiter, a 404 for a token that resolves to
// nothing, a 503 carrying a partially-readable credential, and a phone with no
// signal. Modelling them as thrown errors would push the screen into a single
// `catch` that can only say "algo salió mal", which is the copy this endpoint's
// whole per-section design exists to avoid.
//
// `temporarily_unavailable` deserves its own note. The contract calls answering
// 404 to a read failure "the worst lie a public surface can tell", and the
// client half of that promise is this: a 503 is NOT folded into the not-found
// arm here, and its body is kept, because the degraded envelope still carries
// the animal's name and the lost-report CTAs.
//
// EVERY FAILURE ARM MUST PRODUCE A SENTENCE
// ---------------------------------------------------------------------------
// A failure outcome that maps to no message renders as an empty `<Text>` under
// a "No se pudo leer" heading — a blank where an explanation should be, which
// is the same class of dishonesty as a blank `unavailable` section. Two things
// enforce it: the error code is validated against the contract's CLOSED
// vocabulary at the parse boundary (`apiV1ErrorCode` below) rather than merely
// asserted by a type, and `fetchFailureMessage` switches exhaustively with no
// fallthrough, so a new outcome added to the union is a compile error here.
//
// RATE LIMITS ARE A DESIGN INPUT, NOT AN ERROR TO RETRY
// ---------------------------------------------------------------------------
// The endpoint runs two limiters: 20/min per (token, IP) and 60/min per IP
// across the surface. This module therefore exposes exactly one function that
// performs exactly one request, with NO retry, NO backoff loop, and no polling
// timer anywhere in this app. The screen calls it once on mount and once per
// deliberate tap of "Actualizar". A `setInterval` here would spend a shared
// budget that, on a lost pet, real finders in the street are also spending.

import {
  API_V1_ERROR_CODES,
  type ApiV1ErrorCode,
  PUBLIC_CREDENTIAL_PAYLOAD_VERSION,
  type PublicCredentialV1,
  type PublicCredentialV1Degraded,
} from "@dim/contract/api";

import { credentialEndpoint } from "../config/api";

export type CredentialFetchResult =
  | { outcome: "ok"; payload: PublicCredentialV1 }
  | { outcome: "degraded"; payload: PublicCredentialV1Degraded }
  | { outcome: "api-error"; code: ApiV1ErrorCode }
  /** `received` is `null` when the field was absent or not a number at all. */
  | { outcome: "unsupported-version"; received: number | null }
  /** Connected, answered, and the body was not JSON we could read. */
  | { outcome: "malformed"; detail: string }
  /** Never got an answer: no signal, DNS, TLS, or the timeout below. */
  | { outcome: "unreachable"; detail: string };

/** Nothing on this screen is worth a spinner that never ends. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The endpoint's error vocabulary, as a runtime set.
 *
 * `API_V1_ERROR_CODES` is exported by the contract as a frozen array precisely
 * so a client can do this instead of hard-coding the strings. Checking
 * MEMBERSHIP — not just `typeof === "string"` — is what keeps an unrecognised
 * code from flowing into the union as a valid `ApiV1ErrorCode` it is not, and
 * then falling out of the message switch as a blank line on the screen.
 */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(API_V1_ERROR_CODES);

/** The declared error code, or `null` if the body does not carry a known one. */
function apiV1ErrorCode(body: unknown): ApiV1ErrorCode | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" && KNOWN_ERROR_CODES.has(code) ? (code as ApiV1ErrorCode) : null;
}

/**
 * es-AR copy for each API error code. Exhaustive: every code has a sentence.
 *
 * No `default` and no trailing return, on purpose: that is what makes a code
 * added to `API_V1_ERROR_CODES` without copy here a COMPILE error instead of a
 * blank line on the screen. It has already earned its keep once — this function
 * covered the three codes the vocabulary had when it was written, WU-A widened
 * `API_V1_ERROR_CODES` from three to ten on a branch that did not contain this
 * app, and the two merged without touching a single common file. git had
 * nothing to report; the exhaustiveness check is the only thing that saw it.
 *
 * The seven auth codes cannot come back from the PUBLIC credential endpoint
 * this module reads. They are answered anyway because the function's contract
 * is the whole vocabulary, not one endpoint's subset: `apiV1ErrorCode()` maps
 * any known code out of any body, and a client that renders nothing for a code
 * the server really sent is the exact defect the switch exists to prevent.
 */
function apiErrorMessage(code: ApiV1ErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "Demasiadas consultas. Esperá un momento y volvé a intentar.";
    case "not_found":
      return "No encontramos una credencial para este código.";
    case "temporarily_unavailable":
      return "El servidor no pudo responder. Volvé a intentar en unos segundos.";
    case "auth_required":
      return "Necesitás iniciar sesión para ver esto.";
    case "auth_expired":
      return "Tu sesión venció. Iniciá sesión de nuevo.";
    // One sentence for "no such account" and for "wrong password" alike — the
    // contract keeps the two byte-identical so this endpoint never becomes an
    // account-enumeration oracle, and copy that split them would undo that.
    case "invalid_credentials":
      return "El email o la contraseña no coinciden.";
    case "account_deactivated":
      return "Esta cuenta está desactivada. Contactate con tu organización.";
    case "account_erased":
      return "Esta cuenta ya no existe.";
    case "invalid_request":
      return "La app envió un pedido que el servidor no pudo leer. Actualizá la app.";
    case "signup_failed":
      return "No pudimos crear la cuenta. Volvé a intentar en unos minutos.";
    // The three WRITE codes (WU-B). Same reasoning as the auth block above: the
    // public credential endpoint cannot return any of them, and they are
    // answered anyway because this function's contract is the WHOLE vocabulary.
    // The switch caught the WU-A widening across a branch merge git had nothing
    // to say about; it caught this one the same way.
    case "idempotency_key_required":
      return "La app envió un registro sin su clave de reintento. Actualizá la app.";
    case "duplicate_pet_suspected":
      return "Ya tenés una mascota registrada con ese nombre. Revisá tu lista antes de crear otra.";
    case "pet_registration_failed":
      return "No pudimos completar el registro. Volvé a intentar en unos minutos.";
  }
}

/**
 * es-AR copy for each failure. Kept beside the union it describes.
 *
 * Returns `null` ONLY for the two success arms. Every failure arm returns a
 * sentence, and the switch has no `default` and no trailing return — so adding
 * an outcome without adding its copy does not compile.
 */
export function fetchFailureMessage(result: CredentialFetchResult): string | null {
  switch (result.outcome) {
    case "ok":
    case "degraded":
      return null;
    case "api-error":
      return apiErrorMessage(result.code);
    case "unsupported-version":
      return `Esta versión de la app no entiende el formato de la credencial (v${
        result.received ?? "desconocida"
      }). Actualizá la app.`;
    case "malformed":
      return "El servidor respondió algo que no pudimos leer. Volvé a intentar.";
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
  }
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Reads one credential. One request, no retry — see the header.
 *
 * The version gate is deliberate and comes before anything reads a field. The
 * contract exports `PUBLIC_CREDENTIAL_PAYLOAD_VERSION` and says it is "bumped
 * when a change would break an existing client's parse"; a client that ships
 * the constant and never compares it has taken the cost of the version field
 * and none of its benefit. An old build should say "actualizá la app", not
 * render half a credential from a shape it is guessing at.
 */
export async function fetchCredential(publicToken: string): Promise<CredentialFetchResult> {
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
      response = await fetch(credentialEndpoint(publicToken), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      return { outcome: "unreachable", detail: describeError(error) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return { outcome: "malformed", detail: describeError(error) };
    }

    // 503 carries the degraded envelope — the error code ALONGSIDE whatever
    // survived, per section. Checked before the generic error arm precisely
    // because its body is not a bare `{ error }`.
    if (response.status === 503) {
      const degraded = body as PublicCredentialV1Degraded;
      if (degraded?.payloadVersion === PUBLIC_CREDENTIAL_PAYLOAD_VERSION) {
        return { outcome: "degraded", payload: degraded };
      }
      return { outcome: "api-error", code: "temporarily_unavailable" };
    }

    if (!response.ok) {
      // An unrecognised code is a contract violation, not something to display
      // raw. Anything unexpected reads as a failed read, never as 404.
      return { outcome: "api-error", code: apiV1ErrorCode(body) ?? "temporarily_unavailable" };
    }

    const payload = body as PublicCredentialV1;
    if (payload?.payloadVersion !== PUBLIC_CREDENTIAL_PAYLOAD_VERSION) {
      const received = typeof payload?.payloadVersion === "number" ? payload.payloadVersion : null;
      return { outcome: "unsupported-version", received };
    }

    return { outcome: "ok", payload };
  } finally {
    clearTimeout(timeout);
  }
}
