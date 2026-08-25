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
// function — bare `export { x } from "..."` re-exports are rejected by the
// Next.js compiler. Types are re-exported with `export type` (erased at runtime).

// login and signup now come from the module's ACTION layer, not from
// application/: WU-A moved their FormData parsing, header read and Supabase
// client out of the use-cases so those could be called from /api/v1 too.
import {
  loginAction as _loginAction,
  signupAction as _signupAction,
} from "@/src/modules/auth/actions";
import { completeIdentityAction as _completeIdentityAction } from "@/src/modules/auth/application/complete-identity";
import {
  logoutAction as _logoutAction,
  logoutAndReturnAction as _logoutAndReturnAction,
} from "@/src/modules/auth/application/logout";
import { revokeAllSessionsAction as _revokeAllSessionsAction } from "@/src/modules/auth/application/revoke-sessions-action";

export type { AuthFormState, IdentityFormState } from "@/src/modules/auth/application/types";

// @no-auth-required: pre-authentication entrypoint — signup by definition requires no existing session
export async function signupAction(...args: Parameters<typeof _signupAction>) {
  return _signupAction(...args);
}

// @no-auth-required: auth enforced inside the delegated use-case (supabase.auth.getUser() gates the write; session established by step-1 signupAction)
export async function completeIdentityAction(...args: Parameters<typeof _completeIdentityAction>) {
  return _completeIdentityAction(...args);
}

// @no-auth-required: pre-authentication entrypoint — login by definition requires no existing session
export async function loginAction(...args: Parameters<typeof _loginAction>) {
  return _loginAction(...args);
}

// @no-auth-required: logout invalidates whatever session exists (or none) — no identity required to sign out
export async function logoutAction(...args: Parameters<typeof _logoutAction>) {
  return _logoutAction(...args);
}

// @no-auth-required: logout invalidates whatever session exists (or none) — no identity required to sign out
export async function logoutAndReturnAction(...args: Parameters<typeof _logoutAndReturnAction>) {
  return _logoutAndReturnAction(...args);
}

// @no-auth-required: authorization happens INSIDE the delegated use-case, whose
// first statement is requireLiveUser() and which refuses without a live session.
// B11 — revokes every session of the caller, this browser's included.
export async function revokeAllSessionsAction(
  ...args: Parameters<typeof _revokeAllSessionsAction>
) {
  return _revokeAllSessionsAction(...args);
}
