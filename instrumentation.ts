// Next.js instrumentation hook — runs ONCE per server instance at boot,
// before any request is served (`next dev`, `next start`, and once per cold
// start in serverless deployments). This is the boot-time entry point for
// required-server-env validation (see lib/env.ts): the goal is a single
// clear "here's exactly what's missing" failure at startup instead of a
// confusing runtime 500 the first time some code path touches a
// misconfigured var.
//
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only validate in the Node.js runtime — the Edge runtime (middleware,
  // some route handlers) boots separately and doesn't need to repeat this;
  // the Node.js server instance's own register() call already covers it.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // lib/infra/env.ts validates eagerly at module-load time (throws on
    // missing/invalid vars) — importing it here is what makes that happen
    // at BOOT rather than whenever some other module first imports it.
    await import("@/lib/infra/env");

    // PROCESS-LEVEL CRASH BACKSTOP (task #74). The staging incident was an
    // UNHANDLED REJECTION from an abandoned DB query crashing the lambda
    // mid-response ("Node.js process exited") — each crash abandoned pooler
    // slots and fed a death spiral. The panorama paths now guard their own
    // fan-outs (withDbBudget + Promise.allSettled), but this is the last line
    // of defence for ANY code path: registering these handlers overrides
    // Node's default of TERMINATING the process on an unhandled rejection, so
    // a stray rejection is logged and the server keeps serving. Registered
    // once per server instance (a global flag survives dev HMR re-runs).
    registerProcessCrashGuards();
  }
}

const globalForGuards = globalThis as unknown as { __dimProcessGuards?: boolean };

function registerProcessCrashGuards(): void {
  if (globalForGuards.__dimProcessGuards) return;
  globalForGuards.__dimProcessGuards = true;

  process.on("unhandledRejection", (reason) => {
    // Log and KEEP SERVING. Without a listener, Node terminates the process
    // (Node ≥15 default) — exactly the crash that fed the spiral.
    console.error("[unhandledRejection] kept process alive:", reason);
  });

  process.on("uncaughtException", (err, origin) => {
    // A stateless request server recovers better by staying up than by dying
    // mid-response. Log with origin; do NOT process.exit().
    console.error(`[uncaughtException] (${origin}) kept process alive:`, err);
  });
}
