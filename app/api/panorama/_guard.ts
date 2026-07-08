// Shared non-redirect institutional gate for the /api/panorama/* route handlers.
//
// SECURITY (HIGH-2 + CRITICAL-1 exfil half): the three panorama API routes used
// to gate ONLY on `profile.role === 'admin' | 'govt'`. That skipped three of the
// invariants the PAGE guard (loadActiveInstitutionalProfile, lib/infra/auth-
// guards.ts) enforces, so a personal-account role='admin', a deactivated
// operator, or an erased operator could still read national panorama data
// through the API even though the page bounced them. This gate enforces the
// SAME full invariant set the page flow does, but answers with a status code
// (401/403) instead of redirecting — an API route can't redirect.
//
// Invariants enforced (identical to requireAdminOrGovtOrRedirect's page flow):
//   1. authenticated session            (else 401)
//   2. profile exists and NOT erased    (deletedAt === null, else 401 — mirrors
//                                        requireUserOrRedirect bouncing erased
//                                        accounts to /login, Ley 25.326 art. 16)
//   3. role ∈ {admin, govt}             (else 403)
//   4. accountType === 'institutional'  (else 403)
//   5. deactivatedAt === null           (else 403)

import { NextResponse } from "next/server";

import {
  type CachedJurisdiction,
  type CachedProfile,
  getJurisdictionsCached,
  getProfileCached,
} from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";

export type PanoramaActor = {
  profile: CachedProfile;
  role: "admin" | "govt";
  // Empty for admin (universal scope); populated for govt with active tuples.
  jurisdictions: CachedJurisdiction[];
};

export type PanoramaGuardResult =
  | { ok: true; actor: PanoramaActor }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller as an ACTIVE INSTITUTIONAL admin/govt, or return the
 * NextResponse to send (401/403). Callers do:
 *
 *   const auth = await resolveInstitutionalPanoramaActor();
 *   if (!auth.ok) return auth.response;
 *   const { role, jurisdictions } = auth.actor;
 */
export async function resolveInstitutionalPanoramaActor(): Promise<PanoramaGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const profile = await getProfileCached(user.id);

  // Erased account (deleted_at set): PII hashed/nulled, must not authenticate.
  // The page flow bounces these to /login; the API answers 401.
  if (!profile || profile.deletedAt !== null) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  // Role + account-type + deactivation — the three checks the page guard's
  // loadActiveInstitutionalProfile centralizes. Any failure → 403 (never data).
  if (
    (profile.role !== "admin" && profile.role !== "govt") ||
    profile.accountType !== "institutional" ||
    profile.deactivatedAt !== null
  ) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const role = profile.role;
  const jurisdictions = role === "govt" ? await getJurisdictionsCached(profile.id) : [];

  return { ok: true, actor: { profile, role, jurisdictions } };
}
