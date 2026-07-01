// Mortality & disposal projections for /gob/mortalidad (Item 2).
//
// Pure read-time projection over death_recorded events — no schema, no event
// type, no migration (umbrella D1). disposition_method/facility are read from
// the JSONB payload (payload->>'disposition_method'), never a column.
//
// Metrics (over death_recorded in scope + period):
//   B1 Mortality by cause, by ISO week        → byCauseWeek
//   B2 Disposition-method mix (D3 buckets)    → byBucket
//   B3 Traceable-disposal rate (Ley 5470)     → traceableRate
//   B4 Unknown-disposition rate               → unknownRate
//   B7 Disposal-context splits                → contextSplits
//   B8 Mortality clusters (by locality)       → byLocality (k-anonymity suppressed)
//   B9 Reportable-death share + code mix      → reportableShare / reportableByCode
//
// Deferred (see plan + spec): B5 death→deregistration lag (death_recorded IS the
// terminal/deregistration event — no separate timestamp), B6 under-reporting
// (no external denominator), and the B8 per-death geo heat layer (the
// death_recorded payload carries no location_point; we ship the by-locality
// breakdown instead).
//
// Scope: deaths are anchored to the pet row via INNER JOIN pets ON pets.id =
// pet_events.pet_id and restricted by pets.jurisdictionProvince/Locality through
// petsScopeClause(ctx) — the death payload carries no jurisdiction fields
// (same pattern as fetchDeathCauses). Locality grouping routes through
// suppressSmallCells (k=5) per the privacy policy.

import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import { type DispositionBucket, bucketOf } from "@/lib/disposition";
import { type ProjectionContext, suppressSmallCells } from "@/lib/metrics";
import { petsScopeClause } from "@/lib/metrics/scope";
import type { Cell, SuppressedCells } from "@/lib/metrics/types";

const DISPOSITION = sql`(${petEvents.payload}->>'disposition_method')`;
const FACILITY = sql`(${petEvents.payload}->>'facility')`;

/** A non-empty, known facility string. */
const FACILITY_PRESENT = sql`(${FACILITY} IS NOT NULL AND btrim(${FACILITY}) <> '')`;
/** A concrete, known disposition method (not null, not 'unknown'). */
const METHOD_KNOWN = sql`(${DISPOSITION} IS NOT NULL AND ${DISPOSITION} <> 'unknown')`;
/** B3 traceable predicate: known method AND facility present. */
const TRACEABLE = sql`(${METHOD_KNOWN} AND ${FACILITY_PRESENT})`;
/** B4 unknown predicate: method null or 'unknown'. */
const UNKNOWN_DISPOSITION = sql`(${DISPOSITION} IS NULL OR ${DISPOSITION} = 'unknown')`;

export type DispositionBucketRow = { bucket: DispositionBucket; count: number };
export type CauseWeekRow = { week: string; cause: string; count: number };
export type ReportableCodeRow = { code: string; count: number };

export type MortalityDisposition = {
  /** Total death_recorded events in scope + period. */
  total: number;
  /** B2 — count per normalized disposition bucket, desc by count. */
  byBucket: DispositionBucketRow[];
  /** B3 — traceable-disposal rate as a 0–100 percentage. */
  traceableRate: number;
  /** B4 — unknown-disposition rate as a 0–100 percentage. */
  unknownRate: number;
  /** B7 — disposal-context splits as 0–100 percentages. */
  contextSplits: {
    vetConfirmedRate: number;
    deathAtClinicRate: number;
    privateCrematoriumRate: number;
  };
  /** B9 — reportable-death share as a 0–100 percentage. */
  reportableShare: number;
  /** B9 — reportable deaths grouped by disease_code, desc by count. */
  reportableByCode: ReportableCodeRow[];
  /** B1 — deaths grouped by (ISO week, cause), chronological then desc by count. */
  byCauseWeek: CauseWeekRow[];
  /** B8 — deaths grouped by locality, k-anonymity suppressed (rolled to province). */
  byLocality: { value: SuppressedCells; suppressedCount: number };
};

/** Round a ratio (0–1) to a 0–100 integer percentage. */
function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Single fetcher for the /gob/mortalidad dashboard. Jurisdiction-scoped and
 * period-aware via ProjectionContext. Pure SQL/Drizzle.
 *
 * Issues four queries (all over the same scoped death_recorded population):
 *   1. scalar conditional aggregation (total + B3/B4/B7/B9 + bucket counts),
 *   2. B1 by (week, cause),
 *   3. B9 reportable by disease_code,
 *   4. B8 by locality (then suppressSmallCells).
 */
export async function fetchMortalityDisposition(
  ctx: ProjectionContext,
): Promise<MortalityDisposition> {
  // Govt with no assignments sees nothing.
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return emptyResult();
  }

  const scope = petsScopeClause(ctx);
  const baseConditions = [
    eq(petEvents.eventType, "death_recorded"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) baseConditions.push(sql`(${scope})`);
  const where = and(...baseConditions);

  // --- 1. Scalar conditional aggregation (one round-trip) ------------------
  const [agg] = await db
    .select({
      total: count(),
      traceable: sql<number>`count(*) FILTER (WHERE ${TRACEABLE})`.mapWith(Number),
      unknown: sql<number>`count(*) FILTER (WHERE ${UNKNOWN_DISPOSITION})`.mapWith(Number),
      vetConfirmed:
        sql<number>`count(*) FILTER (WHERE (${petEvents.payload}->>'confirmed_by_vet') = 'true')`.mapWith(
          Number,
        ),
      atClinic:
        sql<number>`count(*) FILTER (WHERE (${petEvents.payload}->>'death_at_clinic') = 'true')`.mapWith(
          Number,
        ),
      privateCrematorium:
        sql<number>`count(*) FILTER (WHERE (${petEvents.payload}->>'owner_to_private_crematorium') = 'true')`.mapWith(
          Number,
        ),
      reportable:
        sql<number>`count(*) FILTER (WHERE (${petEvents.payload}->>'is_reportable') = 'true')`.mapWith(
          Number,
        ),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(where);

  const total = agg?.total ?? 0;

  if (total === 0) return emptyResult();

  // --- 2. B2 disposition buckets (group by raw method, fold in JS) ---------
  const methodRows = await db
    .select({
      method: sql<string | null>`${DISPOSITION}`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(where)
    .groupBy(sql`${DISPOSITION}`);

  const bucketCounts = new Map<DispositionBucket, number>();
  for (const row of methodRows) {
    const bucket = bucketOf(row.method as never);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + row.n);
  }
  const byBucket: DispositionBucketRow[] = [...bucketCounts.entries()]
    .map(([bucket, c]) => ({ bucket, count: c }))
    .sort((a, b) => b.count - a.count);

  // --- 3. B1 cause by ISO week --------------------------------------------
  const causeWeekRows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${petEvents.occurredAt}), 'IYYY-"W"IW')`,
      cause: sql<string>`COALESCE(${petEvents.payload}->>'cause', 'unknown')`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(where)
    .groupBy(
      sql`date_trunc('week', ${petEvents.occurredAt})`,
      sql`COALESCE(${petEvents.payload}->>'cause', 'unknown')`,
    )
    .orderBy(sql`date_trunc('week', ${petEvents.occurredAt})`, desc(count()));
  const byCauseWeek: CauseWeekRow[] = causeWeekRows.map((r) => ({
    week: r.week,
    cause: r.cause,
    count: r.n,
  }));

  // --- 4. B9 reportable by disease_code ------------------------------------
  const codeRows = await db
    .select({
      code: sql<string>`COALESCE(${petEvents.payload}->>'disease_code', 'sin código')`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(where, sql`(${petEvents.payload}->>'is_reportable') = 'true'`))
    .groupBy(sql`COALESCE(${petEvents.payload}->>'disease_code', 'sin código')`)
    .orderBy(desc(count()));
  const reportableByCode: ReportableCodeRow[] = codeRows.map((r) => ({
    code: r.code,
    count: r.n,
  }));

  // --- 5. B8 deaths by locality (k-anonymity suppressed) -------------------
  const localityRows = await db
    .select({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(where)
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality);

  const cells: Cell[] = localityRows.map((r) => ({
    key: r.locality ?? "—",
    count: r.n,
    province: r.province ?? "—",
  }));

  const suppressed = suppressSmallCells<Cell>(cells, {
    count: (c) => c.count,
    key: (c) => c.key,
    k: 5,
    // Fold suppressed small cells into a single province-level rollup row so the
    // count is preserved without exposing the sub-threshold locality.
    rollup: (rows) => {
      const totalSuppressed = rows.reduce((sum, r) => sum + r.count, 0);
      // Group label: the province of the first suppressed row (all rows in a
      // single-province scope share it; mixed-province scopes still produce a
      // valid coarse rollup label).
      const province = (rows[0]?.province as string) ?? "—";
      return { key: `${province} (otras localidades)`, count: totalSuppressed, province };
    },
  });

  return {
    total,
    byBucket,
    traceableRate: pct(agg?.traceable ?? 0, total),
    unknownRate: pct(agg?.unknown ?? 0, total),
    contextSplits: {
      vetConfirmedRate: pct(agg?.vetConfirmed ?? 0, total),
      deathAtClinicRate: pct(agg?.atClinic ?? 0, total),
      privateCrematoriumRate: pct(agg?.privateCrematorium ?? 0, total),
    },
    reportableShare: pct(agg?.reportable ?? 0, total),
    reportableByCode,
    byCauseWeek,
    byLocality: { value: suppressed.visible, suppressedCount: suppressed.suppressedCount },
  };
}

function emptyResult(): MortalityDisposition {
  const empty = suppressSmallCells<Cell>([], {
    count: (c) => c.count,
    key: (c) => c.key,
  });
  return {
    total: 0,
    byBucket: [],
    traceableRate: 0,
    unknownRate: 0,
    contextSplits: { vetConfirmedRate: 0, deathAtClinicRate: 0, privateCrematoriumRate: 0 },
    reportableShare: 0,
    reportableByCode: [],
    byCauseWeek: [],
    byLocality: { value: empty.visible, suppressedCount: 0 },
  };
}
