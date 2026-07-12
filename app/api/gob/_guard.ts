// Shared non-redirect institutional gate for the /api/gob/* route handlers.
//
// The govt inspector (task #12) fetches case + pet detail through client-side
// API routes instead of a full navigation. An API route cannot redirect, so it
// must enforce the SAME full invariant set the PAGE guard
// (loadActiveInstitutionalProfile, lib/infra/auth-guards.ts →
// requireAdminOrGovtOrRedirect) enforces, but answer with a status code.
//
// This mirrors app/api/panorama/_guard.ts EXACTLY (same five invariants, same
// per-operator aggregate cap) — kept as a SIBLING rather than reused so the
// two API families rate-limit under distinct buckets ("gob_api" vs
// "panorama_api") and read as self-documenting call sites.
//
// Invariants enforced (identical to requireAdminOrGovtOrRedirect's page flow):
//   1. authenticated session            (else 401)
//   2. profile exists and NOT erased    (deletedAt === null, else 401)
//   3. role ∈ {admin, govt}             (else 403)
//   4. accountType === 'institutional'  (else 403)
//   5. deactivatedAt === null           (else 403)
//
// Jurisdiction-scope enforcement is the CALLER's responsibility (per-row 404,
// never leak existence) — this gate only resolves WHO the actor is and their
// active assignment tuples.

import { NextResponse } from "next/server";

import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";
import {
  type CachedJurisdiction,
  type CachedProfile,
  getJurisdictionsCached,
  getProfileCached,
} from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";

// Per-operator aggregate cap on the inspector fan-out (mirrors panorama MED-2).
// Generous — clips a burst-abuse pattern, never a real operator browsing a
// queue. Keyed on profile id so it bounds a single account (or a stolen
// session) regardless of source IP.
const GOB_API_MAX_PER_MINUTE = 120;

export type GobApiActor = {
  profile: CachedProfile;
  role: "admin" | "govt";
  // Empty for admin (universal scope); populated for govt with active tuples.
  jurisdictions: CachedJurisdiction[];
};

export type GobApiGuardResult =
  | { ok: true; actor: GobApiActor }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller as an ACTIVE INSTITUTIONAL admin/govt, or return the
 * NextResponse to send (401/403/429). Callers do:
 *
 *   const auth = await resolveInstitutionalGobActor();
 *   if (!auth.ok) return auth.response;
 *   const { role, jurisdictions } = auth.actor;
 */
export async function resolveInstitutionalGobActor(): Promise<GobApiGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const profile = await getProfileCached(user.id);

  // Erased account (deleted_at set): PII hashed/nulled, must not authenticate.
  if (!profile || profile.deletedAt !== null) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  // Role + account-type + deactivation — any failure → 403 (never data).
  if (
    (profile.role !== "admin" && profile.role !== "govt") ||
    profile.accountType !== "institutional" ||
    profile.deactivatedAt !== null
  ) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  // Aggregate per-operator request cap. Applied AFTER auth resolves so only
  // authenticated institutional actors are counted, keyed on profile id.
  try {
    await enforceRateLimit("gob_api", profile.id, { maxPerMinute: GOB_API_MAX_PER_MINUTE });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "rate_limited" },
          { status: 429, headers: { "Retry-After": "60" } },
        ),
      };
    }
    throw err;
  }

  const role = profile.role;
  const jurisdictions = role === "govt" ? await getJurisdictionsCached(profile.id) : [];

  return { ok: true, actor: { profile, role, jurisdictions } };
}
