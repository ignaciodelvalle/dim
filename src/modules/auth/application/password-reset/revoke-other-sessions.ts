// `revokeOtherSessions` — the MED-5 posture, once, for both web callers.
//
// A password reset is the canonical response to a compromised account, so every
// OTHER session — a JWT plus a refresh token an attacker minted before the
// reset — must die with it. `scope: "others"` is the load-bearing word: it
// spares the session the person is holding right now, which is what keeps the
// success path from logging the legitimate user out of the browser or the phone
// they just recovered on. A global sign-out would drop them too.
//
// BEST-EFFORT, DELIBERATELY. By the time this runs the password is ALREADY
// changed. A transient failure here must never surface as a failed reset: that
// would send somebody to ask for a second code while holding a password that
// already works. It is warned about and swallowed.
//
// WHY IT TAKES THE AUTH OBJECT INSTEAD OF BUILDING A CLIENT: the two callers
// hold different clients. `updatePasswordAction` runs on the server with the
// cookie client from `@/lib/supabase/server`; `ResetCodeStep` runs in the
// BROWSER with `createBrowserClient` (see that file's header for why the
// redemption had to move there). Both expose the same `auth.signOut`, so the
// only honest shared unit is the call itself. That also keeps this module free
// of server imports, which it has to be — the browser bundles it.

type SignsOut = {
  signOut: (options: { scope: "others" }) => Promise<unknown>;
};

export async function revokeOtherSessions(auth: SignsOut): Promise<void> {
  try {
    await auth.signOut({ scope: "others" });
  } catch (signOutError) {
    console.warn("[password-reset] Failed to revoke other sessions (non-fatal):", signOutError);
  }
}
