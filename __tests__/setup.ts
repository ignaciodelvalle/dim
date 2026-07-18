// Vitest setup for the "db" project ONLY (serial, DB-integration tests).
//
// Loads env (via ./setup-env) and then FORCES the Postgres + Supabase URLs back
// to the local stack regardless of what's in .env.local. The integration tests
// must always run against the local Supabase + local Drizzle DB; pointing them
// at a remote project is a production incident waiting to happen (the
// seed/teardown helpers issue real auth.admin.createUser / deleteUser calls).
//
// Symptom this prevents: server actions create auth users on a remote
// project while drizzle queries hit local Postgres, so profile lookups
// fail with `PROFILE_UPDATE_FAILED: profile row not found`.
//
// The "unit" project loads only ./setup-env (no URL forcing) — safe because its
// files provably never reach the database client. See __tests__/db-reachability.ts.

// Env loading (.env.local, .env) — shared with the "unit" project.
import "./setup-env";

// Local Supabase defaults (supabase start). Override only if .env values
// are remote or missing — keep custom local ports if a dev set them.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
// New-style local key from `supabase status`. Universal across local stacks
// of the same supabase-cli version family.
const LOCAL_SERVICE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

function isLocalUrl(u: string | undefined): boolean {
  return !!u && (u.includes("127.0.0.1") || u.includes("localhost"));
}

if (!process.env.DATABASE_URL || !isLocalUrl(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = LOCAL_DB_URL;
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
}

if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ") // legacy JWT
) {
  // Either no key, or a JWT key (likely a remote project's). Replace with
  // the local-stack secret. A legitimate local JWT works too, but we can't
  // tell them apart, and forcing the local sb_secret matches `supabase status`.
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;
}
