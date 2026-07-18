// Shared Vitest setup — env loading + Supabase belt-and-suspenders. Loaded by
// BOTH projects (unit + db).
//
// This half of the old __tests__/setup.ts makes .env.local / .env values
// available to any test that reads process.env (feature flags, NEXT_PUBLIC_*
// copy, keys). DATABASE_URL forcing still lives in __tests__/setup.ts (db
// project only — the only project whose files can reach the Drizzle client;
// see __tests__/db-reachability.ts).
//
// SUPABASE URL + SERVICE KEY, however, are forced to the LOCAL stack here for
// BOTH projects (Wave M hardening, Tren 1 review finding): a unit test that
// builds its own supabase-js client from env would otherwise talk to whatever
// remote project .env.local points at. The reachability classifier now also
// treats such tests as "db" (DIRECT_DB_SIGNAL_RE Supabase signals) — this
// forcing is the second, independent belt: even a test the classifier misses
// can only ever hit 127.0.0.1. Values/logic mirror __tests__/setup.ts.

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Local Supabase defaults (supabase start) — keep custom local hosts if set.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
// New-style local key from `supabase status`. Universal across local stacks
// of the same supabase-cli version family.
const LOCAL_SERVICE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

function isLocalUrl(u: string | undefined): boolean {
  return !!u && (u.includes("127.0.0.1") || u.includes("localhost"));
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
}

if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ") // legacy JWT
) {
  // Either no key, or a JWT key (likely a remote project's). Replace with the
  // local-stack secret so an env-built client can never auth against remote.
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;
}
