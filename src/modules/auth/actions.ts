"use server";

// Thin action controllers for the auth domain — the WEB edge of `login` and
// `signup` (native-readiness WU-A).
//
// WHY THIS FILE EXISTS AT ALL
// ---------------------------------------------------------------------------
// The two use-cases used to do this work themselves: read `FormData`, call
// `headers()` for the caller IP, and build a cookie-backed Supabase client.
// That is a web request living inside a use-case, and it is what kept both
// files on the application-fence exemption list. Everything web-shaped moved
// HERE, which is the layer whose job it is (ADR 2026-07-18, Decision 1;
// docs/architecture/hexagonal-lite.md). What is left in `application/` is
// callable from `/api/v1`, from a script, and from a native client's request.
//
// Each action does ONLY:
//   1. Parse the form encoding (including `"on"` → boolean for the checkbox).
//   2. Resolve request context — the trusted edge IP.
//   3. Inject the GoTrue port, LAZILY (see below), and call the use-case.
//   4. Map the coded result back to AuthFormState.
//
// WHY THE CLIENT FACTORY IS LAZY AND NOT AN AWAITED CLIENT
// ---------------------------------------------------------------------------
// `createClient()` reads `cookies()`. Building it here, eagerly, would run a
// request-bound side effect BEFORE the use-case's validation and rate-limit
// gates — reordering the two things this flow is most careful about. Handing
// over a factory keeps "nothing touches GoTrue until the budgets pass" a
// property of the use-case rather than of this file's statement order.
//
// The email echo (bug #46 — React 19 resets an uncontrolled form once the
// action resolves, wiping the DOM-owned email) is added HERE, on refusals only,
// from the input this layer already holds. The signup success masquerade never
// echoes, and cannot: it returns the success arm, which has no field for one.

import { headers } from "next/headers";

import { callerIp } from "@/lib/infra/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { login } from "./application/login";
import { signup } from "./application/signup";
import type { AuthFormState } from "./application/types";

/** The cookie-backed GoTrue surface, built on first use. */
async function cookieAuth() {
  return (await createClient()).auth;
}

// @no-auth-required: pre-authentication entrypoint — login by definition requires no existing session
export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  const result = await login(
    {
      email,
      password: String(formData.get("password") ?? ""),
      returnTo: String(formData.get("returnTo") ?? ""),
      // The trusted edge IP: x-real-ip / last XFF hop, never the spoofable
      // first XFF segment. Resolved here because only this layer has a request.
      callerIp: callerIp(await headers()),
    },
    { auth: cookieAuth },
  );

  if (!result.ok) return { error: result.error.message, email };

  // NAV CONTRACT N3: return the destination, never call redirect(). That
  // response resolves while the App Router silently drops the transition —
  // lib/ui/full-page-action-nav.ts has the evidence, lint:action-redirect keeps
  // it that way, and the login screen is where it was first observed.
  return { error: null, redirectTo: result.value.landingPath };
}

// @no-auth-required: pre-authentication entrypoint — signup by definition requires no existing session
export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  const result = await signup(
    {
      email,
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
      // The HTML checkbox encoding. Translating it is this layer's job — the
      // contract package describes a boolean, because a native client has no
      // checkboxes to encode.
      tosAccepted: formData.get("tosAccepted") === "on",
      callerIp: callerIp(await headers()),
    },
    { auth: cookieAuth },
  );

  if (!result.ok) return { error: result.error.message, email };

  // Do NOT redirect. The inline signup flow uses `ok` to transition the same
  // page to the identity-collection step (step 2). The session the use-case
  // returns is deliberately dropped: the cookie client already persisted it,
  // and a form has nowhere to put a token. `/api/v1` is where it is read.
  return { error: null, ok: true };
}
