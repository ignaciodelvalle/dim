// Direct-to-Postgres cleanup for e2e specs.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// A spec that CREATES a pet cannot delete it through the app: registration is
// an append-only act by design, and there is no "delete my pet" flow — nor
// should there be. So e2e/create-pet.spec.ts left one pet behind on every run,
// forever, and the pile had consequences beyond untidiness:
//
//   * crisis-owner-lost-flow picks an arbitrary ACTIVE pet of owner@dim.test
//     and marks it lost. It reverts afterwards, but best-effort — so an
//     interrupted run leaves a test pet publicly LOST.
//   * Live review 2026-07-28 found exactly that: ProbeAlta-1785241484517 and
//     E2EPet-1785241569076 were the TOP TWO entries on the public /perdidas
//     list, above real records, on the demo an official is shown.
//   * The owner seed account's "first pet" had become an E2E leftover.
//
// Specs run in Node, so they can talk to the local database directly. This is
// deliberately NOT wired into the app's db layer (@/db is server-only and
// carries the react-server condition); it opens its own short-lived connection.
//
// LOCAL ONLY. Every call is a no-op against a non-local database — an e2e run
// pointed at staging must never delete rows there.

import postgres from "postgres";

const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:54322/postgres";

function resolveUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_LOCAL_URL;
}

/** True only for a database on this machine. */
export function isLocalDatabase(url: string = resolveUrl()): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

/**
 * Delete every pet whose name starts with `prefix`, plus the rows that hang off
 * it. Returns how many pets were removed.
 *
 * `pet_events` has a BEFORE DELETE trigger enforcing the append-only spine; the
 * sanctioned escape hatch is the same GUC pair the vitest helpers use
 * (__tests__/_helpers/db-overrides.ts), set LOCAL inside the transaction so it
 * cannot leak to another session.
 */
/**
 * Reset the auth login rate-limit buckets (fixture cleanup, NOT a weakening
 * of the control).
 *
 * WHY: `auth_login_email` is 5/min · 20/hour keyed on the EMAIL and enforced
 * before GoTrue, and `loginAs`'s session cache lives in worker-process module
 * state — but Playwright REPLACES the worker after every test failure (and
 * `retries: 1` doubles the churn), so each failure empties the cache and costs
 * a real sign-in. A handful of genuine failures therefore exhausts
 * owner@dim.test's hourly budget and cascades into "Demasiados intentos" for
 * every later spec (CI run 30852554456: 12 refusals on top of ~4 real
 * failures). Clearing the buckets before a REAL sign-in makes the suite's
 * login cost independent of worker churn while the limiter itself stays
 * fully active in the app — the control is exercised on every login, and
 * e2e/auth.spec.ts still walks the form's refusal paths on its own.
 *
 * LOCAL ONLY — same guard as deletePetsByNamePrefix: a no-op against any
 * non-local database.
 */
export async function resetAuthLoginRateLimits(): Promise<void> {
  const url = resolveUrl();
  if (!isLocalDatabase(url)) return;

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`DELETE FROM rate_limit_buckets
      WHERE bucket_key LIKE ${"auth_login_ip:%"} OR bucket_key LIKE ${"auth_login_email:%"}`;
  } catch {
    // Best-effort: a failed reset just means the next login spends real budget.
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function deletePetsByNamePrefix(prefix: string): Promise<number> {
  const url = resolveUrl();
  if (!isLocalDatabase(url)) {
    console.warn(`[e2e cleanup] skipped — ${url.replace(/:[^:@]*@/, ":***@")} is not local.`);
    return 0;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const actor = await sql<Array<{ id: string }>>`
      SELECT p.id::text AS id FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE u.email = 'admin@dim.test' LIMIT 1`;
    const actorId = actor[0]?.id;
    if (!actorId) {
      console.warn(
        "[e2e cleanup] skipped — no admin@dim.test profile to attribute the override to.",
      );
      return 0;
    }

    const doomed = await sql<Array<{ id: string }>>`
      SELECT id::text AS id FROM pets WHERE name LIKE ${`${prefix}%`}`;
    if (doomed.length === 0) return 0;
    const ids = doomed.map((r) => r.id);

    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.allow_event_mutation', 'true', true)`;
      await tx`SELECT set_config('app.allow_event_mutation_actor', ${actorId}, true)`;
      await tx`DELETE FROM pet_events WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM ownerships WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM pet_identifications WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM pets WHERE id = ANY(${ids}::uuid[])`;
    });
    return ids.length;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
