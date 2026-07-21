// Shared outbox list filter/query builder (#26 admin↔gob drift unification,
// D3).
//
// app/admin/outbox/page.tsx and app/gob/outbox/page.tsx used to hand-roll the
// SAME filter-building SQL twice (gob/outbox's header literally said "Adapted
// from /admin/outbox/page.tsx"), duplicating OUTBOX_PAGE_LIMIT and
// VALID_PROVINCE_NAMES along with it. The two forks differed ONLY by one
// extra jurisdiction WHERE clause on the govt side. This module is now the
// single source of both constants and the WHERE-clause assembly.
//
// PARITY CONTRACT: buildOutboxWhere(filters, opts) must produce the exact
// same conditions (in the same order) that each page's inline builder used
// to produce for the same inputs — the ONLY difference is the jurisdiction
// predicate, controlled by `opts.jurisdiction`:
//   - `undefined`            → admin / universal — NO jurisdiction clause at
//                              all (today's /admin/outbox behavior).
//   - a (possibly empty) array → govt — a jurisdiction clause is ALWAYS
//                              applied. A non-empty array scopes to those
//                              (province, locality) pairs via
//                              jurisdictionPairClause (whole-province
//                              subsumption, same as every other jurisdiction-
//                              scoped fetcher). An EMPTY array fails CLOSED
//                              (`sql\`false\`` — matches nothing), never
//                              "no restriction": today's /gob/outbox page
//                              never reaches the query with an empty
//                              jurisdictions array (its hasAccess gate bails
//                              out first with a "Sin acceso" screen), so this
//                              fail-closed branch is unreachable via either
//                              existing page today — it is defensive parity
//                              for any FUTURE caller of this shared builder,
//                              not a behavior change for the two current
//                              pages. See the unit tests for the "applies the
//                              jurisdiction predicate iff scope is provided"
//                              assertion this contract implies.

import { type SQL, and, eq, lt, sql } from "drizzle-orm";

import { eventNotificationOutbox } from "@/db";
import type { OutboxStatus, OutboxTargetKind } from "@/db";
import { jurisdictionPairClause } from "@/lib/metrics/scope";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { keysetWhere } from "@/lib/utils/keyset-pagination";

/** Set of canonical province names for filter validation. */
export const VALID_PROVINCE_NAMES = new Set<string>(PROVINCES.map((p) => p.name));

/** Page size for both /admin/outbox and /gob/outbox. */
export const OUTBOX_PAGE_LIMIT = 200;

const VALID_STATUS_VALUES: readonly string[] = ["pending", "delivered", "failed"];
const VALID_TARGET_KIND_VALUES: readonly string[] = [
  "govt_webhook",
  "eno_authority",
  "audit_export",
  "internal_dashboard",
];

export interface OutboxQueryFilters {
  status?: string;
  target_kind?: string;
  breach?: string;
  province?: string;
}

export interface BuildOutboxWhereOptions {
  /**
   * Jurisdiction scope. `undefined` = admin/universal (no jurisdiction
   * clause). A (possibly empty) array = govt, scoped to those
   * (province, locality) pairs — see the module doc comment for the
   * empty-array fail-closed contract.
   */
  jurisdiction?: ReadonlyArray<{ province: string; locality: string }>;
  cursor: { ts: string; id: string } | null;
}

/**
 * Builds the event_notification_outbox WHERE clause. Order mirrors the exact
 * assembly both /admin/outbox and /gob/outbox used before this extraction:
 * jurisdiction (govt only) → status → target_kind → province → breach →
 * keyset cursor. Exported so pages can call it and unit tests can verify the
 * output shape (incl. the jurisdiction-predicate parity contract) without
 * hitting the DB.
 */
export function buildOutboxWhere(
  filters: OutboxQueryFilters,
  opts: BuildOutboxWhereOptions,
): SQL | undefined {
  const conditions: SQL[] = [];

  // --- Jurisdiction (privacy invariant) ---
  // Applied FIRST, exactly as /gob/outbox did. See module doc comment for the
  // undefined-vs-empty-array contract.
  if (opts.jurisdiction !== undefined) {
    const jurisClause =
      jurisdictionPairClause(
        [...opts.jurisdiction],
        sql`${eventNotificationOutbox.targetJurisdictionProvince}`,
        sql`${eventNotificationOutbox.targetJurisdictionLocality}`,
      ) ?? sql`false`;
    conditions.push(jurisClause);
  }

  // --- User-facing filter conditions (identical on both surfaces) ---
  // When breach=yes, status is implied to be 'pending' — skip the standalone
  // status condition to avoid the always-false contradiction (e.g.
  // status='delivered' AND status='pending').
  if (filters.status && filters.breach !== "yes" && VALID_STATUS_VALUES.includes(filters.status)) {
    conditions.push(eq(eventNotificationOutbox.status, filters.status as OutboxStatus));
  }
  if (filters.target_kind && VALID_TARGET_KIND_VALUES.includes(filters.target_kind)) {
    conditions.push(
      eq(eventNotificationOutbox.targetKind, filters.target_kind as OutboxTargetKind),
    );
  }
  // Province: only push condition when the value is a known canonical province name.
  if (filters.province && VALID_PROVINCE_NAMES.has(filters.province)) {
    conditions.push(eq(eventNotificationOutbox.targetJurisdictionProvince, filters.province));
  }
  // breach filter: "yes" → pending AND slaDueAt < now() (skip separate status
  // condition — breach already implies pending, combining them produces
  // status='delivered' AND status='pending' which is always-false); "no" →
  // NOT (pending AND slaDueAt < now()).
  if (filters.breach === "yes") {
    conditions.push(lt(eventNotificationOutbox.slaDueAt, sql`now()`));
    conditions.push(eq(eventNotificationOutbox.status, "pending"));
  } else if (filters.breach === "no") {
    conditions.push(
      sql`NOT (${eventNotificationOutbox.status} = 'pending' AND ${eventNotificationOutbox.slaDueAt} < now())`,
    );
  }

  // --- Keyset predicate — AND-composed last, so limit is applied after narrowing. ---
  const cursorClause = keysetWhere(
    eventNotificationOutbox.createdAt,
    eventNotificationOutbox.id,
    opts.cursor,
  );
  if (cursorClause) conditions.push(cursorClause);

  return conditions.length > 0 ? and(...conditions) : undefined;
}
