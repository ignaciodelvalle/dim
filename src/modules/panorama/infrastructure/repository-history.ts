// Panorama infrastructure repository — TimeScrubber scope-total daily counts
// (F4 histogram) and per-unit catalogued event history + trend + byType.
//
// Extracted mechanically from repository.ts (file-size split, behavior-
// preserving): every loader here is unchanged, only moved. Scope-clause and
// event-predicate helpers now live in ./repository-scope.

import { type SQL, and, count, countDistinct, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import {
  cases,
  analyticsDb as db,
  petEvents,
  petIdentifications,
  pets,
  welfareReports,
} from "@/db";
import { jurisdictionScopeContains } from "@/lib/domain/jurisdiction-canonical";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";
import { findDisease } from "@/lib/reference/diseases";
import type { TimeBasis } from "@/src/modules/panorama/domain/time-scrub";
import type { LayerId } from "@/src/modules/panorama/domain/types";

import { type ChoroplethMetric, metricPredicate } from "./repository-choropleth";
import {
  eventWindowCol,
  jurisdictionColumnsScope,
  mordedurasEventPredicate,
  normNameSql,
  perdidasEventPredicate,
  perdidasKindExpr,
  petEventsScope,
  petsScope,
  provinceIsoMapSql,
} from "./repository-scope";

// ---------------------------------------------------------------------------
// Scope-total daily event counts — the TimeScrubber histogram for AGGREGATE views.
//
// The client-side histogram (signal-histogram.ts) bins per-event timestamps that
// ALREADY reached the client — which only exist in POINTS mode (real dots). An
// aggregated bubble carries only a count, so the scrubber was blind at aggregate
// level. This returns per-DAY event counts over [since, until] for the active
// temporal layer, bounded to the SAME scope the aggregate map uses (govt
// jurisdictions + optional admin drill).
//
// PRIVACY: the counts are SCOPE-TOTAL, one number per day across the whole
// visible scope — NOT per-unit. A scope total is strictly coarser than the
// per-unit aggregation that k-anon already governs, so it reveals no suppressed
// cell (a national/province event-per-day total is not a unit-level disclosure —
// same posture the signal-histogram.ts header documents for the points path).
// k-anon is therefore intentionally NOT applied here.
//
// Mirrors each layer's By-Unit predicate + time column + scope helper EXACTLY
// (same source of truth), minus the per-unit GROUP BY and centroid join.
// ---------------------------------------------------------------------------

/** One day's scope-total event count for the scrubber histogram. */
export type ScopeDailyCount = { date: string; count: number };

export async function loadScopeDailyCounts(params: {
  layer: LayerId;
  actor: DashboardActor;
  jurisdictions: DashboardJurisdiction[];
  since: Date;
  until: Date;
  basis?: TimeBasis;
  adminProvince?: string;
  adminLocality?: string;
}): Promise<ScopeDailyCount[]> {
  const {
    layer,
    actor,
    jurisdictions,
    since,
    until,
    basis = "valid",
    adminProvince,
    adminLocality,
  } = params;

  const dayBucket = (tsCol: SQL) => sql<string>`to_char(date_trunc('day', ${tsCol}), 'YYYY-MM-DD')`;
  const tcol = eventWindowCol(basis);

  let rows: Array<{ day: string; n: number }> = [];

  switch (layer) {
    case "perdidas":
    case "mordeduras": {
      const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
      const conditions: SQL[] = [
        layer === "perdidas" ? perdidasEventPredicate() : mordedurasEventPredicate(),
        gte(tcol, since),
        lte(tcol, until),
        isNotNull(pets.jurisdictionProvince),
      ];
      if (scope) conditions.push(sql`(${scope})`);
      rows = await db
        .select({ day: dayBucket(sql`${tcol}`), n: countDistinct(petEvents.id) })
        .from(petEvents)
        .innerJoin(pets, eq(petEvents.petId, pets.id))
        .where(and(...conditions))
        .groupBy(dayBucket(sql`${tcol}`))
        .orderBy(dayBucket(sql`${tcol}`));
      break;
    }

    case "sintomas": {
      const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
      const conditions: SQL[] = [
        eq(petEvents.eventType, "symptom_observed"),
        gte(tcol, since),
        lte(tcol, until),
        isNotNull(pets.jurisdictionProvince),
      ];
      if (scope) conditions.push(sql`(${scope})`);
      rows = await db
        .select({ day: dayBucket(sql`${tcol}`), n: countDistinct(petEvents.id) })
        .from(petEvents)
        .innerJoin(pets, eq(petEvents.petId, pets.id))
        .where(and(...conditions))
        .groupBy(dayBucket(sql`${tcol}`))
        .orderBy(dayBucket(sql`${tcol}`));
      break;
    }

    case "zoonosis": {
      const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
      const conditions: SQL[] = [
        eq(petEvents.eventType, "outbreak_signal"),
        gte(tcol, since),
        lte(tcol, until),
        isNotNull(sql`(${petEvents.payload}->>'pet_jurisdiction_province')`),
      ];
      if (scope) conditions.push(sql`(${scope})`);
      rows = await db
        .select({ day: dayBucket(sql`${tcol}`), n: countDistinct(petEvents.id) })
        .from(petEvents)
        .where(and(...conditions))
        .groupBy(dayBucket(sql`${tcol}`))
        .orderBy(dayBucket(sql`${tcol}`));
      break;
    }

    case "denuncias": {
      // Welfare reports window by createdAt (basis-agnostic, mirrors the By-Unit
      // loader), with the same moderation gate.
      const scope = jurisdictionColumnsScope(
        actor,
        jurisdictions,
        sql`${welfareReports.jurisdictionProvince}`,
        sql`${welfareReports.jurisdictionLocality}`,
        adminProvince,
        adminLocality,
      );
      const conditions: SQL[] = [
        gte(welfareReports.createdAt, since),
        lte(welfareReports.createdAt, until),
        sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
        isNotNull(welfareReports.jurisdictionProvince),
      ];
      if (scope) conditions.push(sql`(${scope})`);
      rows = await db
        .select({ day: dayBucket(sql`${welfareReports.createdAt}`), n: count() })
        .from(welfareReports)
        .where(and(...conditions))
        .groupBy(dayBucket(sql`${welfareReports.createdAt}`))
        .orderBy(dayBucket(sql`${welfareReports.createdAt}`));
      break;
    }

    // reunificacion is a RATE (no meaningful per-day event volume); every other
    // layer is non-temporal or reference — no histogram.
    default:
      return [];
  }

  return rows.map((r) => ({ date: r.day, count: r.n }));
}

// ---------------------------------------------------------------------------
// F4 Unit history — per-(province[, locality]) catalogued event list + trend.
//
// Returns the most recent events for a SINGLE administrative unit, the daily
// trend over the window (for the sparkline), and a count breakdown by sub-type.
//
// Privacy invariants (same as the per-unit loaders above):
//   - denuncias: no exact coordinates; only jurisdiction name + kind/severity.
//   - scope enforced: govt ALWAYS intersects with its govt_assignments via the
//     same scope-clause helpers; admin gets universal access.
//   - No PII (exact welfare report ids, precise coordinates) is returned.
//
// NOTE: This function is DB-backed via @/db (Drizzle). It cannot be unit-tested
// in this Windows/Docker environment. Type-check only via tsc --noEmit.
// ---------------------------------------------------------------------------

/** A single catalogued event entry in the unit-history list. */
export type UnitHistoryEvent = {
  /** ISO 8601 timestamp string. */
  date: string;
  /** Sub-type label key (e.g. "bite_inflicted", "neglect", "custody_episode"). */
  type: string;
  /** Short human-readable description (e.g. the case public code or event type). */
  label: string;
};

/** One bucket in the trend series (for the sparkline). */
export type TrendBucket = {
  /** ISO date string for the bucket start (YYYY-MM-DD). */
  date: string;
  count: number;
};

/** The full result of a unit-history query. */
export type UnitHistoryResult = {
  /**
   * True when the locality's total event count is below the k-anon threshold
   * (k=5). The client must not render counts or event lists when this is true.
   * Always false at province level (no suppression for coarse cells).
   */
  suppressed?: boolean;
  /** Most recent events for this unit (newest first), up to 20 entries. */
  events: UnitHistoryEvent[];
  /** Daily buckets over the requested window (for the sparkline). */
  trend: TrendBucket[];
  /** Count breakdown by event sub-type. */
  byType: Record<string, number>;
};

/** Parameters for the unit-history loader. */
export type LoadUnitHistoryParams = {
  /** The active Panorama layer id — drives which event source is queried. */
  layer: string;
  /** Province name (display name, e.g. "Buenos Aires"). Always required. */
  province: string;
  /** Locality name (display name). Optional — when absent, scope is province-wide.
   * For a folded DETAIL cell this carries the DEPARTMENT (or barrio) label. */
  locality?: string | null;
  /** INDEC department code of the folded cell (the fold's MIN(department_code) group
   * key). When present, department membership is resolved by CODE — not the
   * ambiguous department NAME — so a locality merely named like another department
   * is never pulled into the guard set (WARNING 3). Null for CABA barrios / cells
   * that resolved no department (they match by the direct locality-name arm). */
  departmentCode?: string | null;
  /** task #78 Part 3: mirror the cobertura map's "solo firmado" numerator narrowing
   * in the k-anon guard so it suppresses the SAME cells the map does (WARNING 2). */
  verifiedOnly?: boolean;
  /** Window start (inclusive). */
  since: Date;
  /** Window end (inclusive). */
  until: Date;
  /** Auth actor (admin → universal; govt → intersect with jurisdictions). */
  actor: DashboardActor;
  /** The viewer's assigned jurisdictions (empty for admin). */
  jurisdictions: DashboardJurisdiction[];
};

/**
 * Load catalogued history for a single administrative unit (province or
 * province+locality) for the requested layer + period.
 *
 * Returns:
 *  - `events`: most recent 20 events, newest first.
 *  - `trend`: daily counts over [since, until] for the sparkline.
 *  - `byType`: event sub-type breakdown as { typeKey: count }.
 *
 * Scope is ALWAYS enforced via the same helpers as the per-unit loaders:
 *  - govt actors: must match an assigned jurisdiction (province+locality pair);
 *    an out-of-scope request returns empty results (never an error — the caller
 *    validates scope before reaching here via the API route).
 *  - admin actors: universal (no restriction).
 *
 * DB-backed; not unit-testable without a live Postgres connection.
 */
export async function loadUnitHistory(params: LoadUnitHistoryParams): Promise<UnitHistoryResult> {
  const {
    layer,
    province,
    locality,
    departmentCode = null,
    verifiedOnly = false,
    since,
    until,
    actor,
    jurisdictions,
  } = params;

  // --- verify scope for govt actors -----------------------------------------
  // A govt actor must have at least one assignment that covers the requested
  // unit. If the jurisdiction check fails we return empty (silently) — the
  // API route's scope guard is the authoritative gate; this is a second fence.
  //
  // Use the SAME subsumption semantics as the route (jurisdictionScopeContains):
  // a WHOLE-PROVINCE assignment (e.g. whole-CABA / "Ciudad Autónoma de Buenos
  // Aires") subsumes every barrio the map aggregates for that operator. The
  // previous raw exact-locality equality (`j.locality === locality`) under-
  // matched — a whole-province operator clicking a barrio (Palermo) got an EMPTY
  // history for a unit they legitimately govern and see on the map. The route
  // already fixed this; this second fence was still on the old exact match.
  if (actor.role === "govt") {
    const inScope = locality
      ? jurisdictionScopeContains(jurisdictions, province, locality)
      : jurisdictions.some((j) => j.province === province);
    if (!inScope) {
      return { events: [], trend: [], byType: {} };
    }
  }

  const EVENT_LIMIT = 20;
  // k-anon threshold (mirrors suppressSmallCells k=5 used by the per-unit loaders).
  const K_ANON = 5;

  // ---------------------------------------------------------------------------
  // Department-aware unit resolution (PO "Option A").
  //
  // The detail tier now aggregates at the DEPARTMENT (barrio in CABA), so a
  // clicked map cell/bubble carries the DEPARTMENT NAME as `locality`. Resolve it
  // back to the member localities the folded cell counted, so the history — and
  // its k-anon guard — aggregate over the SAME set the map showed. Without this a
  // department click filters `jurisdiction_locality = <department name>`, matches
  // no pet, and "Historia de la unidad" is always empty. A row's locality column
  // matches when it either:
  //   - equals the label directly (CABA barrio, or a locality that resolved no
  //     department and kept its own name as the fold label), OR
  //   - belongs to the department named `locality` in this province, via the same
  //     ar_localities.department_name join the fold pinned (accent/case-normalised).
  // Uses `province`/`locality` from the enclosing closure — only ever built under
  // `if (locality)`, where the label is non-null.
  // ---------------------------------------------------------------------------
  function unitLocalityFilter(localityCol: SQL): SQL {
    // Department drill (code present): match EXACTLY the member localities the fold
    // counted — pets whose (province, locality) join ar_localities under this
    // department CODE (the fold's MIN(department_code) group key). NO direct-label
    // arm here: a locality merely NAMED like the department but sitting in a
    // DIFFERENT department must NOT be pulled in (WARNING 3). The code-membership
    // arm already covers a genuine seat locality that shares the department's name
    // (its ar_localities row carries this code), so nothing legitimate is lost.
    if (departmentCode) {
      return sql`EXISTS (
        SELECT 1 FROM ar_localities al
        WHERE al.province_code = ${provinceIsoMapSql(sql`${province}`)}
          AND al.removed_at IS NULL
          AND al.department_code = ${departmentCode}
          AND ${sql`al.locality_name_norm`} = ${normNameSql(localityCol)}
      )`;
    }
    // No department code — a CABA barrio, a locality that resolved no department
    // (fold label = its own name), or a stale client that sent no code. Match the
    // label directly, plus a name-based department fallback so a legacy department
    // drill still resolves its members (accepts the name-ambiguity WARNING 3 flags,
    // which the code path above eliminates whenever the client sends the code).
    return sql`(
      ${normNameSql(localityCol)} = ${normNameSql(sql`${locality}`)}
      OR EXISTS (
        SELECT 1 FROM ar_localities al
        WHERE al.province_code = ${provinceIsoMapSql(sql`${province}`)}
          AND al.removed_at IS NULL
          AND ${normNameSql(sql`al.department_name`)} = ${normNameSql(sql`${locality}`)}
          AND ${sql`al.locality_name_norm`} = ${normNameSql(localityCol)}
      )
    )`;
  }

  // ---------------------------------------------------------------------------
  // W1 — k-anon guard for locality-level history.
  //
  // When the caller is drilling into a LOCALITY (locality is set), we count the
  // total events for this unit over [since, until] before returning any detail.
  // If the count is < K_ANON we return a suppressed result — the same cell that
  // was suppressed on the map must not be re-identified via the history panel.
  // Province-level requests are exempt (no suppression, matching the loaders).
  // ---------------------------------------------------------------------------
  if (locality) {
    // Each layer stores its events in a different table / column. We mirror the
    // predicates from queryEvents() below (same WHERE clause, just COUNT(*)).
    let totalCount = 0;

    switch (layer) {
      case "perdidas": {
        // Mirror the choropleth exactly: pets-JOIN attribution + distinct-event
        // count (countDistinct(petEvents.id)) so this k-anon guard suppresses
        // the SAME cells the map does.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(petEvents.id) })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(petEvents.id) })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "denuncias": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          sql`${welfareReports.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${welfareReports.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(welfareReports)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          // outbreak_signal snapshots the pet's jurisdiction into the payload at
          // signal time (pet_jurisdiction_*, the ONLY event that legitimately does
          // — see petEventsScopeClause jsdoc); it never writes flat province/locality.
          sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
          unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          sql`${cases.jurisdictionProvince} = ${province}`,
          sql`${cases.jurisdictionLocality} = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(cases)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "cobertura": {
        const scope = petsScope(actor, jurisdictions);
        // Mirror the map numerator EXACTLY via metricPredicate('rabies-coverage'):
        // DOGS in scope with a qualifying rabies dose in the trailing-12-month
        // window, narrowed to vet-signed when verifiedOnly (WARNING 2). The prior
        // guard counted ALL doses matching LIKE '%rabi%' over the SCRUBBER window
        // [since, until] — two ways adrift from the map, so with "solo firmado" ON
        // a map-suppressed department could clear k=5 here and be re-identified.
        // The rabies map is trailing-12m regardless of the scrubber, so the window
        // lives INSIDE the predicate; the guard applies no [since, until] clause.
        const conditions: SQL[] = [
          metricPredicate("rabies-coverage", verifiedOnly),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        // countDistinct(pet): the choropleth counts DISTINCT PETS, so one dog with
        // several boosters must not clear k=5 for a cell the map suppressed.
        const [row] = await db
          .select({ n: countDistinct(pets.id) })
          .from(pets)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "mortalidad": {
        const scope = petsScope(actor, jurisdictions);
        // Mirror the map numerator EXACTLY via metricPredicate('mortality'):
        // pets CURRENTLY in status='deceased' (no [since, until] window). The map
        // choropleth counts current-state deceased pets (metricPredicate at :818),
        // NOT windowed death_recorded EVENTS. The prior guard counted windowed
        // death_recorded events over the attacker-controlled scrubber range, so a
        // department SUPPRESSED on the map (current deceased < 5) could clear k=5
        // here for a wide-enough window and leak up to 20 death_recorded rows
        // (dates + disposition_method) — a k-anon break (KA3). Now it mirrors the
        // map with NO window, exactly like the cobertura/esterilizacion/microchip/
        // ppp current-state guards, and countDistinct(pet) like the map.
        const conditions: SQL[] = [
          metricPredicate("mortality"),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(pets.id) })
          .from(pets)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "sintomas": {
        // Density point layer — mirror loadSintomasByUnit: symptom_observed events
        // on pets in the unit over the window, countDistinct(event) like the map.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "symptom_observed"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(petEvents.id) })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "esterilizacion":
      case "microchip":
      case "ppp": {
        // Current-state choropleths — mirror the map numerator EXACTLY via
        // metricPredicate (EXISTS over the underlying event/identification), and
        // countDistinct(pet) like cobertura, so a map-suppressed cell can't be
        // re-identified through the history. The metric predicate is the source of
        // truth (no [since,until] window — these count the CURRENT attribute).
        const metric: ChoroplethMetric =
          layer === "esterilizacion"
            ? "sterilization-coverage"
            : layer === "microchip"
              ? "microchip-penetration"
              : "ppp-compliance";
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          metricPredicate(metric),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(pets.id) })
          .from(pets)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      default:
        totalCount = K_ANON; // Unknown layers are exempt from suppression.
    }

    if (totalCount < K_ANON) {
      return { suppressed: true, events: [], trend: [], byType: {} };
    }
  }

  // ---------------------------------------------------------------------------
  // Route by layer source to the correct event table + predicate.
  // Each branch mirrors the predicate used in the corresponding per-unit loader.
  // ---------------------------------------------------------------------------

  type RawEvent = { date: Date | null; type: string; label: string };

  async function queryEvents(): Promise<RawEvent[]> {
    // Build province+locality filter for the outbreak_signal (zoonosis) layer,
    // which snapshots the pet's jurisdiction into pet_jurisdiction_* at signal
    // time (the ONLY event type that legitimately carries these payload keys —
    // see petEventsScopeClause jsdoc). Perdidas/mordeduras use petsJurisdictionFilter.
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
      ];
      if (locality)
        filters.push(unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`));
      return filters;
    }

    // Build province+locality filter for jurisdiction-column based tables
    // (welfare_reports, cases).
    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(localityCol));
      return filters;
    }

    // Build province+locality filter for the pets table.
    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(sql`${pets.jurisdictionLocality}`));
      return filters;
    }

    switch (layer) {
      case "perdidas": {
        // pets-JOIN attribution (payload carries no jurisdiction); synthetic
        // kind reproduces the pet_lost / pet_found_sighting labels from the real
        // event type (status_changed lost vs note_added sighting).
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            kind: perdidasKindExpr(),
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.kind ?? "pet_lost",
          label: r.kind === "pet_found_sighting" ? "Avistaje" : "Mascota perdida",
        }));
      }

      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            incidentType: sql<string>`(${petEvents.payload}->>'incident_type')`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.incidentType ?? "bite_inflicted",
          label: r.incidentType === "bite_suffered" ? "Mordedura recibida" : "Mordedura infligida",
        }));
      }

      case "denuncias": {
        // COARSE: never exact coordinates — only kind/severity/jurisdiction.
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          ...columnJurisdictionFilter(
            sql`${welfareReports.jurisdictionProvince}`,
            sql`${welfareReports.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            createdAt: welfareReports.createdAt,
            kind: welfareReports.kind,
            severity: welfareReports.severity,
          })
          .from(welfareReports)
          .where(and(...conditions))
          .orderBy(sql`${welfareReports.createdAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.createdAt,
          type: r.kind ?? "other",
          label: r.severity ? `Denuncia (${r.severity})` : "Denuncia",
        }));
      }

      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            diseaseCode: sql<string | null>`(${petEvents.payload}->>'disease_code')`,
            diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
          })
          .from(petEvents)
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.diseaseCode ?? "outbreak_signal",
          label: r.diseaseLabel ?? findDisease(r.diseaseCode)?.label ?? "Señal de brote",
        }));
      }

      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          ...columnJurisdictionFilter(
            sql`${cases.jurisdictionProvince}`,
            sql`${cases.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            openedAt: cases.openedAt,
            publicCode: cases.publicCode,
            status: cases.status,
          })
          .from(cases)
          .where(and(...conditions))
          .orderBy(sql`${cases.openedAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.openedAt,
          type: "custody_episode",
          label: r.publicCode ?? "Expediente",
        }));
      }

      case "cobertura": {
        // Rabies-coverage events — rabies vaccinations on pets in the unit.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          // Amendment overlay (audit A2): select AND label by the CURRENT name.
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            vaccineName: sql<string | null>`(${amendedPayloadText("vaccine_name")})`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: "vaccination_administered",
          label: r.vaccineName ?? "Vacuna antirrábica",
        }));
      }

      case "mortalidad": {
        // Mortality events — deaths recorded for pets in the unit.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            dispositionMethod: sql<string | null>`(${petEvents.payload}->>'disposition_method')`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: "death_recorded",
          label: r.dispositionMethod ?? "Fallecimiento registrado",
        }));
      }

      case "sintomas":
      case "esterilizacion":
      case "ppp": {
        // pet_events-backed layers — the underlying event IS each layer's rollup
        // source (symptom_observed for sintomas; the metricPredicate EXISTS event
        // for the current-state esterilizacion/ppp choropleths). Pets-attributed,
        // over the window, same petsScope as the map.
        const cfg = {
          sintomas: { type: "symptom_observed", label: "Síntoma reportado" },
          esterilizacion: { type: "sterilization_performed", label: "Esterilización" },
          ppp: { type: "dangerous_breed_attested", label: "Atestación PPP" },
        }[layer as "sintomas" | "esterilizacion" | "ppp"];
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, cfg.type),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ occurredAt: petEvents.occurredAt })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({ date: r.occurredAt, type: cfg.type, label: cfg.label }));
      }

      case "microchip": {
        // Microchip penetration is backed by pet_identifications (active
        // microchip_iso), not pet_events — mirror metricPredicate('microchip-
        // penetration')'s kind, joined to pets for the unit + scope.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petIdentifications.kind, "microchip_iso"),
          sql`${petIdentifications.deletedAt} IS NULL`,
          // recorded_at is a DATE column (string-typed) — window it with day-grain
          // ISO strings, not the Date-typed [since, until] the pet_events layers use.
          gte(petIdentifications.recordedAt, since.toISOString().slice(0, 10)),
          lte(petIdentifications.recordedAt, until.toISOString().slice(0, 10)),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ recordedAt: petIdentifications.recordedAt })
          .from(petIdentifications)
          .innerJoin(pets, eq(petIdentifications.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petIdentifications.recordedAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.recordedAt ? new Date(r.recordedAt) : null,
          type: "microchip_iso",
          label: "Microchip registrado",
        }));
      }

      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Daily-bucket trend query — same predicate as the events query but grouped
  // by day and without the LIMIT, so the sparkline covers the full window.
  // A second query here (simpler SQL) because the event list and the trend
  // have different LIMIT semantics.
  // ---------------------------------------------------------------------------

  async function queryTrend(): Promise<TrendBucket[]> {
    const dayBucket = (tsCol: SQL) =>
      sql<string>`to_char(date_trunc('day', ${tsCol}), 'YYYY-MM-DD')`;

    // outbreak_signal (zoonosis) snapshots the pet's jurisdiction into
    // pet_jurisdiction_* at signal time — see the queryEvents copy above.
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
      ];
      if (locality)
        filters.push(unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`));
      return filters;
    }

    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(localityCol));
      return filters;
    }

    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(sql`${pets.jurisdictionLocality}`));
      return filters;
    }

    let rows: Array<{ day: string; n: number }> = [];

    switch (layer) {
      case "perdidas": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "denuncias": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          ...columnJurisdictionFilter(
            sql`${welfareReports.jurisdictionProvince}`,
            sql`${welfareReports.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${welfareReports.createdAt}`), n: count() })
          .from(welfareReports)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${welfareReports.createdAt}`))
          .orderBy(dayBucket(sql`${welfareReports.createdAt}`));
        break;
      }

      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          ...columnJurisdictionFilter(
            sql`${cases.jurisdictionProvince}`,
            sql`${cases.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${cases.openedAt}`), n: count() })
          .from(cases)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${cases.openedAt}`))
          .orderBy(dayBucket(sql`${cases.openedAt}`));
        break;
      }

      case "cobertura": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          // Amendment overlay (audit A2): bucket by the CURRENT vaccine name.
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "mortalidad": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "sintomas":
      case "esterilizacion":
      case "ppp": {
        // Same pet_events source as the queryEvents branch above — daily counts of
        // each layer's underlying event over the window.
        const eventType =
          layer === "sintomas"
            ? "symptom_observed"
            : layer === "esterilizacion"
              ? "sterilization_performed"
              : "dangerous_breed_attested";
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, eventType),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "microchip": {
        // Backed by pet_identifications (recorded_at), joined to pets for the unit.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petIdentifications.kind, "microchip_iso"),
          sql`${petIdentifications.deletedAt} IS NULL`,
          // See the queryEvents microchip branch: recorded_at is a DATE column,
          // windowed with day-grain ISO strings.
          gte(petIdentifications.recordedAt, since.toISOString().slice(0, 10)),
          lte(petIdentifications.recordedAt, until.toISOString().slice(0, 10)),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petIdentifications.recordedAt}`), n: count() })
          .from(petIdentifications)
          .innerJoin(pets, eq(petIdentifications.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petIdentifications.recordedAt}`))
          .orderBy(dayBucket(sql`${petIdentifications.recordedAt}`));
        break;
      }

      default:
        return [];
    }

    return rows.map((r) => ({ date: r.day, count: r.n }));
  }

  // ---------------------------------------------------------------------------
  // Per-type breakdown — a SEPARATE grouped COUNT(*) over the FULL window, NOT a
  // tally of the capped `events` list (KA5). The events array is limited to
  // EVENT_LIMIT (20) most-recent rows, so a unit with >20 events in-window would
  // otherwise report a per-type breakdown that undercounts (only the newest 20
  // are tallied). This query groups by each layer's synthetic type key over the
  // whole [since, until] window with no LIMIT, mirroring the queryEvents/queryTrend
  // predicates (a third self-contained copy, matching the queryTrend pattern).
  // ---------------------------------------------------------------------------

  async function queryByType(): Promise<Record<string, number>> {
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
      ];
      if (locality)
        filters.push(unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`));
      return filters;
    }

    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(localityCol));
      return filters;
    }

    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(sql`${pets.jurisdictionLocality}`));
      return filters;
    }

    // Fold grouped {type,n} rows into a Record, coalescing NULL keys (matches the
    // `?? fallback` the queryEvents mapping applies). Empty rows → empty object,
    // preserving the prior "no events → {}" behavior.
    const tally = (
      rows: Array<{ type: string | null; n: number }>,
      fallback: string,
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const key = r.type ?? fallback;
        out[key] = (out[key] ?? 0) + r.n;
      }
      return out;
    };

    // Single-type layers: one COUNT(*) over the window → { [type]: n } (or {} when
    // there are none), so byType always reconciles with the true windowed total.
    const single = async (
      constType: string,
      countQuery: PromiseLike<Array<{ n: number }>>,
    ): Promise<Record<string, number>> => {
      const [row] = await countQuery;
      const n = row?.n ?? 0;
      return n > 0 ? { [constType]: n } : {};
    };

    switch (layer) {
      case "perdidas": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ type: perdidasKindExpr(), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(perdidasKindExpr());
        return tally(rows, "pet_lost");
      }

      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const typeExpr = sql<string | null>`(${petEvents.payload}->>'incident_type')`;
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ type: typeExpr, n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(typeExpr);
        return tally(rows, "bite_inflicted");
      }

      case "denuncias": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          ...columnJurisdictionFilter(
            sql`${welfareReports.jurisdictionProvince}`,
            sql`${welfareReports.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ type: welfareReports.kind, n: count() })
          .from(welfareReports)
          .where(and(...conditions))
          .groupBy(welfareReports.kind);
        return tally(rows, "other");
      }

      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const typeExpr = sql<string | null>`(${petEvents.payload}->>'disease_code')`;
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({ type: typeExpr, n: count() })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(typeExpr);
        return tally(rows, "outbreak_signal");
      }

      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          ...columnJurisdictionFilter(
            sql`${cases.jurisdictionProvince}`,
            sql`${cases.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        return single(
          "custody_episode",
          db
            .select({ n: count() })
            .from(cases)
            .where(and(...conditions)),
        );
      }

      case "cobertura": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        return single(
          "vaccination_administered",
          db
            .select({ n: count() })
            .from(petEvents)
            .innerJoin(pets, eq(petEvents.petId, pets.id))
            .where(and(...conditions)),
        );
      }

      case "mortalidad": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        return single(
          "death_recorded",
          db
            .select({ n: count() })
            .from(petEvents)
            .innerJoin(pets, eq(petEvents.petId, pets.id))
            .where(and(...conditions)),
        );
      }

      case "sintomas":
      case "esterilizacion":
      case "ppp": {
        const cfg = {
          sintomas: "symptom_observed",
          esterilizacion: "sterilization_performed",
          ppp: "dangerous_breed_attested",
        }[layer as "sintomas" | "esterilizacion" | "ppp"];
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, cfg),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        return single(
          cfg,
          db
            .select({ n: count() })
            .from(petEvents)
            .innerJoin(pets, eq(petEvents.petId, pets.id))
            .where(and(...conditions)),
        );
      }

      case "microchip": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petIdentifications.kind, "microchip_iso"),
          sql`${petIdentifications.deletedAt} IS NULL`,
          gte(petIdentifications.recordedAt, since.toISOString().slice(0, 10)),
          lte(petIdentifications.recordedAt, until.toISOString().slice(0, 10)),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        return single(
          "microchip_iso",
          db
            .select({ n: count() })
            .from(petIdentifications)
            .innerJoin(pets, eq(petIdentifications.petId, pets.id))
            .where(and(...conditions)),
        );
      }

      default:
        return {};
    }
  }

  // ---------------------------------------------------------------------------
  // Execute the three queries in parallel. byType is computed independently over
  // the FULL window (KA5) — NOT tallied from the EVENT_LIMIT-capped events list.
  // ---------------------------------------------------------------------------

  const [rawEvents, trend, byType] = await Promise.all([
    queryEvents(),
    queryTrend(),
    queryByType(),
  ]);

  const events: UnitHistoryEvent[] = rawEvents.map((e) => ({
    date: e.date ? e.date.toISOString() : new Date().toISOString(),
    type: e.type,
    label: e.label,
  }));

  return { events, trend, byType };
}
