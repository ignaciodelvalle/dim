// The narrow GoTrue surface the two pre-authentication use-cases touch, and
// the one mapper that turns its answer into wire shape (native-readiness WU-A).
//
// WHY A PORT AND NOT `SupabaseClient`
// ---------------------------------------------------------------------------
// `signup` and `login` used to build their own client by calling
// `createClient()` from `@/lib/supabase/server` — which reads `cookies()`, so
// it is `next/headers` behind an alias, and it is why both files sat on the
// application-fence exemption list. Taking the client as a PARAMETER would have
// removed the import and left the coupling: the type would still have named
// the cookie factory, and the use-case would still only be callable from
// something that has a cookie jar.
//
// So the dependency is stated as the two methods actually used. That is what
// makes ONE login use-case serve both transports:
//   · the web action passes `(await createClient()).auth` — cookies, SSR;
//   · `/api/v1/auth/login` passes an anon SDK client's `.auth` — no cookies,
//     tokens returned in the body.
// Neither transport can drift into its own credential check, its own rate-limit
// keys, or its own refusal copy, because there is only one of each.
//
// STRUCTURAL, NOT NOMINAL. Supabase's real `auth` object satisfies these types
// by shape; nothing implements them explicitly. Method shorthand is deliberate
// (bivariant parameters), so GoTrue's wider `SignInWithPasswordCredentials`
// union still assigns to the email-and-password object named here.
//
// PASS THE OBJECT, NEVER A DETACHED METHOD. `supabase.auth.signInWithPassword`
// pulled off on its own loses `this` and throws inside the SDK. Every caller
// hands over `supabase.auth` whole.

import type { AuthSessionV1 } from "@dim/contract/api";

/**
 * The subset of GoTrue's `Session` the app reads. Supabase's own type carries
 * `user`, `provider_token` and more; naming only these five keeps the port
 * honest about what is consumed and lets a test hand over a literal.
 */
export type GoTrueSessionLike = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
};

/** What `signInWithPassword` / `signUp` resolve to, narrowed to what is read. */
export type GoTrueAuthResponse = {
  data: { user: { id: string } | null; session: GoTrueSessionLike | null };
  // GoTrue's `AuthError`. Only `message` is read, and only to classify the
  // "already registered" case — never surfaced to a client verbatim, because
  // the provider's text can itself hint at account state.
  error: { message: string } | null;
};

/** What `login` needs. `signOut` is the deactivated-institutional branch. */
export type LoginAuthPort = {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<GoTrueAuthResponse>;
  signOut(): Promise<unknown>;
};

/** What `signup` needs. */
export type SignupAuthPort = {
  signUp(credentials: { email: string; password: string }): Promise<GoTrueAuthResponse>;
};

/**
 * What `requestPasswordReset` needs — ONE method, and no return value read.
 *
 * The answer is deliberately typed as `unknown` rather than as
 * `GoTrueAuthResponse`. GoTrue does return `{ data, error }` here, and the
 * use-case IGNORES both: a distinguishable answer for "no such account" is the
 * enumeration oracle the whole flow exists not to be, so the type says what the
 * code is allowed to know rather than what the SDK happens to hand over. A
 * future edit that starts branching on the error has to widen this type first,
 * which is the point at which somebody asks why.
 */
export type PasswordResetAuthPort = {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<unknown>;
};

/**
 * GoTrue's snake_case session → the camelCase `/api/v1` wire shape.
 *
 * `expires_at` is epoch SECONDS and is carried across as such, NOT converted to
 * milliseconds: the client that needs it most is the Supabase mobile SDK, whose
 * own `Session.expires_at` is in seconds, and a silent unit change between two
 * fields called the same thing is a bug that only shows up at the moment a
 * session should have been refreshed.
 *
 * Returns null for a null session, because "no session" is a legitimate
 * outcome of signup (the enumeration masquerade) and the caller must decide
 * what it means rather than receive a fabricated one.
 */
export function toAuthSessionV1(session: GoTrueSessionLike | null): AuthSessionV1 | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    expiresAt: session.expires_at ?? null,
    tokenType: session.token_type,
  };
}
