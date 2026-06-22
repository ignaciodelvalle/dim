// Database client. Use this `db` export from server-side code (server components,
// server actions, route handlers). NEVER import this file into client components.

// Enforced boundary: pulling this module into a CLIENT bundle is now a hard build
// error with a clear message, instead of the cryptic postgres "Can't resolve 'net'".
// (Type-only `import type { ... } from "@/db"` is erased and unaffected. For const
// values/enums from the schema, import from "@/db/schema" in client code.)
import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment");
}

// In test environments (vitest runs with fileParallelism:false — one file at a
// time, single process) a large pool is wasteful and causes "worker exited
// unexpectedly" errors when connections outlive the worker lifespan or exhaust
// the Postgres connection limit (Supabase local default: 100).
//
// Cap the pool at 3 in tests:
//   - Enough for concurrent awaits within a single test file (most files do
//     ≤ 3 concurrent queries).
//   - idle_timeout: return idle connections quickly so the next test file
//     doesn't inherit open sockets from the previous file's cleanup.
//   - connect_timeout: fail fast rather than hanging if the local stack is not
//     started (gives a clear error instead of a silent hang → worker-exit).
//   - max_lifetime: recycle connections after 60 s so long-running suites do
//     not accumulate stale state across hundreds of test files.
//
// In production the default max (10) is fine; Supavisor/pgBouncer sits in
// front anyway.
const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ...(isTest && {
    max: 3,
    idle_timeout: 20, // seconds — return idle connections quickly between files
    connect_timeout: 10, // seconds — fail fast when the local stack isn't running
    max_lifetime: 60, // seconds — recycle to avoid stale-state accumulation
  }),
});

export const db = drizzle(client, { schema });

// Re-export everything from schema so app code can `import { pets, db } from "@/db"`.
export * from "./schema";
