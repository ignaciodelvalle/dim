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
// function. Types are re-exported with `export type` (erased at runtime).

export type { PasswordResetRequestState, UpdatePasswordState } from "@/src/modules/auth/application/password-reset/types";
export { requestPasswordResetAction } from "@/src/modules/auth/application/password-reset/request-password-reset";
export { updatePasswordAction } from "@/src/modules/auth/application/password-reset/update-password";
