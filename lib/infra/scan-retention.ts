// Scan-event retention purge — Wave 5 Item 28.
//
// Deletes credential_scanned events authored by the 'scanner' role that are
// older than SCAN_RETENTION_DAYS (90 days, owner-approved TTL).
//
// PRIVACY MODEL (AGENTS.md §Scan privacy):
//   credential_scanned events with author_role='scanner' are created whenever
//   the public credential page /p/[publicToken] is viewed by a non-owner visitor.
//   The payload contains ONLY:
//     - is_self_scan: boolean (false for scanner-role events)
//     - viewer_authenticated: boolean
//   NO IP address or geolocation is stored in the payload (see app/actions/scans.ts).
//   After TTL_DAYS the event is purged.  The owner-dashboard scan-activity metric
//   (lib/owner-nudges.ts) uses the same 90-day window, so the nudge remains accurate
//   within the retained period.
//
// APPEND-ONLY CONTRACT:
//   pet_events is governed by the enforce_pet_events_append_only() trigger.
//   Migration 0104 added a narrow exception: DELETE is allowed when:
//     - author_role = 'scanner' AND event_type = 'credential_scanned'
//     - occurred_at is older than the retention window
//     - the session GUC app.allow_scan_purge = 'true' is set
//   The cron runs as service-role and sets that GUC in a transaction.  Every
//   deleted row produces an audit_log entry (action = 'scan_event_purged').
//
// Batching: PURGE_BATCH_SIZE = 500 matches the pattern in lib/data-lifecycle.ts
// to bound lock duration within Vercel's 10-second function budget.

import { sql } from "drizzle-orm";

import { db } from "@/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for credential_scanned / scanner-role events (owner-approved, Item 28). */
export const SCAN_RETENTION_DAYS = 90;

/** Maximum rows deleted per purge call. Matches lib/data-lifecycle.ts. */
const PURGE_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Purge helper
// ---------------------------------------------------------------------------

/**
 * Deletes credential_scanned events authored by the 'scanner' role that are
 * older than SCAN_RETENTION_DAYS.
 *
 * Runs inside a transaction with app.allow_scan_purge = 'true' so the
 * append-only trigger (migration 0104 exception path) permits the DELETE.
 *
 * Returns the count of deleted rows.
 */
export async function purgeExpiredScanEvents(opts?: { now?: Date }): Promise<number> {
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - SCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // The append-only trigger refuses DELETE unless app.allow_scan_purge = 'true'
  // is set within the same transaction.  set_config(key, value, is_local=true)
  // scopes the GUC to the transaction duration — it resets automatically on
  // commit or rollback.
  //
  // Note: SET LOCAL is not available via drizzle sql tagged literals because
  // postgres.js sends tagged literals as prepared statements, which cannot
  // contain SET LOCAL.  select set_config(key, value, true) is the idiomatic
  // workaround (same pattern used in scripts/seed-perf.ts).
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.allow_scan_purge', 'true', true)`);

    // Batched subquery DELETE: postgres.js does not support DELETE ... LIMIT
    // natively, so we use a subquery with LIMIT (same pattern as
    // lib/data-lifecycle.ts → purgeOldCronRuns).
    const deleted = (await tx.execute(
      sql`
        DELETE FROM pet_events
        WHERE id IN (
          SELECT id FROM pet_events
          WHERE author_role = 'scanner'
            AND event_type = 'credential_scanned'
            AND occurred_at < ${cutoff}::timestamptz
          LIMIT ${PURGE_BATCH_SIZE}
        )
        RETURNING id
      `,
    )) as Array<{ id: string }>;

    return deleted.length;
  });

  return result;
}
