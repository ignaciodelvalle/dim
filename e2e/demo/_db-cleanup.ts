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

/**
 * Repair a denuncia's jurisdiction when the geocode never resolved (fixture
 * repair, local DB only).
 *
 * WHY: the denuncia wizard fills jurisdiction_province/locality from a
 * SERVER-SIDE call to nominatim.openstreetmap.org fired when the pin drops —
 * the app never derives jurisdiction from the coordinates itself. When that
 * external call flakes (CI runners get throttled by Nominatim routinely), the
 * report still submits but lands with NULL jurisdiction, and every govt queue
 * ANDs an exact province/locality pair — so it is visible to nobody, and a
 * spec that filed a denuncia to prime a queue asserts against an empty list
 * for reasons outside the app. This sets the jurisdiction the CALLER already
 * knows (it chose the pin), and ONLY where the geocode left it NULL — a
 * resolved jurisdiction is never overwritten.
 *
 * ⚠ IT TAKES THE WELFARE REFERENCE CODE, AND IT REPAIRS BOTH TABLES.
 * This used to take one argument named `publicCode` and run a single
 * `UPDATE cases … WHERE public_code = $1`, which could never match a row:
 * `walkDenunciaWizard` returns the WELFARE REPORT's reference code
 * (`DEN-XXXXXXXX`, src/modules/welfare/domain/reference-code.ts) while a case's
 * public_code is `CAS-XXXX-XXXX` (cases-repository.generateUniqueCasePublicCode).
 * Measured on the local DB: 0 rows in `cases` carry a `DEN-` public_code
 * against 2806 welfare_reports that do. The safety net was inert.
 * It also aimed at the wrong table for the queues that matter: /gob/maltrato
 * (triage) and the Moderación stage scope on `welfare_reports.jurisdiction_*`
 * (welfareReportsScopeClause, lib/analytics/dashboards/_scope.ts), NOT on the
 * case's copy. Both are written from the same geocode, so both are repaired.
 */
export async function ensureDenunciaJurisdiction(
  referenceCode: string,
  province: string,
  locality: string,
): Promise<void> {
  const url = resolveUrl();
  if (!isLocalDatabase(url)) return;
  if (!referenceCode) return;

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // The report itself — what welfareReportsScopeClause fences the two
    // denuncia queues on.
    await sql`UPDATE welfare_reports
      SET jurisdiction_province = ${province}, jurisdiction_locality = ${locality}
      WHERE reference_code = ${referenceCode} AND jurisdiction_province IS NULL`;
    // The case create-welfare-report opened alongside it — what casesScopeClause
    // fences /gob/casos on. Joined through welfare_reports.case_id, because the
    // caller only ever holds the DEN- code.
    await sql`UPDATE cases c
      SET jurisdiction_province = ${province}, jurisdiction_locality = ${locality}
      FROM welfare_reports w
      WHERE w.reference_code = ${referenceCode}
        AND c.id = w.case_id
        AND c.jurisdiction_province IS NULL`;
  } catch {
    // Best-effort — the spec's own queue assertion reports the outcome.
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Delete every physical tag (chapa) whose lote id starts with `prefix`, plus
 * the spine events and notifications its activation/revocation produced.
 * Returns how many tag rows were removed.
 *
 * WHY: e2e/chapas.spec.ts manufactures its fixtures the way the product does —
 * an admin issues a real lote through /admin/chapas and the browser downloads
 * the issuance CSV, the ONE artifact that ever carries the plaintext activation
 * codes (issue-tag-batch.ts persists a peppered HMAC and nothing else). There
 * is no "delete a chapa" flow — nor should there be — so without this every run
 * would add a dead TAG- row to owner@dim.test's /cuenta/chapas, which is a
 * surface the demo shows to officials. Same failure mode, same remedy, as
 * deletePetsByNamePrefix below.
 *
 * `pet_events` has a BEFORE DELETE trigger enforcing the append-only spine; the
 * sanctioned escape hatch is the same GUC pair the vitest helpers use, set
 * LOCAL inside the transaction so it cannot leak to another session.
 *
 * `audit_log` is deliberately NOT swept: it is append-only by design and no
 * test cleans it (see __tests__/tag-issuance.test.ts, which keys its
 * one-row-per-batch assertion on a run-unique lote id for exactly that reason).
 *
 * LOCAL ONLY — a no-op against any non-local database.
 */
export async function deleteTagsByLotePrefix(prefix: string): Promise<number> {
  const url = resolveUrl();
  if (!isLocalDatabase(url)) {
    console.warn(`[e2e cleanup] skipped — ${url.replace(/:[^:@]*@/, ":***@")} is not local.`);
    return 0;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const doomed = await sql<Array<{ serial: string }>>`
      SELECT serial FROM pet_tags WHERE lote_id LIKE ${`${prefix}%`}`;
    if (doomed.length === 0) return 0;
    const serials = doomed.map((r) => r.serial);

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

    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.allow_event_mutation', 'true', true)`;
      await tx`SELECT set_config('app.allow_event_mutation_actor', ${actorId}, true)`;
      // The tag_activated / tag_revoked events these serials appended, and the
      // owner notifications that hang off them. Matched on the payload serial
      // because the tag row carries no event id.
      const events = await tx<Array<{ id: string }>>`
        SELECT id::text AS id FROM pet_events
        WHERE event_type IN ('tag_activated', 'tag_revoked')
          AND payload->>'serial' = ANY(${serials}::text[])`;
      const eventIds = events.map((e) => e.id);
      if (eventIds.length > 0) {
        await tx`DELETE FROM notifications WHERE related_event_id = ANY(${eventIds}::uuid[])`;
        await tx`DELETE FROM pet_events WHERE id = ANY(${eventIds}::uuid[])`;
      }
      await tx`DELETE FROM pet_tags WHERE lote_id LIKE ${`${prefix}%`}`;
    });
    return serials.length;
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
