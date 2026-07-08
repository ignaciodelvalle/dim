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

// Dev-only HMR guard: Next.js re-evaluates this module on every hot reload. Without
// caching the client, each recompile spins up a NEW postgres-js pool (default max 10)
// without closing the previous one — leaked pools accumulate until Postgres runs out
// of connection slots, at which point auth's profile lookup fails and the user is
// bounced to /login (looks like a 1-2 min "session expiry" on heavy operator pages).
// Caching on globalThis reuses one pool across reloads. NOT applied in test (vitest
// runs files serially in one process and relies on per-file pool recycling) or in
// production (no HMR; Supavisor/pgBouncer sits in front).
const globalForDb = globalThis as unknown as {
  __dimPgClient?: ReturnType<typeof postgres>;
  __dimPgAnalyticsClient?: ReturnType<typeof postgres>;
};

// SERVERLESS RESILIENCE (task #74 — staging DB death spiral). On Vercel each
// lambda holds its own postgres-js pool in front of the Supabase transaction
// pooler (supavisor, port 6543). Under contention on the shared micro DB the
// pooler degrades and queries hang; abandoned/slow connections then starve the
// pool further (the spiral). These options make the client FAIL FAST and RELEASE
// connections PROMPTLY instead of accumulating stuck backends. Each is chosen
// deliberately:
//   - max: 5 — keep the per-lambda pool SMALL. The console fans out ~11 queries;
//     multiplexing them over a few connections bounds how many backends one
//     lambda can pin on the shared micro DB (the root of the spiral). The client
//     budget (withDbBudget) bounds total latency so the queue can't hang a request.
//   - connect_timeout: 10s — fail with a clear error instead of hanging when the
//     pooler is unreachable/saturated.
//   - idle_timeout: 20s — return idle connections to the pooler quickly so a warm
//     lambda doesn't sit on backends between requests.
//   - max_lifetime: 300s — recycle connections so none lingers across the pooler's
//     own recycling and accumulates stale/degraded server-side state.
//   - statement_timeout / idle_in_transaction_session_timeout (15s) — the DB-level
//     backstop, sent as the libpq `options` startup parameter (`-c ...`). It
//     cancels a runaway query server-side (SQLSTATE 57014) so it releases its
//     pooler slot — verified against direct Postgres. ⚠️ MEASURED ON STAGING
//     (task #74 follow-up): supavisor TRANSACTION mode (6543) does NOT apply
//     this startup parameter — `show statement_timeout` through the pooler
//     returns the server default. It still protects direct + local + SESSION-
//     pooler connections, which is why the analytics client below (session
//     pooler) is where it actually bites in production.
// Tests keep the tighter, no-statement-timeout profile (local direct DB, serial
// runner) — a 15s statement_timeout could flake a legitimately slow suite.
const client =
  globalForDb.__dimPgClient ??
  postgres(process.env.DATABASE_URL, {
    prepare: false,
    ...(isTest
      ? {
          max: 3,
          idle_timeout: 20, // seconds — return idle connections quickly between files
          connect_timeout: 10, // seconds — fail fast when the local stack isn't running
          max_lifetime: 60, // seconds — recycle to avoid stale-state accumulation
        }
      : {
          max: 5, // small per-lambda pool — bounds backends pinned on the shared DB
          connect_timeout: 10, // seconds — fail fast when the pooler is saturated
          idle_timeout: 20, // seconds — release idle connections back to the pooler
          max_lifetime: 300, // seconds — recycle to avoid stale/degraded connections
          connection: {
            // Server-side query + idle-txn ceilings, forwarded through the
            // transaction pooler as libpq startup `options`. 15s > the client
            // budget so the client degrades first; this only fires for a truly
            // runaway query, cancelling it so it releases its pooler slot.
            options: "-c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000",
          },
        }),
  });

if (process.env.NODE_ENV === "development") globalForDb.__dimPgClient = client;

export const db = drizzle(client, { schema });

// ---------------------------------------------------------------------------
// ANALYTICS pool (task #74 follow-up — dual-pool split).
//
// MEASURED ON STAGING: the panorama analytics fan-out (getPanoramaKpis,
// universal scope, 3y window — ~11 aggregate statements) runs in ~1.7s through
// the SESSION pooler (5432) but >180s through the TRANSACTION pooler (6543) on
// the SAME freshly-restarted DB — a >100x supavisor transaction-mode pathology
// for many-statement analytics reads. And transaction mode ignores the
// `options` startup GUCs, so no statement_timeout lands there either.
//
// Split the traffic:
//   - `db` (above, DATABASE_URL → transaction pooler): ALL OLTP — short reads,
//     every write. Transaction mode is the only mode a micro instance survives
//     under wide lambda concurrency, so OLTP stays there.
//   - `analyticsDb` (ANALYTICS_DATABASE_URL → SESSION pooler, 5432): ONLY the
//     heavy read-only analytics paths (panorama repository + the dashboard
//     fetchers getPanoramaKpis composes). Falls back to DATABASE_URL when the
//     var is unset (local dev/direct connections behave identically).
//
// Session-pooler-appropriate settings — session mode assigns ONE backend per
// client connection for the connection's LIFETIME, so the pool must be tiny and
// must let go of backends fast:
//   - max: 3 — hard-bounds the backends this lambda can pin (the fan-out
//     multiplexes over them; measured total is ~1.7s anyway).
//   - idle_timeout: 10s — release the backend quickly after the burst; a warm
//     lambda must not sit on session-pooler backends between requests.
//   - max_lifetime: 300s + connect_timeout: 10s — same recycling/fail-fast
//     rationale as the OLTP pool.
//   - statement_timeout / idle_in_transaction_session_timeout (15s): session
//     mode DOES honor startup GUCs (verified: SQLSTATE 57014 cancellation), so
//     the runaway-query backstop is real on this pool.
//
// In tests both exports share ONE pool (max 3): the analytics split is a
// production concern, and a second pool would double connections per test file.
const analyticsClient = isTest
  ? client
  : (globalForDb.__dimPgAnalyticsClient ??
    postgres(process.env.ANALYTICS_DATABASE_URL ?? process.env.DATABASE_URL, {
      prepare: false, // harmless on session mode; keeps the DATABASE_URL fallback transaction-pooler-safe
      max: 3, // tiny — session mode pins one backend per connection
      connect_timeout: 10, // seconds — fail fast when the pooler is saturated
      idle_timeout: 10, // seconds — release session-pooler backends quickly
      max_lifetime: 300, // seconds — recycle to avoid stale/degraded connections
      connection: {
        options: "-c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000",
      },
    }));

if (process.env.NODE_ENV === "development") globalForDb.__dimPgAnalyticsClient = analyticsClient;

/**
 * Drizzle handle for HEAVY READ-ONLY analytics (panorama fan-out + the
 * dashboard fetchers it composes). Routed through the session pooler in
 * production (`ANALYTICS_DATABASE_URL`). Never use this for writes or for
 * request-path OLTP reads — those belong on `db`.
 */
export const analyticsDb = drizzle(analyticsClient, { schema });

// Re-export everything from schema so app code can `import { pets, db } from "@/db"`.
export * from "./schema";
