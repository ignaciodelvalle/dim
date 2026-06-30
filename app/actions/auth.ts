"use server";

// auth.ts — thin shim (strangler migration 26/61).
//
// Business logic moved to:
//   src/modules/auth/application/
//
// This file re-exports all originally-exported symbols (5 actions + 2 types)
// with identical signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

export type { AuthFormState, IdentityFormState } from "@/src/modules/auth/application/types";
export { signupAction } from "@/src/modules/auth/application/signup";
export { completeIdentityAction } from "@/src/modules/auth/application/complete-identity";
export { loginAction } from "@/src/modules/auth/application/login";
export { logoutAction, logoutAndReturnAction } from "@/src/modules/auth/application/logout";
