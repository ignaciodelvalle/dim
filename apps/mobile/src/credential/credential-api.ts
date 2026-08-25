// The one network read this app makes, and every way it can fail.
//
// WHY A UNION AND NOT `throw`
// ---------------------------------------------------------------------------
// Four of the five outcomes below are NORMAL operation of a public endpoint,
// not exceptions: a 429 from the per-IP limiter, a 404 for a token that
// resolves to nothing, a 503 carrying a partially-readable credential, and a
// phone with no signal. Modelling them as thrown errors would push the screen
// into a single `catch` that can only say "algo salió mal", which is the copy
// this endpoint's whole per-section design exists to avoid.
//
// `temporarily_unavailable` deserves its own note. The contract calls answering
// 404 to a read failure "the worst lie a public surface can tell", and the
// client half of that promise is this: a 503 is NOT folded into the not-found
// arm here, and its body is kept, because the degraded envelope still carries
// the animal's name and the lost-report CTAs.
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
  type ApiV1Error,
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
  | { outcome: "unsupported-version"; received: number }
  | { outcome: "unreachable"; detail: string };

/** Nothing on this screen is worth a spinner that never ends. */
const REQUEST_TIMEOUT_MS = 10_000;

/** es-AR copy for each failure. Kept beside the union it describes. */
export function fetchFailureMessage(result: CredentialFetchResult): string | null {
  switch (result.outcome) {
    case "ok":
    case "degraded":
      return null;
    case "api-error":
      switch (result.code) {
        case "rate_limited":
          return "Demasiadas consultas. Esperá un momento y volvé a intentar.";
        case "not_found":
          return "No encontramos una credencial para este código.";
        case "temporarily_unavailable":
          return "El servidor no pudo responder. Volvé a intentar en unos segundos.";
      }
      break;
    case "unsupported-version":
      return `Esta versión de la app no entiende el formato de la credencial (v${result.received}). Actualizá la app.`;
    case "unreachable":
      return "No pudimos conectarnos. Revisá tu conexión.";
  }
  return null;
}

function isApiV1Error(body: unknown): body is ApiV1Error {
  return (
    typeof body === "object" && body !== null && typeof (body as ApiV1Error).error === "string"
  );
}

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

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(credentialEndpoint(publicToken), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    body = await response.json();
  } catch (error) {
    return {
      outcome: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
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
    // The endpoint's error vocabulary is closed and importable, so an
    // unrecognised code is a contract violation rather than something to
    // display raw. Anything unexpected reads as a failed read, never as 404.
    return {
      outcome: "api-error",
      code: isApiV1Error(body) ? body.error : "temporarily_unavailable",
    };
  }

  const payload = body as PublicCredentialV1;
  if (payload?.payloadVersion !== PUBLIC_CREDENTIAL_PAYLOAD_VERSION) {
    return { outcome: "unsupported-version", received: Number(payload?.payloadVersion) };
  }

  return { outcome: "ok", payload };
}
