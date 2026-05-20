"use server";

// Auth server actions. Called from the signup and login forms via the
// `useActionState` hook (React 19 / Next 15). Each action either redirects
// on success or returns an error state so the form can re-render with it.

import { and, eq, isNull } from "drizzle-orm";

import { db, organizationMemberships, profiles } from "@/db";
import { pathForRole, safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthFormState = {
  error: string | null;
  // Set by signupAction so the multi-step signup form knows to advance to
  // the first-pet step. loginAction never sets it.
  ok?: boolean;
};

// @no-auth-required: signup is by definition pre-authentication.
export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password || !displayName) {
    return { error: "Faltan datos. Completá todos los campos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // display_name is read by the handle_new_user trigger to populate
      // public.profiles.display_name. See db/triggers.sql.
      data: { display_name: displayName },
    },
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    return { error: `No se pudo crear la cuenta: ${error.message}` };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the first-pet step (AGENTS.md → v1 screens
  // §Signup: "*immediately* collects first pet profile in same flow").
  return { error: null, ok: true };
}

// @no-auth-required: login is by definition pre-authentication.
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

  redirect(pathForRole(role, hasOrgAdminMembership));
}

// @no-auth-required: logout invalidates whatever session exists (or none).
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
