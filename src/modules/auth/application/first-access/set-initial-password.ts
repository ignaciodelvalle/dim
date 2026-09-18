// Use-case: setInitialPassword — the "establecé tu contraseña" step of an
// institutional account's first access (pilot T1-P3).
//
// The session arrives from the invite mail (or the hand-copied fallback link):
// /primer-acceso turns the link into a cookie session in the browser, then the
// form posts here. See src/modules/auth/domain/first-access.ts for the flag.
//
// WHY THE FLAG IS REQUIRED, NOT JUST A SESSION. Without it this would be a
// "change your password without typing the current one" endpoint for every
// logged-in account. The flag is only ever set by the service role (account
// creation, credential reset), so only a session that came from one of those
// links can set a password here. Anybody else is told to use /recuperar.
//
// Same password rules as every other place that sets one
// (`validateNewPassword`, src/modules/auth/domain/new-password-rules.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveUserLanding } from "@/lib/infra/role-landing";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  completedPasswordSetupMetadata,
  isPasswordSetupPending,
} from "@/src/modules/auth/domain/first-access";
import { validateNewPassword } from "@/src/modules/auth/domain/new-password-rules";

export type SetInitialPasswordState = {
  error: string | null;
  ok?: boolean;
  /** Where the account's portal starts, for the success screen's button. */
  landing?: string;
};

export const FIRST_ACCESS_MESSAGES = {
  no_session:
    "El link de acceso venció o ya se usó. Pedile a quien te creó la cuenta que te envíe uno nuevo.",
  not_pending:
    "Tu cuenta ya tiene contraseña. Si no la recordás, usá “¿Olvidaste tu contraseña?” en el inicio de sesión.",
} as const;

/**
 * @param supabase The caller's SESSION client (cookie-bound on the web; the
 *   actions layer builds it — the application layer may not reach for
 *   next/headers). Its session is the one the first-access link minted.
 */
export async function setInitialPassword(
  supabase: Pick<SupabaseClient, "auth">,
  input: { password: string; confirmPassword: string },
): Promise<SetInitialPasswordState> {
  // getUser() asks GoTrue, so both the session and the flag are the server's
  // answer — a tampered cookie or a stale token claim cannot fake either.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: FIRST_ACCESS_MESSAGES.no_session };
  if (!isPasswordSetupPending(user)) return { error: FIRST_ACCESS_MESSAGES.not_pending };

  const { password, confirmPassword } = input;
  const passwordProblem = validateNewPassword(password, confirmPassword);
  if (passwordProblem) return { error: passwordProblem };

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: `No se pudo guardar la contraseña: ${updateError.message}` };
  }

  // The flag lives in app_metadata, which only the service role may write.
  // If this call fails the password IS set; the person would be sent back to
  // this step on the next page and could simply set it again, so report it
  // rather than pretend the whole step failed.
  const { error: metaError } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: completedPasswordSetupMetadata(),
  });
  if (metaError) {
    console.error("first-access: password set but the pending flag was not cleared", metaError);
    return {
      error:
        "Tu contraseña quedó guardada, pero no pudimos terminar de activar la cuenta. Probá de nuevo en unos minutos.",
    };
  }

  return { error: null, ok: true, landing: await resolveUserLanding(user.id) };
}
