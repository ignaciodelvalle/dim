// Writer use-cases — evaluation → persistence with dedup.
//
// @no-auth-required: these run only from the CRON_SECRET-gated
// /api/cron/evaluate-alerts route. Not user-facing actions.

import { and, eq, inArray } from "drizzle-orm";

import { ALERT_FIRING_OPEN_STATUSES, alertFirings, alertSubscriptions, db } from "@/db";
import { evaluateAlertSubscriptions } from "@/lib/metrics/alert-evaluation";
import { shouldOpenFiring } from "@/lib/metrics/alert-firing";

import type { RecordFiringsResult } from "./types";

/**
 * Evaluate one admin user's active subscriptions and open firings for any new
 * breaches. Pure-decision (shouldOpenFiring) gates each insert; the dedup query
 * resolves existing OPEN firings per subscription so a second firing is never
 * opened while one is already in the inbox.
 *
 * Exported (not just used by the cron) so the writer is independently testable.
 */
export async function recordFiringsForUser(userId: string): Promise<RecordFiringsResult> {
  const evals = await evaluateAlertSubscriptions(userId, { role: "admin" });
  const breaching = evals.filter((e) => e.breaching);

  let opened = 0;

  for (const ev of breaching) {
    // Resolve existing OPEN firings for this exact (subscription, jurisdiction).
    const existing = await db
      .select({ status: alertFirings.status })
      .from(alertFirings)
      .where(
        and(
          eq(alertFirings.subscriptionId, ev.id),
          inArray(alertFirings.status, [...ALERT_FIRING_OPEN_STATUSES]),
        ),
      );

    if (!shouldOpenFiring(existing, { breaching: ev.breaching })) continue;

    await db.insert(alertFirings).values({
      subscriptionId: ev.id,
      metricKey: ev.metricKey,
      direction: ev.direction,
      threshold: String(ev.threshold),
      observedValue: String(ev.currentValue ?? 0),
      jurisdictionProvince: ev.jurisdictionProvince ?? null,
      jurisdictionLocality: ev.jurisdictionLocality ?? null,
      status: "disparada",
    });
    opened += 1;
  }

  return { evaluated: evals.length, breaching: breaching.length, opened };
}

/**
 * Evaluate EVERY active subscription across all admin owners and open firings.
 * Used by the daily cron so evaluation does not depend on an admin opening
 * /admin/programa. Subscriptions are owned per-actor, so we evaluate per owner.
 */
export async function evaluateAndRecordFiringsForAllAdmins(): Promise<RecordFiringsResult> {
  // Distinct owners of at least one ACTIVE subscription = the set to evaluate.
  const owners = await db
    .selectDistinct({ actorUserId: alertSubscriptions.actorUserId })
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.isActive, true));

  const totals: RecordFiringsResult = { evaluated: 0, breaching: 0, opened: 0 };
  for (const { actorUserId } of owners) {
    const res = await recordFiringsForUser(actorUserId);
    totals.evaluated += res.evaluated;
    totals.breaching += res.breaching;
    totals.opened += res.opened;
  }
  return totals;
}
