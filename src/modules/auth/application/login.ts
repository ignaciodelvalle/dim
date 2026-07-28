// Use-case: loginAction — password login + role-based redirect (strangler migration 26/61).
//
// @no-auth-required: login is by definition pre-authentication.

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { db, organizationMemberships, profiles } from "@/db";
import {
  RateLimitError,
  callerIp,
  emailRateLimitKey,
  enforceRateLimit,
} from "@/lib/infra/rate-limit";
import {
  isDeactivatedInstitutional,
  pathForRole,
  resolveVetLanding,
  safeReturnTo,
} from "@/lib/infra/role-landing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import type { AuthFormState } from "./types";

// Friendly, non-enumerating message shown when either the per-IP or per-email
// login budget is exceeded. Deliberately identical regardless of which budget
// tripped, so it never signals whether the email is a known account.
const TOO_MANY_ATTEMPTS = "Demasiados intentos. Esperá un momento y volvé a probar.";

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Faltan datos.", email };
  }

  // Rate limit BEFORE touching GoTrue. Two independent budgets:
  //   - per-IP:    caps credential-stuffing volume from one source.
  //   - per-email: caps a distributed (botnet) brute-force against ONE account,
  //                which the per-IP budget alone cannot stop.
  // Keyed off the trusted edge IP (callerIp: x-real-ip / last XFF hop, never the
  // spoofable first XFF segment). A non-RateLimitError propagates → fail closed.
  const ip = callerIp(await headers());
  try {
    await enforceRateLimit("auth_login_ip", ip, { maxPerMinute: 10, maxPerHour: 100 });
    await enforceRateLimit("auth_login_email", emailRateLimitKey(email), {
      maxPerMinute: 5,
      maxPerHour: 20,
    });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: TOO_MANY_ATTEMPTS, email };
    throw err;
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos.", email };
  }

  const userId = signInData.user.id;

  // returnTo wins over role-based landing when it's a safe same-origin path
  // (set by the apply-intent flow on the login form). For institutional
  // accounts we still fall through to the role landing — the (app) layout
  // would bounce them off anyway, this just shortens the loop.
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));

  // Fetch role for landing-page resolution (+ deactivation status, task #39).
  const [profile] = await db
    .select({
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  // A deactivated institutional account must not hold a session: every portal
  // guard bounces it to `/`, whose role-redirect would send it back — an
  // infinite 307 loop that ends in a browser error page with no feedback and
  // no logout surface (observed live 2026-07-04). Sign the session back out
  // and surface a real error on the form instead.
  if (isDeactivatedInstitutional(profile)) {
    await supabase.auth.signOut();
    return {
      error: "Tu cuenta institucional está desactivada. Contactá al equipo de miMAR.",
      email,
    };
  }

  const role = profile?.role ?? "owner";
  if (returnTo && role !== "admin" && role !== "govt") redirect(returnTo);

  if (role === "vet") {
    redirect(await resolveVetLanding(userId));
  }

  // For owners: check whether they hold an active admin membership in any org
  // so we can drop them directly into the org portal.
  let hasOrgAdminMembership = false;
  if (role === "owner") {
    const [membership] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.role, "admin"),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    hasOrgAdminMembership = !!membership;
  }

  redirect(pathForRole(role, { hasOrgAdminMembership }));
}
