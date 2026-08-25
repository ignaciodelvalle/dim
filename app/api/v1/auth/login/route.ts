// POST /api/v1/auth/login — the password grant for a client with no cookie jar.
//
// WHAT THIS HANDLER IS
// ---------------------------------------------------------------------------
// An adapter, and deliberately nothing else. It parses a JSON body with the
// SAME schema the client validated against, hands plain data to the SAME
// `login` use-case the web form calls, and maps the coded result to a status.
// No credential check of its own, no rate-limit keys of its own, no refusal
// copy of its own — a second implementation of any of those is how the two
// transports start disagreeing about who may log in, which is the class of
// failure the shared use-case exists to prevent (ADR 2026-07-18, Decision 2).
//
// WHY THE LIMITS CANNOT BE SIDESTEPPED BY SWITCHING TRANSPORT
// ---------------------------------------------------------------------------
// `auth_login_ip` (10/min · 100/hr) and `auth_login_email` (5/min · 20/hr,
// keyed on the SHA-256 of the normalized email) are enforced inside the
// use-case, before GoTrue and before any profile read. They are therefore the
// same buckets and the same keys as the form's: an attacker who exhausts an
// account's budget on `/iniciar-sesion` does not get a fresh one here, and one
// who starts here does not get a fresh one on the form. That property is not a
// promise this file makes — it is a consequence of there being one `login`.
//
// WHAT THIS RESPONSE MUST NEVER REVEAL
// ---------------------------------------------------------------------------
// `invalid_credentials` is ONE code for "no such account" and "wrong password",
// and the two bodies are byte-identical (the use-case returns the same object;
// `__tests__/api-v1-auth-routes.test.ts` asserts the equality rather than
// trusting that two generic strings stay generic). The 429 says nothing about
// whether the email is known, and it is identical whichever of the two budgets
// ran out — the per-email one is the one that could otherwise answer "this
// account is under attack", which is a statement about an account existing.
//
// WHERE THE REFRESH ROUTE ISN'T
// ---------------------------------------------------------------------------
// There is no `POST /api/v1/auth/refresh`, on purpose. A native client refreshes
// against GoTrue directly with the `refreshToken` this endpoint returns — auth
// plane, not data plane. The full reasoning, including why that does NOT reopen
// the native-direct-Supabase trap PO decision #2 closed, is written where a
// reader will actually be looking: the `AuthSessionV1` docblock in
// `packages/contract/src/api/auth.ts`.
//
// NO CORS HEADERS. A native `fetch` does not preflight and sends no `Origin`
// this surface would have to answer for. Adding `Access-Control-Allow-*`
// speculatively would open the endpoint to any web page that wants to try
// somebody's password from a browser. Revisit when a real cross-origin web
// consumer exists, as its own change.

import type { LoginV1 } from "@dim/contract/api";
import { loginInputSchema } from "@dim/contract/input";

import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { callerIp } from "@/lib/infra/rate-limit";
import { createAnonClient } from "@/lib/supabase/anon";
import { login } from "@/src/modules/auth/application/login";

// Reads the request's own headers for the caller IP, so it can never be
// statically rendered. Declared explicitly, matching the sibling handlers.
export const dynamic = "force-dynamic";

/**
 * Ceiling for the whole exchange: two limiter writes, a GoTrue round-trip and
 * up to two profile queries. Generous compared with a dashboard read because a
 * cold GoTrue and a bcrypt verification are both legitimately slow, and a login
 * that times out at 2s on a bad network is a login the user retries — which
 * spends another slice of the budget that exists to stop exactly that.
 */
const LOGIN_BUDGET_MS = 8_000;

/** Advisory backoff when the exchange blew its budget. Not a limiter window. */
const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

// @no-auth-required: login is BY DEFINITION pre-authentication — establishing a
// session is what this endpoint is for, so there is no identity to resolve
// first. It is bounded rather than authorized, and by the same two budgets the
// web form spends: `auth_login_ip` and `auth_login_email`, both enforced inside
// the use-case BEFORE GoTrue is touched (src/modules/auth/application/login.ts).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // A malformed body never reaches the limiter, and that is deliberate: it
    // costs the platform no counter and reveals nothing. It is also the one
    // 400 a correct client cannot provoke.
    return apiV1Error("invalid_request", 400);
  }

  // The client validated against this exact schema before sending and got
  // per-field codes locally. This is the BACKSTOP, so the single-key envelope
  // (§2) is the right shape: a client that reaches here is out of step with the
  // contract package, not asking which field to highlight.
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) return apiV1Error("invalid_request", 400);

  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await withDbBudgetOrThrow(
      login(
        {
          email: parsed.data.email,
          password: parsed.data.password,
          // `returnTo` is deliberately NOT forwarded. It is the web form's
          // landing hint and this endpoint returns no landing path at all — a
          // native client owns its navigation stack. Passing a value nothing
          // reads would be the kind of dead wiring a later reader trusts.
          callerIp: callerIp(request.headers),
        },
        { auth: async () => createAnonClient().auth },
      ),
      LOGIN_BUDGET_MS,
      "api-v1-auth-login",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) {
      return apiV1Error("temporarily_unavailable", 503, {
        "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
      });
    }
    throw err;
  }

  if (!result.ok) {
    switch (result.error.code) {
      // Over one of the two budgets. NO `retry-after`: only one of the branches
      // could carry an honest value, and a header on one and not the other
      // would make the two 429s distinguishable (api-invariants.md §10).
      case "rate_limited":
        return apiV1Error("rate_limited", 429);
      case "invalid_credentials":
        return apiV1Error("invalid_credentials", 401);
      // Correct credentials, unusable account. Discloses nothing to anyone who
      // does not already hold the password.
      case "account_deactivated":
        return apiV1Error("account_deactivated", 403);
      // The schema should have caught this one line earlier; the use-case
      // re-checks because a use-case may not assume its caller validated.
      case "missing_fields":
        return apiV1Error("invalid_request", 400);
      default: {
        const unhandled: never = result.error.code;
        throw new Error(`Unhandled login failure: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  // GoTrue answered yes and issued nothing. Impossible per its own types, and
  // a 200 with `session: null` would hand a native client a "success" it cannot
  // act on — there is no cookie here to have quietly carried the credential.
  if (!result.value.session) {
    return apiV1Error("temporarily_unavailable", 503, {
      "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
    });
  }

  const payload: LoginV1 = {
    user: { id: result.value.userId, role: result.value.role },
    session: result.value.session,
  };
  return apiV1Json(payload, { status: 200 });
}
