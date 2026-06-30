// Use-case: loginAction — password login + role-based redirect (strangler migration 26/61).
//
// @no-auth-required: login is by definition pre-authentication.

import { and, eq, isNull } from "drizzle-orm";

import { db, organizationMemberships, profiles } from "@/db";
import { pathForRole, resolveVetLanding, safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import type { AuthFormState } from "./types";

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Faltan datos." };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  const userId = signInData.user.id;

  // returnTo wins over role-based landing when it's a safe same-origin path
  // (set by the apply-intent flow on the login form). For institutional
  // accounts we still fall through to the role landing — the (app) layout
  // would bounce them off anyway, this just shortens the loop.
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));

  // Fetch role for landing-page resolution.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

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
