// requireLiveUser() — the ONE result-shaped liveness guard.
//
// WHAT "LIVE" MEANS
// ---------------------------------------------------------------------------
// A caller is live when all four of these hold:
//   1. the platform is accepting traffic  (maintenance kill-switch off)
//   2. a Supabase session resolves        (NO_SESSION otherwise)
//   3. the account was not erased         (profiles.deleted_at, Ley 25.326 art. 16)
//   4. the account was not deactivated    (institutional deactivation)
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
// This guard never reads a claim out of the token to decide anything: the token
// (cookie or bearer) answers WHO, and `getProfileCached` — a database read —
// answers WHETHER THEY MAY STILL ACT. That is what makes the bearer entry point
// (lib/supabase/bearer.ts, Track 2's first caller) cheap and safe: swapping the
// credential transport changes nothing about how authority is resolved.
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
import { type CachedProfile, getProfileCached } from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Why a caller is not live. Ordered by the precedence requireLiveUser applies:
 * MAINTENANCE → NO_SESSION → ACCOUNT_ERASED → DEACTIVATED.
 */
export type LiveUserFailureReason = "NO_SESSION" | "ACCOUNT_ERASED" | "MAINTENANCE" | "DEACTIVATED";

export type LiveUserSuccess = {
  ok: true;
  supabase: SupabaseServerClient;
  // email is exposed for display fallbacks (nav avatar) only — never for authz.
  user: { id: string; email?: string };
  // Already-resolved profile, so a caller that needs the role does not pay a
  // second round-trip. Null only in the mid-signup window where auth.users
  // exists and the profile row does not yet.
  profile: CachedProfile | null;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  return { ok: true, supabase, user, profile };
}
