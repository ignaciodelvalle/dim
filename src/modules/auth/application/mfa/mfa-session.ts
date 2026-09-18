// The session the /mfa pages and their actions work with (T2-S6).
//
// WHY NOT requireLiveUser. requireLiveUser REFUSES exactly the session these
// pages exist for — an institutional operator who signed in with a password but
// has not passed (or not yet configured) the second factor — so calling it here
// would bounce the person away from the only screen that can let them in. This
// is the /primer-acceso shape: read GoTrue directly, re-check what matters, and
// never grant anything beyond the factor step itself.
//
// Server-side facts only: `getUser()` round-trips the cookie to GoTrue (and
// returns the account's factors), and the `aal` claim is read from the token
// that same call validated.

import { isInstitutionalPrincipal } from "@/lib/infra/live-user";
import type { SupabaseServerClient } from "@/lib/infra/live-user";
import { isOperatorShiftExpired, sessionStartFromClaims } from "@/lib/infra/operator-shift";
import { getProfileCached } from "@/lib/infra/request-cache";
import { assuranceLevel, verifiedSessionClaims } from "@/lib/infra/verified-token-claims";
import {
  type MfaFactorLike,
  type MfaRequirement,
  mfaRequirement,
} from "@/src/modules/auth/domain/mfa-policy";

export type MfaSession = {
  supabase: SupabaseServerClient;
  userId: string;
  /** Institutional, not erased, not deactivated — the only accounts MFA applies to. */
  eligible: boolean;
  requirement: MfaRequirement;
  /**
   * The 8-hour operator shift (B9) ran out for this session. The factor step
   * must not revive a session requireLiveUser would refuse anyway: the pages
   * send it to /turno-vencido and the actions refuse.
   */
  shiftExpired: boolean;
  /** Id of the verified TOTP factor, when there is one. */
  verifiedFactorId: string | null;
};

type FactorRow = MfaFactorLike & { id: string };

/**
 * The cookie client is handed in by the actions layer or the page (the
 * application layer does not build one — native-readiness T1.3).
 */
export async function loadMfaSession(supabase: SupabaseServerClient): Promise<MfaSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfileCached(user.id);
  // The SAME predicate requireLiveUser enforces with, so the two cannot drift.
  const eligible =
    isInstitutionalPrincipal(profile) &&
    profile?.deletedAt == null &&
    profile?.deactivatedAt == null;

  const factors = ((user as { factors?: FactorRow[] }).factors ?? []) as FactorRow[];
  const verified = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
  const claims = await verifiedSessionClaims(supabase);
  const shiftExpired =
    eligible &&
    isOperatorShiftExpired({
      sessionStartedAt: sessionStartFromClaims(claims),
      context: "mfa-session",
    });

  return {
    supabase,
    userId: user.id,
    eligible,
    shiftExpired,
    requirement: mfaRequirement({ factors, aal: assuranceLevel(claims) }),
    verifiedFactorId: verified?.id ?? null,
  };
}
