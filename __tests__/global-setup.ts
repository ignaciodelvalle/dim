// Vitest globalSetup — runs once in the main process before/after all test files.
//
// WHY THIS EXISTS
// ---------------
// postgres.js maintains a connection pool in the vitest worker thread. With
// fileParallelism:false, all test files share ONE worker and ONE postgres.js
// pool instance. When the worker exits after the last test file, any open
// sockets are torn down by the OS — this produces:
//
//   "Error: write EPIPE" / "Worker exited unexpectedly"
//
// We cannot drain the worker's pool from globalSetup (different process), but
// we CAN inject the VITEST env flag early enough (before any test file imports
// db/index.ts) so that db/index.ts uses the bounded pool config:
//   max: 3 + idle_timeout: 20 s + max_lifetime: 60 s + connect_timeout: 10 s
//
// With idle_timeout: 20 s the pool self-drains within 20 s of the last query
// in each file. By the time the worker is instructed to exit (after the last
// test file completes), most connections are already returned to the server,
// leaving at most one straggler which exits cleanly within the OS TCP timeout.
//
// The setup export also sets DATABASE_URL to the local Supabase stack as a
// belt-and-suspenders guard (setup.ts also sets it per-file, but globalSetup
// runs before the first file so the flag is available immediately).

const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function setup(): Promise<void> {
  // Activate the test-mode pool caps in db/index.ts.
  process.env.VITEST = "true";

  // Belt-and-suspenders: ensure DATABASE_URL is set to local before any
  // module in the main process reads it. Per-file setup.ts handles workers.
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("127.0.0.1")) {
    process.env.DATABASE_URL = LOCAL_DB_URL;
  }
}

export async function teardown(): Promise<void> {
  // No-op: pool drain happens automatically via idle_timeout in the worker.
  // If future vitest versions expose a handle to the worker module cache, we
  // can call db.$client.end() here for a hard drain. For now, idle_timeout: 20
  // ensures connections close within 20 s of the last query.
}
