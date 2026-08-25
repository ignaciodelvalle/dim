// Every `/api/v1` call this app makes, in one file.
//
// Not because a file per endpoint would be wrong, but because the set is small
// enough that seeing it whole is worth more than seeing it sorted: six calls is
// the entire surface a citizen wallet needs, and a reader asking "what can this
// app do to my account" should get the answer in one screen rather than by
// walking a directory.
//
// Everything here is a thin wrapper over `apiRequest` / `performRequest`. No
// endpoint may add its own retry, its own error copy, or its own session
// handling — those live in `client.ts` exactly once, and a second copy is how
// two screens end up disagreeing about what a 401 means.

import {
  LOCALITIES_PAYLOAD_VERSION,
  type LocalitiesV1,
  type LoginV1,
  ME_PAYLOAD_VERSION,
  MY_PETS_PAYLOAD_VERSION,
  type MeV1,
  type MyPetsV1,
  type PetRegisteredV1,
} from "@dim/contract/api";
import type { RegisterPetInput } from "@dim/contract/input";

import { type ApiResult, type SessionPort, apiRequest, performRequest } from "./client";
import { apiV1ErrorCode } from "./error-copy";

/**
 * `POST /auth/login`. NOT a bearer call — it is what produces the bearer.
 *
 * It therefore uses `performRequest` directly and interprets its own result:
 * routing it through `apiRequest` would ask the session port for a token that
 * by definition does not exist yet, and would end a session nobody has.
 */
export async function login(input: {
  email: string;
  password: string;
}): Promise<ApiResult<LoginV1>> {
  const raw = await performRequest({
    path: "/api/v1/auth/login",
    method: "POST",
    body: { email: input.email, password: input.password },
  });

  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 200) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  return { outcome: "ok", payload: raw.body as LoginV1 };
}

/** `GET /me` — the four-field shell. No email, no DNI, no pets. */
export function fetchMe(session: SessionPort): Promise<ApiResult<MeV1>> {
  return apiRequest<MeV1>(
    { path: "/api/v1/me", expectedPayloadVersion: ME_PAYLOAD_VERSION },
    session,
  );
}

/** `GET /me/pets` — the owner's list, possibly truncated. */
export function fetchMyPets(session: SessionPort): Promise<ApiResult<MyPetsV1>> {
  return apiRequest<MyPetsV1>(
    { path: "/api/v1/me/pets", expectedPayloadVersion: MY_PETS_PAYLOAD_VERSION },
    session,
  );
}

/**
 * `GET /localities` — public typeahead.
 *
 * The server answers `results: []` for a query under two characters rather than
 * refusing, so this wrapper does NOT pre-filter: a client that decides for
 * itself when a query is "long enough" has forked the rule, and the day the
 * server relaxes it the app would still be enforcing the old one. The screen
 * skips the CALL for short input (a network round trip per keystroke is its own
 * problem), which is a different decision and lives at the call site.
 *
 * Public, so no bearer and no session port — the same reasoning as `login`.
 */
export async function searchLocalities(query: {
  q: string;
  province?: string;
}): Promise<ApiResult<LocalitiesV1>> {
  const params = new URLSearchParams({ q: query.q });
  if (query.province) params.set("province", query.province);

  const raw = await performRequest({ path: `/api/v1/localities?${params.toString()}` });
  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 200) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  const payload = raw.body as LocalitiesV1;
  if (payload?.payloadVersion !== LOCALITIES_PAYLOAD_VERSION) {
    return {
      outcome: "unsupported-version",
      received: typeof payload?.payloadVersion === "number" ? payload.payloadVersion : null,
    };
  }
  return { outcome: "ok", payload };
}

/**
 * `POST /pets` — the one write this app makes.
 *
 * `idempotencyKey` is REQUIRED by the type because it is required by the server:
 * a missing or malformed header is a 400 `idempotency_key_required`, not a
 * best-effort. The key is generated once per attempt-session and reused across
 * every retry of the same attempt — see `pets/idempotency.ts` for why that
 * matters more here than on most write endpoints.
 */
export function registerPet(
  session: SessionPort,
  input: RegisterPetInput,
  idempotencyKey: string,
): Promise<ApiResult<PetRegisteredV1>> {
  return apiRequest<PetRegisteredV1>(
    {
      path: "/api/v1/pets",
      method: "POST",
      body: input,
      headers: { "idempotency-key": idempotencyKey },
    },
    session,
  );
}

/**
 * `POST /me/revoke-sessions`.
 *
 * A 200 MEANS THE CALLER IS SIGNED OUT TOO, and that is not obvious from the
 * name. GoTrue rejects the access token immediately and the refresh comes back
 * `refresh_token_not_found` — measured, not assumed. So the caller must drop its
 * tokens and go to sign-in; it must NOT try to refresh, because the refresh is
 * guaranteed to fail and its failure would be reported as "your session
 * expired", which reads like a bug instead of like the thing the user just
 * asked for.
 */
export function revokeAllSessions(session: SessionPort): Promise<ApiResult<{ revoked: true }>> {
  return apiRequest<{ revoked: true }>(
    { path: "/api/v1/me/revoke-sessions", method: "POST" },
    session,
  );
}
