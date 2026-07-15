// Server-only: this module queries the DB. A client import is a hard build error.
import "server-only";

// lib/metrics/novedades-feed.ts — "Novedades" operator-orientation feed.
//
// Session-start orientation on the /gob + /admin operator HOMEs: "esto cambió
// en tu jurisdicción desde tu última visita" (viz-suite Wave 1, plan
// docs/plans/viz-suite.md — "Novedades"). A compact, ledger-style projection
// over pet_events, filtered to the feed-relevant, operator-actionable event
// types, newest-first (by transaction time), above a per-user watermark.
//
// READ-ONLY. NO schema beyond the watermark table (migration 0143), NO new
// event types. The feed READS the append-only log; NOTHING here mutates
// pet_events. The watermark is per-user UI state, advanced only by an explicit
// user action (see app/actions/novedades.ts) — never on render.
//
// REUSE
// -----
//   - petsScopeClause(ctx) — jurisdiction scope by the pet's HOME jurisdiction,
//     THE single source of truth for scope SQL (lib/metrics/scope.ts). The SAME
//     helper the /admin/libro event-ledger and every govt dashboard route
//     through: admin → null (universal); govt → OR of pets.jurisdiction_* pairs.
//     Applied against the pets INNER JOIN. Because the feed spans multiple event
//     types it CANNOT use petEventsScopeClause (payload snapshot) — that matches
//     only outbreak_signal rows and would hide every other type from a scoped
//     govt viewer (the ghost-payload bug). Scoping by the pet's CURRENT
//     jurisdiction also closes the payload-drift hole (scope-security review
//     2026-07-04 A1), exactly as fetchEventLedger does.
//   - The composite (event_type, recorded_at) index (migration 0142) serves the
//     type-filtered, recorded_at-ordered scan: event_type IN (...) AND
//     recorded_at > watermark ORDER BY recorded_at DESC.
//
// PII GATING
// ----------
//   Feed rows carry NO owner-personal data and NOT EVEN the pet's public token —
//   only the coarse jurisdiction (province/locality, the same columns the home
//   KPI tiles already expose), the event-type, and the transaction time. The
//   per-item link routes to the operator's QUEUE by event type (not to a pet),
//   where the queue's own authz surfaces the item. This keeps the feed strictly
//   orientation-level (event-type label + jurisdiction + relative time), so —
//   unlike fetchEventLedger, which surfaces the public token — it writes NO
//   pii_queried audit row (it is home chrome, not a PII drill-down).

import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";

import { db, operatorFeedWatermarks, petEvents, pets } from "@/db";
import type { EventType } from "@/db/schema";

import type { ProjectionContext } from "./context";
import { petsScopeClause } from "./scope";

// ---------------------------------------------------------------------------
// Feed-relevant event types + their operator queue route
// ---------------------------------------------------------------------------

/**
 * The event-type set + queue routing live in novedades-feed-links.ts (client-
 * safe — NovedadesCard needs feedQueueHref and this module is server-only).
 * Re-exported here so server callers keep their existing import path.
 *
 * Inclusion/exclusion rationale for FEED_EVENT_TYPES:
 *   - Surveillance / zoonosis → /gob/vigilancia
 *       outbreak_signal, disease_reported, rabies_observation_started
 *       (the three signals the /gob/vigilancia KPIs already read), plus
 *       incident_reported (bites/attacks — the mordeduras queue).
 *   - Custody governance → /gob/disputas
 *       custody_dispute_raised (the disputes the /gob/disputas queue works).
 *
 * Deliberately EXCLUDED (grounded in reality, not the plan's example list):
 *   - denuncias/welfare live in a SEPARATE table (welfare_reports), not
 *     pet_events, so they cannot come from this keyset scan.
 *   - custody_transfer_proposed is an owner-facing return handshake with no
 *     dedicated gob operator queue to route to.
 */
export { FEED_EVENT_TYPES, type FeedEventType, feedQueueHref } from "./novedades-feed-links";

import { FEED_EVENT_TYPES, type FeedEventType } from "./novedades-feed-links";

/** First-visit fallback: with no watermark, show the last 7 days. */
export const FIRST_VISIT_WINDOW_DAYS = 7;
/** Compact feed — a session-start glance, not a browsable list. */
export const DEFAULT_NOVEDADES_LIMIT = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NovedadesFeedRow = {
  /** pet_events.id — stable React key + keyset tiebreak. Not PII. */
  id: string;
  eventType: FeedEventType;
  /** Transaction time — when the system recorded the event. */
  recordedAt: Date;
  /** Coarse jurisdiction (pet HOME), same columns the home KPIs expose. */
  province: string | null;
  locality: string | null;
};

export type NovedadesFeed = {
  rows: NovedadesFeedRow[];
  /** true when filtered by an explicit watermark; false on the first-visit fallback. */
  sinceWatermark: boolean;
  /** The lower bound actually applied (the watermark, or now − 7d on first visit). */
  windowStart: Date;
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetch the feed for an EXPLICIT watermark (null = first visit → last 7 days).
 *
 * Ordering is (recorded_at DESC, id DESC) — newest transaction time first, id as
 * a stable tiebreak on equal timestamps. The watermark bound is STRICTLY
 * greater-than (an event AT the watermark instant was already acknowledged);
 * the first-visit fallback is inclusive (>=) on the now − 7d window start.
 *
 * @param ctx  - ProjectionContext (admin → global; govt → jurisdiction OR pairs).
 * @param opts - watermark (null = first visit) + optional page size.
 */
export async function fetchNovedadesFeedRows(
  ctx: ProjectionContext,
  opts: { watermark: Date | null; limit?: number } = { watermark: null },
): Promise<NovedadesFeed> {
  const limit = opts.limit ?? DEFAULT_NOVEDADES_LIMIT;
  const sinceWatermark = opts.watermark !== null;
  const windowStart =
    opts.watermark ?? new Date(Date.now() - FIRST_VISIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Govt with zero jurisdictions → empty (petsScopeClause is sql`false`; we
  // short-circuit to skip a pointless query, matching fetchEventLedger).
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { rows: [], sinceWatermark, windowStart };
  }

  const conditions = [
    inArray(petEvents.eventType, FEED_EVENT_TYPES as unknown as EventType[]),
    // Strictly-greater on an explicit watermark; inclusive on the 7-day fallback.
    sinceWatermark ? gt(petEvents.recordedAt, windowStart) : gte(petEvents.recordedAt, windowStart),
  ];

  // Jurisdiction scope by the pet's HOME jurisdiction (see module header). Admin
  // → null (universal); govt → OR of pets.jurisdiction_* pairs.
  const scope = petsScopeClause(ctx);
  if (scope) conditions.push(sql`(${scope})`);

  const raw = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      recordedAt: petEvents.recordedAt,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .orderBy(desc(petEvents.recordedAt), desc(petEvents.id))
    .limit(limit);

  const rows: NovedadesFeedRow[] = raw.map((r) => ({
    id: r.id,
    eventType: r.eventType as FeedEventType,
    recordedAt: r.recordedAt,
    province: r.province,
    locality: r.locality,
  }));

  return { rows, sinceWatermark, windowStart };
}

/**
 * Read an operator's feed watermark. Returns null when never marked (first
 * visit) — the caller then falls back to the last-7-days window.
 */
export async function getFeedWatermark(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastSeenRecordedAt: operatorFeedWatermarks.lastSeenRecordedAt })
    .from(operatorFeedWatermarks)
    .where(eq(operatorFeedWatermarks.userId, userId))
    .limit(1);
  return row?.lastSeenRecordedAt ?? null;
}

/**
 * Page convenience: resolve the operator's watermark, then fetch the feed.
 * Used by the /gob and /admin homes; tests target fetchNovedadesFeedRows with
 * explicit watermarks for deterministic boundary coverage.
 */
export async function fetchNovedadesFeed(
  ctx: ProjectionContext,
  userId: string,
  limit: number = DEFAULT_NOVEDADES_LIMIT,
): Promise<NovedadesFeed> {
  const watermark = await getFeedWatermark(userId);
  return fetchNovedadesFeedRows(ctx, { watermark, limit });
}
