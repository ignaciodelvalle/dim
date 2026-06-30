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

import { completeIdentityAction as _completeIdentityAction } from "@/src/modules/auth/application/complete-identity";
import { loginAction as _loginAction } from "@/src/modules/auth/application/login";
import {
  logoutAction as _logoutAction,
  logoutAndReturnAction as _logoutAndReturnAction,
} from "@/src/modules/auth/application/logout";
import { signupAction as _signupAction } from "@/src/modules/auth/application/signup";

export type { AuthFormState, IdentityFormState } from "@/src/modules/auth/application/types";

export async function signupAction(...args: Parameters<typeof _signupAction>) {
  return _signupAction(...args);
}

export async function completeIdentityAction(...args: Parameters<typeof _completeIdentityAction>) {
  return _completeIdentityAction(...args);
}

export async function loginAction(...args: Parameters<typeof _loginAction>) {
  return _loginAction(...args);
}

export async function logoutAction(...args: Parameters<typeof _logoutAction>) {
  return _logoutAction(...args);
}

export async function logoutAndReturnAction(...args: Parameters<typeof _logoutAndReturnAction>) {
  return _logoutAndReturnAction(...args);
}
