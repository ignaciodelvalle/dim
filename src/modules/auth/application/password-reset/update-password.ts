// Use-case: updatePasswordAction — re-verifies recovery session, validates password strength,
// then calls supabase.auth.updateUser({ password }).
//
// Runs inside a valid recovery session. Since 2026-09-15 that session comes from
// the LEGACY RECOVERY LINK and only from it (mail link → /auth/callback →
// /recuperar/actualizar): the six-digit code no longer lands here, because
// `ResetCodeStep` redeems it and sets the password in the same submit, so no
// step exists between the two for anybody to abandon. This route stays because a
// mail client, a forwarded message or an edited template can still deliver a
// link and no code, and a person holding one has no other way through.
//
// The page verifies the session before rendering the form; this action
// re-verifies to prevent direct POST abuse.

import { createClient } from "@/lib/supabase/server";
import { validateNewPassword } from "@/src/modules/auth/domain/new-password-rules";

import { revokeOtherSessions } from "./revoke-other-sessions";
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
        "Tu sesión de recuperación expiró o no es válida. Pedí un código nuevo desde la página de recuperación.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // The same two rules `ResetCodeStep` applies in the browser and the phone
  // applies in `resetPasswordWithCode`, from the one module that owns them —
  // see `new-password-rules.ts` for why they stopped living here.
  const passwordProblem = validateNewPassword(password, confirmPassword);
  if (passwordProblem) return { error: passwordProblem };

  const { error } = await supabase.auth.updateUser({ password });

  // ONE sentence for every `updateUser` failure, never GoTrue's text (A04-6).
  // Its messages here are account-state-shaped ("New password should be
  // different from the old password"), and the rule `signup.ts` states for
  // itself — never the raw Supabase text — holds in this module too. The copy
  // names the two things the person can actually do.
  if (error) {
    return {
      error:
        "No se pudo actualizar la contraseña. Probá con otra contraseña o pedí un código nuevo desde la página de recuperación.",
    };
  }

  // Revoke every OTHER session (audit 28-#MED-5). Shared with the code step,
  // which reaches the same posture from the browser — see
  // `revoke-other-sessions.ts` for the scope and the best-effort reasoning.
  await revokeOtherSessions(supabase.auth);

  return { error: null, ok: true };
}
