// SecureStore-backed auth storage — the M2 seam. NOT IMPLEMENTED.
//
// This file exists to mark a decision point, not to do work. M1 makes exactly
// one request and it is anonymous: the public credential endpoint takes no
// bearer token, so there is no session to persist and nothing here would run.
// The seam is written down now because the shape of the thing that goes here
// constrains M2, and discovering that during M2 is how a "one afternoon" auth
// task becomes a week.
//
// ---------------------------------------------------------------------------
// WHAT GOES HERE
// ---------------------------------------------------------------------------
// `@supabase/supabase-js` accepts a custom `auth.storage` adapter — a three
// method key/value store. On the web it defaults to `localStorage`; React
// Native has no such global, so the client must be handed one explicitly or it
// silently keeps the session in memory and signs the user out on every cold
// start. The PO's decision (2026-08-25) is bearer auth against `/api/v1`, so
// this adapter holds the refresh token, and a refresh token belongs in the
// keychain / Keystore rather than in `AsyncStorage`, which is a plain file any
// backup or rooted device can read.
//
// ---------------------------------------------------------------------------
// THE TRAP THAT MUST BE SOLVED BEFORE THIS IS WRITTEN
// ---------------------------------------------------------------------------
// `expo-secure-store` has a HARD SIZE LIMIT of 2048 bytes per value on Android
// (the Keystore-backed provider). A Supabase session is an access JWT + a
// refresh token + the serialized user object, and once that user object carries
// app_metadata it routinely crosses 2 KB. The failure is not a clean throw at
// the boundary — the write fails, the session never persists, and the symptom
// is "users get logged out sometimes", which reads as a server problem.
//
// The two ways out, both of which are a real decision rather than a detail:
//
//   a) CHUNK the value across numbered keys and reassemble on read. Keeps
//      everything in the Keystore; the cost is that `removeItem` has to find
//      and delete every chunk, including orphans left by an interrupted write.
//   b) SPLIT by sensitivity — the refresh token (short, and the only thing that
//      is actually a credential) in SecureStore, the rest of the session in
//      AsyncStorage. Smaller code, but it puts the access token on disk in the
//      clear, and it needs an argument about whether that is acceptable given
//      it expires in an hour.
//
// Either way this module must be ASYNC (SecureStore's API is promise-based,
// and Supabase supports an async adapter), and it must fail SOFT: a keychain
// read that throws — a device with no passcode, a corrupted entry after an OS
// upgrade — has to behave like "no session" and send the user to the sign-in
// screen, never like an app that will not start.
//
// ---------------------------------------------------------------------------
// WHY `expo-secure-store` IS NOT IN package.json YET
// ---------------------------------------------------------------------------
// It ships native code. Adding it changes the dev-client binary, which means
// every developer has to rebuild before the JS bundle will run — and there is
// no EAS account to build one with as of 2026-08-25. So the dependency lands in
// the same change that implements this file, not before it.

/**
 * The storage contract `@supabase/supabase-js` expects at `auth.storage`.
 *
 * Declared locally rather than imported so this seam does not drag the
 * Supabase client into the M1 bundle. When the real client arrives, this type
 * should be replaced by (or checked against) the library's own.
 */
export type AuthStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Marker for the unimplemented seam, so a mistaken call is unmistakable. */
const NOT_IMPLEMENTED =
  "secure-store-auth-storage is an M2 seam and is not implemented. " +
  "Implementing it requires resolving the 2048-byte SecureStore limit — see this file's header.";

/**
 * Builds the adapter. NOT IMPLEMENTED — throws.
 *
 * It throws rather than returning a memory-backed stand-in ON PURPOSE. A silent
 * in-memory fallback would work perfectly in every manual test (the session
 * survives as long as the app stays open) and fail only on cold start, in the
 * hands of a user, as an unexplained sign-out.
 */
export function createSecureStoreAuthStorage(): AuthStorageAdapter {
  throw new Error(NOT_IMPLEMENTED);
}
