"use server";

// password-reset.ts — thin shim (strangler migration 48/61).
//
// Business logic moved to:
//   src/modules/auth/application/password-reset/
//
// This file re-exports all originally-exported symbols (2 actions + 2 types)
// with identical signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function — bare `export { x } from "..."` re-exports are rejected by the
// Next.js compiler. Types are re-exported with `export type` (erased at runtime).

import { requestPasswordResetAction as _requestPasswordResetAction } from "@/src/modules/auth/application/password-reset/request-password-reset";
import { updatePasswordAction as _updatePasswordAction } from "@/src/modules/auth/application/password-reset/update-password";

export type {
  PasswordResetRequestState,
  UpdatePasswordState,
} from "@/src/modules/auth/application/password-reset/types";

// @no-auth-required: anonymous password-reset request — user is locked out and requesting a recovery email
export async function requestPasswordResetAction(
  ...args: Parameters<typeof _requestPasswordResetAction>
) {
  return _requestPasswordResetAction(...args);
}

// @no-auth-required: auth enforced inside the delegated use-case (supabase.auth.getUser() validates the recovery session before updating the password)
export async function updatePasswordAction(...args: Parameters<typeof _updatePasswordAction>) {
  return _updatePasswordAction(...args);
}
