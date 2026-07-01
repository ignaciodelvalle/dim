// lib/campaign-metrics.ts — Campaign performance projections for /gob/campanas.
//
// Pure projection layer over the existing bookings (appointments) +
// attendance (appointments.status) + service_offerings data.
// NO schema changes. Builds on lib/metrics/ ProjectionContext primitives.
//
// Scope model:
//  - Admin → sees all offerings/appointments (no WHERE restriction).
//  - Govt → scoped to offerings where jurisdictionProvince/Locality matches
//    the operator's active govt_assignments.
//
// Terminology aligned with AGENTS.md § Dashboards › Sanitary authority:
//   enrollment  = bookings (appointments created, any non-cancelled status)
//   completion  = attended appointments (status='attended')
//   no_show     = appointments with status='no_show'
//   geo_reach   = distinct jurisdictionLocality values among attended appointments

import { and, count, countDistinct, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { appointments, db, serviceOfferings } from "@/db";
import type { ProjectionContext } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-offering campaign performance aggregate. */
export type CampaignOfferingStats = {
  offeringId: string;
  offeringToken: string;
  displayName: string;
  serviceKind: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  /** Total confirmed + attended + no_show (cancelled excluded). */
  enrollment: number;
  /** Attended appointments. */
  completion: number;
  /** No-show appointments. */
  noShow: number;
  /** Completion rate 0–100 (null when enrollment=0). */
  completionRate: number | null;
  /** No-show rate 0–100 (null when enrollment=0). */
  noShowRate: number | null;
};

/** Geo reach: distinct localities where ≥1 attendance happened. */
export type CampaignGeoReach = {
  /** Locality name (from service_offering.jurisdiction_locality). */
  locality: string;
  /** Province name (from service_offering.jurisdiction_province). Null when not set. */
  province: string | null;
  /** Number of attended appointments in that locality. */
  attendedCount: number;
};

/** Full campaign dashboard result for the page. */
export type CampaignDashboardData = {
  offerings: CampaignOfferingStats[];
  /** Sparkline totals for KPI trend (last 6 months of enrollment counts). */
  enrollmentSparkline: number[];
  /** Aggregated totals across all offerings in scope. */
  totals: {
    enrollment: number;
    completion: number;
    noShow: number;
    completionRate: number | null;
    noShowRate: number | null;
  };
  /** Previous-period totals (for delta computation in OpKpi v2). */
  prevTotals: {
    enrollment: number;
    completion: number;
    noShow: number;
  };
  /** Geo reach data for choropleth. */
  geoReach: CampaignGeoReach[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the list of service_offering IDs in scope for the given context.
 * Used to scope appointment queries without a JOIN that might fan out.
 */
async function resolveOfferingIds(ctx: ProjectionContext): Promise<string[]> {
  if (ctx.scope.kind === "global") {
    // Admin: fetch all approved/active offerings.
    const rows = await db
      .select({ id: serviceOfferings.id })
      .from(serviceOfferings)
      .where(
        inArray(serviceOfferings.status, ["approved", "pending_approval", "paused", "archived"]),
      );
    return rows.map((r) => r.id);
  }

  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return [];

  const pairs = jurisdictions.map(
    (j) =>
      sql`(${serviceOfferings.jurisdictionProvince} = ${j.province} AND ${serviceOfferings.jurisdictionLocality} = ${j.locality})`,
  );
  const scopeClause = sql.join(pairs, sql` OR `);

  const rows = await db
    .select({ id: serviceOfferings.id })
    .from(serviceOfferings)
    .where(
      and(
        inArray(serviceOfferings.status, ["approved", "pending_approval", "paused", "archived"]),
        scopeClause,
      ),
    );

  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Per-offering stats
// ---------------------------------------------------------------------------

/**
 * Fetch per-offering enrollment/completion/no-show counts within the period.
 * Only counts non-cancelled appointments (confirmed + attended + no_show).
 */
async function fetchOfferingStats(
  offeringIds: string[],
  ctx: ProjectionContext,
): Promise<CampaignOfferingStats[]> {
  if (offeringIds.length === 0) return [];

  const { since, until } = ctx.period;

  // Aggregate appointments by offering + status within the period.
  const rows = await db
    .select({
      offeringId: serviceOfferings.id,
      offeringToken: serviceOfferings.publicToken,
      displayName: serviceOfferings.displayName,
      serviceKind: serviceOfferings.serviceKind,
      jurisdictionProvince: serviceOfferings.jurisdictionProvince,
      jurisdictionLocality: serviceOfferings.jurisdictionLocality,
      status: appointments.status,
      cnt: count(appointments.id),
    })
    .from(serviceOfferings)
    .leftJoin(
      appointments,
      and(
        eq(appointments.serviceOfferingId, serviceOfferings.id),
        gte(appointments.createdAt, since),
        lt(appointments.createdAt, until),
        inArray(appointments.status, ["confirmed", "attended", "no_show"]),
      ),
    )
    .where(inArray(serviceOfferings.id, offeringIds))
    .groupBy(
      serviceOfferings.id,
      serviceOfferings.publicToken,
      serviceOfferings.displayName,
      serviceOfferings.serviceKind,
      serviceOfferings.jurisdictionProvince,
      serviceOfferings.jurisdictionLocality,
      appointments.status,
    );

  // Group by offering.
  const byOffering = new Map<string, CampaignOfferingStats>();

  for (const row of rows) {
    const key = row.offeringId;
    if (!byOffering.has(key)) {
      byOffering.set(key, {
        offeringId: row.offeringId,
        offeringToken: row.offeringToken,
        displayName: row.displayName,
        serviceKind: row.serviceKind,
        jurisdictionProvince: row.jurisdictionProvince,
        jurisdictionLocality: row.jurisdictionLocality,
        enrollment: 0,
        completion: 0,
        noShow: 0,
        completionRate: null,
        noShowRate: null,
      });
    }
    // biome-ignore lint/style/noNonNullAssertion: key was just set above if missing
    const stat = byOffering.get(key)!;
    const n = Number(row.cnt);
    if (row.status === "attended") {
      stat.completion += n;
      stat.enrollment += n;
    } else if (row.status === "no_show") {
      stat.noShow += n;
      stat.enrollment += n;
    } else if (row.status === "confirmed") {
      stat.enrollment += n;
    }
  }

  // Compute rates.
  for (const stat of byOffering.values()) {
    if (stat.enrollment > 0) {
      stat.completionRate = Math.round((stat.completion / stat.enrollment) * 100);
      stat.noShowRate = Math.round((stat.noShow / stat.enrollment) * 100);
    }
  }

  return Array.from(byOffering.values());
}

// ---------------------------------------------------------------------------
// Geo reach
// ---------------------------------------------------------------------------

/**
 * Returns distinct localities where ≥1 attendance happened in the period.
 * Groups by jurisdiction_locality from service_offerings (no JSONB required).
 */
async function fetchGeoReach(
  offeringIds: string[],
  ctx: ProjectionContext,
): Promise<CampaignGeoReach[]> {
  if (offeringIds.length === 0) return [];

  const { since, until } = ctx.period;

  const rows = await db
    .select({
      locality: serviceOfferings.jurisdictionLocality,
      province: serviceOfferings.jurisdictionProvince,
      attendedCount: count(appointments.id),
    })
    .from(serviceOfferings)
    .innerJoin(
      appointments,
      and(
        eq(appointments.serviceOfferingId, serviceOfferings.id),
        eq(appointments.status, "attended"),
        gte(appointments.createdAt, since),
        lt(appointments.createdAt, until),
      ),
    )
    .where(inArray(serviceOfferings.id, offeringIds))
    .groupBy(serviceOfferings.jurisdictionLocality, serviceOfferings.jurisdictionProvince);

  return rows
    .filter(
      (r): r is { locality: string; province: string | null; attendedCount: number } =>
        r.locality !== null,
    )
    .map((r) => ({
      locality: r.locality,
      province: r.province,
      attendedCount: Number(r.attendedCount),
    }))
    .sort((a, b) => b.attendedCount - a.attendedCount);
}

// ---------------------------------------------------------------------------
// Enrollment sparkline (monthly, last 6 periods)
// ---------------------------------------------------------------------------

/**
 * Returns enrollment counts for the last 6 calendar months as a sparkline array.
 * Month 0 = oldest, Month 5 = current/most recent.
 */
async function fetchEnrollmentSparkline(offeringIds: string[]): Promise<number[]> {
  if (offeringIds.length === 0) return [0, 0, 0, 0, 0, 0];

  const rows = await db
    .select({
      month: sql<string>`to_char(${appointments.createdAt}, 'YYYY-MM')`,
      cnt: count(appointments.id),
    })
    .from(appointments)
    .where(
      and(
        inArray(appointments.serviceOfferingId, offeringIds),
        inArray(appointments.status, ["confirmed", "attended", "no_show"]),
        gte(appointments.createdAt, sql`now() - interval '6 months'`),
      ),
    )
    .groupBy(sql`to_char(${appointments.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${appointments.createdAt}, 'YYYY-MM')`);

  // Build a 6-slot array from the last 6 months.
  const now = new Date();
  const result: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = rows.find((r) => r.month === key);
    result.push(row ? Number(row.cnt) : 0);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Previous-period totals
// ---------------------------------------------------------------------------

/**
 * Fetches enrollment/completion/no-show totals for the previous period
 * (same duration, immediately before ctx.period.since).
 * Used to compute delta for OpKpi v2 deltaV2 prop.
 */
async function fetchPrevTotals(
  offeringIds: string[],
  ctx: ProjectionContext,
): Promise<{ enrollment: number; completion: number; noShow: number }> {
  if (offeringIds.length === 0) return { enrollment: 0, completion: 0, noShow: 0 };

  const { since, until } = ctx.period;
  const duration = until.getTime() - since.getTime();
  const prevSince = new Date(since.getTime() - duration);
  const prevUntil = since;

  const rows = await db
    .select({
      status: appointments.status,
      cnt: count(appointments.id),
    })
    .from(appointments)
    .where(
      and(
        inArray(appointments.serviceOfferingId, offeringIds),
        inArray(appointments.status, ["confirmed", "attended", "no_show"]),
        gte(appointments.createdAt, prevSince),
        lt(appointments.createdAt, prevUntil),
      ),
    )
    .groupBy(appointments.status);

  let enrollment = 0;
  let completion = 0;
  let noShow = 0;
  for (const row of rows) {
    const n = Number(row.cnt);
    if (row.status === "attended") {
      completion += n;
      enrollment += n;
    } else if (row.status === "no_show") {
      noShow += n;
      enrollment += n;
    } else if (row.status === "confirmed") {
      enrollment += n;
    }
  }
  return { enrollment, completion, noShow };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fetches all campaign performance data for the dashboard page.
 *
 * Returns per-offering stats, aggregated totals, previous-period totals
 * (for delta), enrollment sparkline, and geo reach for the choropleth.
 */
export async function fetchCampaignDashboard(
  ctx: ProjectionContext,
): Promise<CampaignDashboardData> {
  const offeringIds = await resolveOfferingIds(ctx);

  if (offeringIds.length === 0) {
    return {
      offerings: [],
      enrollmentSparkline: [0, 0, 0, 0, 0, 0],
      totals: {
        enrollment: 0,
        completion: 0,
        noShow: 0,
        completionRate: null,
        noShowRate: null,
      },
      prevTotals: { enrollment: 0, completion: 0, noShow: 0 },
      geoReach: [],
    };
  }

  const [offerings, geoReach, enrollmentSparkline, prevTotals] = await Promise.all([
    fetchOfferingStats(offeringIds, ctx),
    fetchGeoReach(offeringIds, ctx),
    fetchEnrollmentSparkline(offeringIds),
    fetchPrevTotals(offeringIds, ctx),
  ]);

  // Compute aggregated totals.
  let totalEnrollment = 0;
  let totalCompletion = 0;
  let totalNoShow = 0;
  for (const o of offerings) {
    totalEnrollment += o.enrollment;
    totalCompletion += o.completion;
    totalNoShow += o.noShow;
  }

  return {
    offerings,
    enrollmentSparkline,
    totals: {
      enrollment: totalEnrollment,
      completion: totalCompletion,
      noShow: totalNoShow,
      completionRate:
        totalEnrollment > 0 ? Math.round((totalCompletion / totalEnrollment) * 100) : null,
      noShowRate: totalEnrollment > 0 ? Math.round((totalNoShow / totalEnrollment) * 100) : null,
    },
    prevTotals,
    geoReach,
  };
}

// ---------------------------------------------------------------------------
// Delta computation helper (pure, for tests)
// ---------------------------------------------------------------------------

/**
 * Computes the signed percentage point delta between current and previous values.
 * Returns null when the previous value is 0 (division undefined).
 */
export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Formats a delta value + period label for OpKpi v2 deltaV2 prop.
 * Returns null when the delta cannot be computed.
 */
export function formatDelta(
  current: number,
  previous: number,
  periodLabel: string,
): { value: number; period: string } | null {
  const delta = computeDelta(current, previous);
  if (delta === null) return null;
  return { value: delta, period: periodLabel };
}
