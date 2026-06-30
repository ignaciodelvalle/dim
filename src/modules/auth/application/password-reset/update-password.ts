// Use-case: updatePasswordAction — re-verifies recovery session, validates password strength,
// then calls supabase.auth.updateUser({ password }).
//
// Runs inside a valid recovery session (established by the recovery magic link
// → auth/callback → /recuperar/actualizar). The page verifies the session before
// rendering the form; this action re-verifies to prevent direct POST abuse.

import { createClient } from "@/lib/supabase/server";

import type { UpdatePasswordState } from "./types";

export async function updatePasswordAction(
  _previous: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const supabase = await createClient();

  // Verify a valid session exists. getUser() contacts GoTrue and is not
  // spoofable via cookie tampering — it is the authoritative check.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error:
        "Tu sesión de recuperación expiró o no es válida. Solicitá un nuevo enlace desde la página de inicio de sesión.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Same strength rule as signupAction (app/actions/auth.ts).
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: `No se pudo actualizar la contraseña: ${error.message}` };
  }

  return { error: null, ok: true };
}
