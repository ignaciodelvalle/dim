"use server";

// Auth server actions. Called from the signup and login forms via the
// `useActionState` hook (React 19 / Next 15). Each action either redirects
// on success or returns an error state so the form can re-render with it.

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, organizationMemberships, profiles } from "@/db";
import { pgError } from "@/lib/db-errors";
import { canonicalProvinceNameForStorage } from "@/lib/jurisdiction-canonical";
import { LEGAL_VERSION } from "@/lib/legal-version";
import { pathForRole, resolveVetLanding, safeReturnTo } from "@/lib/role-landing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthFormState = {
  error: string | null;
  // Set by signupAction so the multi-step signup form knows to advance to
  // the identity step. loginAction never sets it.
  ok?: boolean;
};

// @no-auth-required: signup is by definition pre-authentication.
//
// Step 1 of the two-step signup flow. Collects email + password + TOS only.
// display_name is intentionally omitted here — the handle_new_user trigger
// (db/triggers.sql) falls back to split_part(email, '@', 1) when no
// display_name metadata is supplied, so profiles.display_name is never NULL.
// The real first+last name is collected in step 2 (completeIdentityAction),
// which overwrites the provisional value.
export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const tosAccepted = formData.get("tosAccepted") === "on";

  if (!email || !password) {
    return { error: "Faltan datos. Completá todos los campos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }
  if (!tosAccepted) {
    return { error: "Tenés que aceptar los Términos y la Política de privacidad." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // No display_name metadata — the handle_new_user trigger will derive it
    // from the email local-part. completeIdentityAction overwrites it in step 2.
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    return { error: `No se pudo crear la cuenta: ${error.message}` };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the identity-collection step (step 2).
  return { error: null, ok: true };
}

// Argentine DNI: 7–8 digits, no spaces/dots/dashes. Same regex as verifyDniAction.
const DNI_RE = /^\d{7,8}$/;

export type IdentityFormState = {
  error: string | null;
  ok?: boolean;
};

// Step 2 of the two-step signup flow. Requires an active session (set by
// signupAction → supabase.auth.signUp in step 1).
//
// Updates profiles.display_name to "${firstName} ${lastName}".
// Optionally stores profiles.dni_number (unverified — dniVerified stays false).
// The existing /cuenta/verificar-dni flow handles full verification later.
//
// DNI uniqueness: the partial unique index profiles_dni_unique_when_present
// enforces uniqueness only when the value is not null. A 23505 violation here
// means another account already holds that DNI number — surface a friendly error.
export async function completeIdentityAction(
  _previous: IdentityFormState,
  formData: FormData,
): Promise<IdentityFormState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const rawDni = String(formData.get("dni") ?? "")
    .trim()
    .replace(/[.\s-]/g, "");

  if (!firstName || !lastName) {
    return { error: "Ingresá tu nombre y apellido." };
  }

  // Validate DNI format only when provided.
  if (rawDni && !DNI_RE.test(rawDni)) {
    return { error: "El DNI debe tener 7 u 8 dígitos numéricos." };
  }

  // Location — optional. LocationFields (l1 mode) submits provinceCode (ISO)
  // + localityName. canonicalProvinceNameForStorage normalizes the ISO code to
  // the canonical province display name stored in all other jurisdiction columns.
  const jurisdictionProvince =
    canonicalProvinceNameForStorage(String(formData.get("provinceCode") ?? "").trim()) ?? null;
  const jurisdictionLocality = String(formData.get("localityName") ?? "").trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Session expired between steps — send them back to start.
    redirect("/signup");
  }

  const displayName = `${firstName} ${lastName}`.trim();

  try {
    await db
      .update(profiles)
      .set({
        displayName,
        // Store DNI as unverified. dniVerified stays false (its default).
        // The /cuenta/verificar-dni flow sets dniVerified=true with audit trail.
        ...(rawDni ? { dniNumber: rawDni } : {}),
        // Persist user location when provided. Both columns are nullable so
        // omitting them (empty form) leaves the profile without location.
        ...(jurisdictionProvince !== null ? { jurisdictionProvince } : {}),
        ...(jurisdictionLocality !== null ? { jurisdictionLocality } : {}),
        // Persist provable consent (Ley 25.326 art. 5). The TOS/privacy checkbox
        // is required in step 1 (signupAction) and step 2 is unreachable without
        // it, so reaching here means consent was given. We record it on the same
        // profile-finalization update — the first point with both an authenticated
        // session and the profile row guaranteed to exist (created by the
        // handle_new_user trigger). tosVersion captures WHAT was accepted.
        // COALESCE preserves the original consent timestamp on retries — only
        // writes now() when tos_accepted_at is currently NULL.
        tosAcceptedAt: sql`COALESCE(${profiles.tosAcceptedAt}, now())`,
        tosVersion: LEGAL_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));
  } catch (err) {
    // drizzle 0.45 wraps the pg error; pgError unwraps the `.cause` chain to
    // the real postgres-js error carrying `code` / `constraint` / `detail`.
    const info = pgError(err);
    if (
      info?.code === "23505" &&
      ((info.constraint ?? "").includes("dni") ||
        String(info.raw.detail ?? "").includes("dni_number"))
    ) {
      return { error: "Ese DNI ya está registrado por otra cuenta." };
    }
    const msg = err instanceof Error ? err.message : "error desconocido";
    return { error: `No se pudo guardar tu perfil: ${msg}` };
  }

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

// @no-auth-required: logout invalidates whatever session exists (or none).
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Variant of logoutAction that redirects back to a caller-supplied path
// instead of home. Used by public finder flows so the visitor can continue
// anonymously on the same page after signing out.
//
// @no-auth-required: logout invalidates whatever session exists (or none);
// no user identity is needed to call signOut.
export async function logoutAndReturnAction(returnTo: string) {
  const safePath = safeReturnTo(returnTo);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(safePath ?? "/");
}
