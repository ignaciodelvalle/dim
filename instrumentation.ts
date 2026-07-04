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
  }
}
