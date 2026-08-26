// requireLiveUser() — the ONE result-shaped liveness guard.
//
// WHAT "LIVE" MEANS
// ---------------------------------------------------------------------------
// A caller is live when all five of these hold:
//   1. the platform is accepting traffic  (maintenance kill-switch off)
//   2. a Supabase session resolves        (NO_SESSION otherwise)
//   3. the account was not erased         (profiles.deleted_at, Ley 25.326 art. 16)
//   4. the account was not deactivated    (institutional deactivation)
//   5. an INSTITUTIONAL principal is still inside its 8-hour shift (B9)
//
// WHY IT EXISTS — this is a live web bug, not native prep
// ---------------------------------------------------------------------------
// Before this module those four checks lived in four different places and none
// of them covered a WRITE:
//   - maintenance:  four layouts (app/(app), app/gob, app/admin, app/org/[t]).
//     A layout gates a RENDER. A Server Action POST executes its body BEFORE any
//     layout re-renders, so a maintenance window never stopped an in-flight
//     write — the mutation committed and the user was then shown the
//     maintenance screen. Measured, not inferred.
//   - erasure:      requireUserOrRedirect + requirePetAccess, plus five
//     hand-copied inline `profile?.deletedAt != null` snippets. 19 exported
//     server actions resolved identity on a bare `auth.getUser()` with NO
//     erasure check of any kind (enumerated with the repo's own
//     scripts/check-authz-guards.ts discovery — see the T1.2 report).
//   - deactivation: only inside loadActiveInstitutionalProfile, i.e. only on the
//     /admin and /gob page guards.
//
// THE INVARIANT THIS PROTECTS
// ---------------------------------------------------------------------------
// Authorization is 100% DB-resolved (zero `auth.jwt()` across 276 RLS policies).
// This guard never reads a claim out of the token to decide WHAT A CALLER MAY
// DO: the token (cookie or bearer) answers WHO, and `getProfileCached` — a
// database read — answers WHETHER THEY MAY STILL ACT. That is what makes the
// bearer entry point (lib/supabase/bearer.ts, Track 2's first caller) cheap and
// safe: swapping the credential transport changes nothing about how authority is
// resolved.
//
// B9 ADDED EXACTLY ONE READ FROM THE TOKEN, and narrowed the sentence above from
// "never reads a claim to decide anything" to what it always meant. The shift
// check needs to know WHEN THIS SESSION WAS AUTHENTICATED, and that is a fact
// about the credential, not about the account — our database has no row for it
// (GoTrue owns `auth.sessions`, which PostgREST does not expose). The role that
// selects the policy is still read from `profiles`; only the credential's own age
// comes from the credential, only after `auth.getUser()` has had GoTrue validate
// that exact token, and never from a client clock. lib/infra/operator-shift.ts
// carries the full argument and the measurements behind it.
//
// AND WHAT IT DOES NOT COVER
// ---------------------------------------------------------------------------
// This is an APP-LAYER guard. Drizzle connects with postgres-js and bypasses
// RLS, so for server-side writes it is the boundary. It is NOT a substitute for
// RLS on anything a PostgREST caller could reach directly with the same bearer
// token: 14 of 15 `ownerships`-derived policies carry no role predicate and
// `pet_events` INSERT checks neither role nor event type (RLS audit 2026-08-18).
// A bearer client that talks to Supabase directly is not gated by this file at
// all. Track 2's decision — native talks to our own /api/v1, never to Supabase
// directly — is what keeps that gap closed, and it is a deployment invariant,
// not something this module can enforce.

import { isMaintenanceMode } from "@/lib/domain/maintenance-mode";
import {
  OPERATOR_SHIFT_EXPIRED_MESSAGE,
  isOperatorShiftExpired,
  verifiedSessionStart,
} from "@/lib/infra/operator-shift";
import { type CachedProfile, getProfileCached } from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Why a caller is not live. Ordered by the precedence requireLiveUser applies:
 * MAINTENANCE → NO_SESSION → ACCOUNT_ERASED → DEACTIVATED → SHIFT_EXPIRED.
 */
export type LiveUserFailureReason =
  | "NO_SESSION"
  | "ACCOUNT_ERASED"
  | "MAINTENANCE"
  | "DEACTIVATED"
  | "SHIFT_EXPIRED";

export type LiveUserSuccess = {
  ok: true;
  supabase: SupabaseServerClient;
  // email is exposed for display fallbacks (nav avatar) — never as the PRINCIPAL
  // an authorization decision keys on. That rule stands: an address is mutable
  // and reassignable, `id` is not, so a guard that asked "is this caller allowed"
  // by e-mail would be asking the wrong question.
  //
  // ONE EXCEPTION EXISTS, and it is recorded here rather than left to be
  // rediscovered as a contradiction: an ADDRESSEE match is not a principal
  // check. `pet_transfers` and `pet_caretaker_grants` can be addressed to
  // somebody who has no account yet, so the row stores an e-mail and
  // `validateRecipientMatch` (transfers/domain/owner-transfer-rules.ts:124-134)
  // compares it — id when `to_owner_id` resolved, e-mail only when it did not.
  // The web's own actions already feed that comparison from
  // `supabase.auth.getUser()`, i.e. this same verified value
  // (`src/modules/transfers/actions.ts:174-176`), and
  // `app/api/v1/me/transfers/route.ts` reads it here instead of paying a second
  // GoTrue round-trip for the identical answer.
  //
  // What makes it safe is that the value is VERIFIED — it comes from the token
  // GoTrue just validated, never from a request body or header — and that the
  // rule it feeds is "was this row addressed to you", not "may you do this".
  user: { id: string; email?: string };
  // Already-resolved profile, so a caller that needs the role does not pay a
  // second round-trip. Null only in the mid-signup window where auth.users
  // exists and the profile row does not yet.
  profile: CachedProfile | null;
  /**
   * When THIS session was authenticated, from the GoTrue-signed `amr` claim of
   * the token this call just had validated. Null when the token carried no
   * usable timestamp — which is NOT a licence to conclude the session is fresh;
   * operator-shift.ts explains why that case fails open and reports.
   *
   * Resolved for EVERY caller, not only institutional ones, and the cost is why
   * that is affordable: on the bearer path the token is already in hand, and on
   * the cookie path `getSession()` is a cookie read plus a JSON parse — the
   * network round-trip belongs to `getUser()`, which has already happened.
   *
   * It is resolved unconditionally because the org capability path
   * (authz-resolver.ts) needs it for a caller this file cannot recognise: an org
   * staffer may hold a PERSONAL profile, so the institutional check below does
   * not fire for them, yet an org console is an operator surface under B9.
   * Making the field conditional would make `null` mean two different things.
   */
  sessionStartedAt: Date | null;
};

export type LiveUserFailure = {
  ok: false;
  // Null on MAINTENANCE: the kill-switch answers before any client is built, so
  // there is deliberately nothing to hand back. Callers must not depend on it.
  supabase: SupabaseServerClient | null;
  // Populated on every refusal that got as far as resolving a session, so the
  // page-level wrapper can hand a tolerated refusal (DEACTIVATED) back as a
  // complete session instead of reconstructing one.
  user: { id: string; email?: string } | null;
  reason: LiveUserFailureReason;
  // Ready-to-render es-AR copy, identical to liveUserMessage(reason).
  error: string;
};

export type LiveUserResult = LiveUserSuccess | LiveUserFailure;

export type RequireLiveUserOptions = {
  /**
   * Credential source. Omit for the cookie path (Server Components, Server
   * Actions, cookie-authenticated Route Handlers). Track 2 passes the client
   * built by createClientFromBearer() so a bearer request is resolved by this
   * exact guard rather than by a parallel one.
   */
  supabase?: SupabaseServerClient;
  /**
   * The raw access token, when the caller has one — i.e. the bearer path, where
   * `createClientFromBearer` returns it alongside the client.
   *
   * Handed straight to `auth.getUser(jwt)` so validating THIS token is what the
   * code says rather than what an supabase-js internal happens to do. See the
   * note at the call site. Omit on the cookie path.
   *
   * It is never logged, never decoded here, and never used to decide anything:
   * the answer to "who is this" comes from GoTrue validating it, and the answer
   * to "what may they do" comes from the database.
   */
  accessToken?: string;
};

const MESSAGES: Record<LiveUserFailureReason, string> = {
  // Byte-identical to the strings already hand-copied across the write
  // boundaries this guard replaces, so the migration is invisible on screen.
  NO_SESSION: "Sesión expirada.",
  ACCOUNT_ERASED: "Tu cuenta fue eliminada.",
  MAINTENANCE:
    "miMAR está en mantenimiento. Tu cambio no se registró — probá de nuevo en unos minutos.",
  // Same wording the login form already shows for this case (login.ts).
  DEACTIVATED: "Tu cuenta institucional está desactivada. Contactá al equipo de miMAR.",
  // Says what happened AND what to do. "Sesión expirada." would be a lie by
  // omission here: the token has not expired, the workday has, and an operator
  // told the former will refresh and be refused again.
  SHIFT_EXPIRED: OPERATOR_SHIFT_EXPIRED_MESSAGE,
};

/** es-AR refusal copy for a liveness failure. */
export function liveUserMessage(reason: LiveUserFailureReason): string {
  return MESSAGES[reason];
}

export type OptionalLiveUserSuccess = {
  ok: true;
  supabase: SupabaseServerClient;
  // Null means "no session, and that is allowed here".
  user: { id: string; email?: string } | null;
  profile: CachedProfile | null;
};

export type OptionalLiveUserResult =
  | OptionalLiveUserSuccess
  | (LiveUserFailure & { reason: Exclude<LiveUserFailureReason, "NO_SESSION"> });

/**
 * Same guard, for the three write boundaries where an ANONYMOUS caller is
 * legitimate: the anonymous denuncia (createWelfareReportAction) and the two
 * adoption-application actions, all of which pass `applicant: user ? … : null`
 * into their use-case.
 *
 * "Anonymous is allowed" is not the same claim as "erased, deactivated and
 * mid-maintenance are allowed", which is what a bare `auth.getUser()` gave them.
 * NO_SESSION becomes `user: null`; every other refusal is still a refusal.
 *
 * Deliberately NOT "fall back to anonymous" for an erased account: that would
 * launder a submission from a subject whose PII has already been hashed into an
 * apparently-anonymous one. Refusing says what happened.
 */
export async function resolveOptionalLiveUser(
  options?: RequireLiveUserOptions,
): Promise<OptionalLiveUserResult> {
  const live = await requireLiveUser(options);
  if (live.ok) return live;
  if (live.reason === "NO_SESSION" && live.supabase) {
    return { ok: true, supabase: live.supabase, user: null, profile: null };
  }
  return live as OptionalLiveUserResult;
}

/**
 * Is the platform-wide maintenance kill-switch on?
 *
 * ONE authority for "which env var, read how". The four portal layouts read
 * `process.env.NEXT_PUBLIC_MAINTENANCE_MODE` directly and each decided for
 * itself; four copies of a kill-switch is three chances for one of them to be
 * missed when the variable is renamed, and it is exactly why nothing enforced
 * maintenance on the WRITE path.
 *
 * Layouts still call this and RENDER their portal's screen — that is a layout's
 * job, and rendering in place keeps the URL and costs no round-trip. What moved
 * into requireLiveUser is the ENFORCEMENT: a layout gates a render, and a render
 * is not what a server action performs.
 */
export function isPlatformInMaintenance(): boolean {
  return isMaintenanceMode(process.env.NEXT_PUBLIC_MAINTENANCE_MODE);
}

/**
 * Resolve the caller as a LIVE user, or say why not.
 *
 * Precedence is deliberate:
 *   1. MAINTENANCE — an env read, evaluated before any client or query. The
 *      four portal layouts already short-circuit here for the same reason: the
 *      kill-switch has to work when the DATABASE is the thing being maintained,
 *      so it must not depend on a round-trip.
 *   2. NO_SESSION
 *   3. ACCOUNT_ERASED — outranks deactivation: an erased account has no identity
 *      left to be "merely deactivated".
 *   4. DEACTIVATED
 *   5. SHIFT_EXPIRED — LAST, and the order is the point. It is the mildest
 *      refusal and the only recoverable one: the remedy is to sign in again. An
 *      erased or deactivated account must not be told "your shift ended", which
 *      would invite it to retry forever against an account that will never work.
 */
export async function requireLiveUser(options?: RequireLiveUserOptions): Promise<LiveUserResult> {
  if (isPlatformInMaintenance()) {
    return {
      ok: false,
      supabase: null,
      user: null,
      reason: "MAINTENANCE",
      error: MESSAGES.MAINTENANCE,
    };
  }

  const supabase = options?.supabase ?? (await createClient());
  // The token is passed EXPLICITLY on the bearer path, and that is a hardening,
  // not a style preference (pre-push review, WU-A range).
  //
  // A bare `getUser()` on a client built by `createClientFromBearer` works today
  // only because supabase-js sets an internal `hasCustomAuthorizationHeader`
  // flag when a custom `Authorization` header is present, and auth-js
  // special-cases that flag to validate the header's token instead of looking
  // for a stored session. Nothing in the public API says so. An SDK downgrade —
  // or a refactor inside auth-js — turns every bearer request into a permanent
  // 401 with no other symptom, on the one code path a native client cannot work
  // around. `getUser(jwt)` is the DECLARED way to ask the same question, so the
  // behaviour stops being incidental.
  //
  // The cookie path passes nothing and is byte-identical to before: there is no
  // token in hand there, and `getUser()` reading the SSR client's stored session
  // is exactly what it is documented to do.
  const {
    data: { user },
  } = await supabase.auth.getUser(options?.accessToken);
  if (!user) {
    return { ok: false, supabase, user: null, reason: "NO_SESSION", error: MESSAGES.NO_SESSION };
  }

  // DB-resolved, never claim-resolved. Request-memoized, so a render pass that
  // also hits a layout guard and a page pays exactly one round-trip.
  const profile = await getProfileCached(user.id);

  // LOOSE `!= null`, deliberately — byte-for-byte the predicate the guards this
  // module absorbs already used (`profile?.deletedAt != null` in
  // requireUserOrRedirect and requirePetAccess). lib/infra/role-landing.ts's
  // isErasedAccount/isDeactivatedInstitutional use STRICT `!== null`, which
  // treats a profile shape that simply omits the column as erased. Production
  // never sees that (getProfileCached always selects both columns) but the
  // difference is real and this guard is not the place to change it — see the
  // adjacent finding in the T1.2 report.
  if (profile?.deletedAt != null) {
    return {
      ok: false,
      supabase,
      user: { id: user.id },
      reason: "ACCOUNT_ERASED",
      error: MESSAGES.ACCOUNT_ERASED,
    };
  }

  // Institutional-only, matching isDeactivatedInstitutional. `deactivated_at` on
  // a PERSONAL account is today a bookkeeping flag that nothing reads for access
  // — see the T1.2 report: self-deactivating a personal account currently costs
  // the user nothing, and closing that needs a landing screen to bounce to, not
  // a one-line predicate widening here.
  if (profile?.accountType === "institutional" && profile.deactivatedAt != null) {
    return {
      ok: false,
      supabase,
      // email carried here (and NOT on the erased branch) because this is the
      // one refusal a page-level caller is allowed to tolerate — see
      // requireUserOrRedirect. An erased account has no identity left to hand back.
      user: { id: user.id, email: user.email },
      reason: "DEACTIVATED",
      error: MESSAGES.DEACTIVATED,
    };
  }

  // B9. The token was validated by `getUser()` immediately above, which is the
  // precondition `verifiedSessionStart` documents — this is the one place in the
  // codebase allowed to make that call, and it is a few lines from the proof.
  const sessionStartedAt = await resolveSessionStart(supabase, options?.accessToken);

  if (isInstitutionalPrincipal(profile)) {
    if (isOperatorShiftExpired({ sessionStartedAt, context: "live-user" })) {
      return {
        ok: false,
        supabase,
        // Carried, like DEACTIVATED: the caller that translates this refusal has
        // to sign the operator out, and signing out is something you do to a
        // known identity.
        user: { id: user.id, email: user.email },
        reason: "SHIFT_EXPIRED",
        error: MESSAGES.SHIFT_EXPIRED,
      };
    }
  }

  return { ok: true, supabase, user, profile, sessionStartedAt };
}

/**
 * When the session behind this request was authenticated, or null. (B9)
 *
 * TWO SOURCES, PICKED BY PATH RATHER THAN BY FALLBACK. The bearer path was
 * handed the raw token, so it is used directly and `getSession()` is never
 * called — a bearer client stores no session and asking it would be a round trip
 * to learn nothing. The cookie path reads the token back from the SSR client.
 *
 * `getSession()` does NOT re-validate, which is exactly why it must never answer
 * "who". It does not need to here: `getUser()` has just accepted the same
 * cookie, so the token this returns is the one GoTrue vouched for moments ago.
 * Only `access_token` is read; `session.user` is deliberately ignored.
 *
 * SWALLOWS ITS OWN FAILURE, and the direction matches the rest of the shift
 * machinery. This is a supplementary read supporting a REFINEMENT of a bound
 * GoTrue still enforces globally. If it throws — an SDK shape change, a client
 * that does not implement it — the honest outcome is "session start unknown",
 * which `isOperatorShiftExpired` already handles by failing open AND reporting.
 * Letting it propagate would convert a degraded hardening into a total outage of
 * every authenticated surface, which is a far worse failure than the one it
 * guards against.
 */
async function resolveSessionStart(
  supabase: SupabaseServerClient,
  accessToken: string | undefined,
): Promise<Date | null> {
  if (accessToken) return verifiedSessionStart(accessToken);
  try {
    const { data } = await supabase.auth.getSession();
    return verifiedSessionStart(data.session?.access_token);
  } catch {
    return null;
  }
}

/**
 * Does the 8-hour shift apply to this profile? (B9)
 *
 * An OR over role and accountType, not an AND, and not a check of either one
 * alone. The DB-level `profiles_account_type_role_match` CHECK was added in
 * migration 0015 and DROPPED in 0016 in favour of app-layer enforcement, so
 * nothing in Postgres guarantees the two columns agree. A `govt` row that says
 * `personal`, or an `institutional` row still carrying `owner`, is a shape the
 * database permits — and either one is an operator account. The union is the
 * predicate that survives that looseness; requiring both would let a single
 * mismatched column silently opt an operator out of the boundary.
 *
 * Exported for the org capability path, which applies the same policy to a
 * principal this predicate cannot see (org staff on a personal profile).
 *
 * A null profile — the mid-signup window, where auth.users exists and the
 * profile row does not — is NOT institutional. There is no operator yet, and
 * refusing there would break signup for everybody.
 */
export function isInstitutionalPrincipal(profile: CachedProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.accountType === "institutional" || profile.role === "govt" || profile.role === "admin"
  );
}
