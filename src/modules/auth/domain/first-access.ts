// First access of an institutional account — the "set your password" step.
//
// WHY THIS EXISTS (pilot T1-P3)
// ---------------------------------------------------------------------------
// An admin creates a municipal operator at /admin/govts/new. The account used
// to be born with a random throwaway password the operator never saw, and the
// only way in was a magic link the admin copied and forwarded by hand. The
// link landed on the site root, where nothing read the session it carried, so
// in practice the operator went through /recuperar to get a password at all.
//
// Now the account is born WITHOUT a password and with a flag in `app_metadata`
// (writable by the service role only — the person cannot clear it from the
// browser). The account is born CONFIRMED (an unconfirmed one can be claimed
// by a public signUp — see create-institutional-account.ts) and the link is
// mailed by the app; it lands on FIRST_ACCESS_PATH, which
// turns the link into a session and asks for a password. Until that happens,
// every page-level guard sends the session back to FIRST_ACCESS_PATH
// (lib/infra/auth-guards.ts → requireUserOrRedirect), so nothing else is
// reachable first.
//
// Mi Argentina federation: the flag is only ever set by the institutional
// creation / credential-reset use cases. A federated identity linked later
// never carries it, so this step never stands in that path.
//
// PURE ON PURPOSE: imported by a server guard and by a client component.

export const FIRST_ACCESS_PATH = "/primer-acceso";

/** Key inside GoTrue's `app_metadata`. */
export const PASSWORD_SETUP_PENDING_KEY = "password_setup_pending";

/** `app_metadata` to stamp on an account that must choose a password next. */
export function pendingPasswordSetupMetadata(): Record<string, boolean> {
  return { [PASSWORD_SETUP_PENDING_KEY]: true };
}

/** `app_metadata` patch that clears the flag once the password is set. */
export function completedPasswordSetupMetadata(): Record<string, boolean> {
  return { [PASSWORD_SETUP_PENDING_KEY]: false };
}

/**
 * True only for an explicit `true` in the GoTrue user's `app_metadata`.
 * Anything else — absent, false, a string, no metadata at all — is "not
 * pending": an account created before this step existed must never be locked
 * out by it.
 */
export function isPasswordSetupPending(user: unknown): boolean {
  if (typeof user !== "object" || user === null) return false;
  const meta = (user as { app_metadata?: unknown }).app_metadata;
  if (typeof meta !== "object" || meta === null) return false;
  return (meta as Record<string, unknown>)[PASSWORD_SETUP_PENDING_KEY] === true;
}
