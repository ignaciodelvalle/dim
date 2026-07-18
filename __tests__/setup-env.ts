// Shared Vitest setup — env loading ONLY. Loaded by BOTH projects (unit + db).
//
// This half of the old __tests__/setup.ts carries NO database coupling: it just
// makes .env.local / .env values available to any test that reads process.env
// (feature flags, NEXT_PUBLIC_* copy, keys). It does NOT force DATABASE_URL /
// SUPABASE_URL to the local stack — that lives in __tests__/setup.ts and loads
// only in the "db" project, which is the only project whose files can reach the
// database client (see __tests__/db-reachability.ts for why that is safe).

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
