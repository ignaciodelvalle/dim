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

export async function requestPasswordResetAction(
  ...args: Parameters<typeof _requestPasswordResetAction>
) {
  return _requestPasswordResetAction(...args);
}

export async function updatePasswordAction(...args: Parameters<typeof _updatePasswordAction>) {
  return _updatePasswordAction(...args);
}
