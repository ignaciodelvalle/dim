// Which database is this fence looking at? — shared by the DB-backed lints.
//
// Three fences in `pnpm verify` open a DATABASE_URL connection and judge what
// they find: lint:rls, lint:scope-authz, lint:spine. They all face the same
// two hazards, so they answer them the same way, from here:
//
//   1. A REMOTE host. The cutover runbook leaves a console with the staging
//      pooler in DATABASE_URL (readiness doc §B4). `pnpm verify` in that shell
//      audits staging without saying so — and the worst outcome is not the lost
//      half hour, it is "fixing" the wrong database. A non-local host is
//      therefore a SKIP, not a pass and not a failure, unless the operator
//      typed --allow-remote. These fences are strictly read-only, so auditing a
//      remote database on purpose is allowed — it just has to be on purpose.
//
//   2. An UNREACHABLE database. A DB-less CI box is not a failure; it is a run
//      that proved nothing, and it has to say so.
//
// The rule underneath both: silence is never the answer. Every exit path names
// the database it looked at and states which checks did not run.

/** The local Supabase stack, used when DATABASE_URL is unset. */
export const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:54322/postgres";

/** Hostnames that are unambiguously a developer's own machine / Docker stack. */
export const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
  // The hostname the Supabase CLI's own containers use on the compose network.
  "supabase_db_dim",
  "db",
]);

export type DbTarget = {
  /** Human-readable `host:port/database`, never containing credentials. */
  label: string;
  host: string;
  isLocal: boolean;
  /** Set when the URL could not be parsed at all. */
  parseError: string | null;
};

/**
 * Describe the target database WITHOUT connecting and WITHOUT ever echoing a
 * password. An unparseable URL is treated as non-local — the safe assumption.
 */
export function describeTarget(rawUrl: string): DbTarget {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const port = u.port === "" ? "5432" : u.port;
    const database = u.pathname.replace(/^\//, "") || "(default)";
    return {
      label: `${host}:${port}/${database}`,
      host,
      isLocal: LOCAL_HOSTS.has(host),
      parseError: null,
    };
  } catch (err) {
    return {
      label: "(unparseable DATABASE_URL)",
      host: "(unparseable)",
      isLocal: false,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Join message lines. Keeps every operator-facing message readable in source. */
export const lines = (...parts: string[]): string => parts.join("\n");

/**
 * The reason a non-local target is skipped, phrased for the fence at hand.
 * Returns null when the target is local or the operator opted in — i.e. when
 * the caller should go ahead and connect.
 */
export function remoteSkipReason(target: DbTarget, allowRemote: boolean): string | null {
  if (target.isLocal || allowRemote) return null;
  return target.parseError === null
    ? `DATABASE_URL points at "${target.host}", which is not a local host.`
    : `DATABASE_URL could not be parsed (${target.parseError}).`;
}

/**
 * Print a skip in the shape every fence uses: what was skipped, which database
 * it would have looked at, what did NOT run, and how to get a real run.
 */
export function reportSkip(args: {
  fence: string;
  reason: string;
  target: DbTarget;
  /** Which checks did not run, and which (if any) still did. */
  skipped: string;
  remedy: string;
}): void {
  console.warn(
    lines(
      `[skip] ${args.fence}: ${args.reason}`,
      `  Database looked at: ${args.target.label}`,
      args.skipped,
      args.remedy,
    ),
  );
}

/**
 * The remedy paragraph for a remote-host skip. Identical advice everywhere, so
 * an operator who has read it once recognises it instantly in another fence.
 */
export function remoteRemedy(reads: string): string {
  return lines(
    "  This fence judges the database your migrations run against. Auditing a remote one is a",
    "  deliberate act, not a side effect of a stale shell: re-run with --allow-remote",
    `  (the fence is strictly read-only — it ${reads} and nothing else).`,
    "  To check locally instead: pnpm db:start, then unset DATABASE_URL or point it at",
    `  ${DEFAULT_LOCAL_URL}`,
  );
}
