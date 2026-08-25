// The Supabase client, built for ONE job: keeping the session alive.
//
// WHY THERE IS A SUPABASE CLIENT IN A BEARER-ONLY APP
// ---------------------------------------------------------------------------
// It refreshes the token, and nothing else. `@dim/contract/api` explains why
// there is no `POST /api/v1/auth/refresh` to call instead: a native client
// refreshes against GoTrue DIRECTLY, which is what the Supabase SDK does on its
// own, on a timer, and is the one thing it is unambiguously better at than a
// hand-rolled endpoint — clock skew, collapsing concurrent refreshes, retry.
// Proxying it would buy a round trip and a second place to get the
// refresh-token rotation window wrong.
//
// THIS DOES NOT REOPEN PO DECISION #2. That decision is about the DATA plane:
// pets, events and custody must not be read or written through PostgREST,
// because 14 of 15 `ownerships`-derived RLS policies carry no role predicate and
// `pet_events` INSERT checks neither role nor event type (RLS audit 2026-08-18).
// Nothing in this file touches `.from(...)`, and nothing in this app imports
// this module for anything but the auth plane.
//
// `storageKey` IS OURS ON PURPOSE — see `dropLocalSession` below. It is not
// cosmetic; it is what makes a failed sign-out recoverable.

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL, authPlaneConfigured } from "../config/api";
import { createSecureStoreAuthStorage } from "./secure-store-auth-storage";

/**
 * The key the session is stored under.
 *
 * Supabase derives one from the project ref when you do not supply it. We supply
 * it so THIS app knows the key without parsing a URL — which is what lets
 * `dropLocalSession()` delete the session even when the library refuses to.
 */
export const AUTH_STORAGE_KEY = "mimar.auth.session";

const storage = createSecureStoreAuthStorage();

let cached: SupabaseClient | null = null;

/**
 * The auth client, or `null` when this build has no auth plane configured.
 *
 * Null rather than a client pointed at an empty URL: a client with a blank host
 * fails on every call with a network error, which reads as "the user has no
 * signal" — a false diagnosis that would send people to check their wifi while
 * the build is the problem. See SUPABASE_URL in config/api.ts.
 */
export function authClient(): SupabaseClient | null {
  if (!authPlaneConfigured()) return null;
  if (cached === null) {
    cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage,
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // There is no browser URL to read a session out of. Leaving this on
        // makes the client look for one on every start, on a platform where the
        // concept does not exist.
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}

/**
 * Delete the stored session, whatever the library thinks.
 *
 * THIS EXISTS BECAUSE `signOut()` CAN FAIL AND LEAVE THE SESSION IN PLACE, and
 * that failure mode has already cost this repo an incident on the web side. Read
 * auth-js 2.105.4, `GoTrueClient._signOut`: it calls the admin sign-out and, on
 * an error that is NOT 401/403/404/session-missing, returns `{ error }` WITHOUT
 * reaching `_removeSession()`. So a 5xx or a dropped connection during "Cerrar
 * sesión" leaves the user signed in while the UI says otherwise — on the web
 * that produced a redirect loop (fixed in `/turno-vencido` the same day this was
 * written); here it would produce a phone that shows the sign-in screen and
 * still holds a live refresh token in the Keystore.
 *
 * A local delete is not a substitute for revoking at the server — the token
 * stays valid until it expires — but it is the half we can always do, and doing
 * it unconditionally is what makes "Cerrar sesión" mean something on the device
 * the user is holding. For the other half there is "Cerrar sesión en todos los
 * dispositivos", which revokes at GoTrue and is honest about being a round trip
 * that can fail.
 */
export async function dropLocalSession(): Promise<void> {
  await storage.removeItem(AUTH_STORAGE_KEY);
}
