// Query builder for /admin/observaciones — rabies-observation rows in
// progress or recently closed. Extracted from the page component (which
// previously had NO filters at all — PO: "observaciones directamente no
// tiene filtro") so the new Estado/Provincia/Localidad filters are
// unit/integration-testable in isolation, and so each filter provably
// narrows the result set (F-migration 2026-07-21, OpFilterBar sweep tail).
//
// Scope contract mirrors every other govt/admin surface: govt is fenced to
// its (already narrowed-by-selection) jurisdiction assignments; admin is
// universal, with an optional province/locality drill applied as an explicit
// predicate (the same admin-drill shape resolveJurisdictionScope hands back
// as adminSelectedProvince/adminSelectedLocality — see
// lib/analytics/jurisdiction-scope.ts). The caller is responsible for
// resolving that scope (via resolveJurisdictionScope) BEFORE calling this
// function — this module only applies it, it never re-derives the fence.

import { and, eq, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import type { DashboardJurisdiction } from "@/lib/metrics/context";
import {
  RABIES_OBSERVATION_STATUSES,
  type RabiesObservationStatus,
} from "@/src/modules/surveillance/domain/rabies-observation";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_COMPLETED_WINDOW_DAYS = 30;
const OBSERVACIONES_ROW_LIMIT = 500;

export type ObservacionesFilters = {
  /** null = default composite view (in_progress OR completed in the last
   * RECENT_COMPLETED_WINDOW_DAYS days) — genuinely "all", not one status. */
  status: RabiesObservationStatus | null;
};

export type ObservacionesScope =
  | { role: "admin"; province: string | null; locality: string | null }
  | { role: "govt"; jurisdictions: readonly DashboardJurisdiction[] };

/** Parses the raw `status` searchParam. Unknown/absent → null (default composite view). */
export function parseObservacionEstado(raw: string | undefined): RabiesObservationStatus | null {
  return raw && (RABIES_OBSERVATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as RabiesObservationStatus)
    : null;
}

/**
 * Rows for the observaciones list. Default view (no `status` filter) = pets
 * currently `in_progress` OR with a `rabies_observation_ended` event in the
 * last 30 days (mirrors the pre-migration page's hardcoded query exactly —
 * zero behavior change at the default). A specific `status` filter narrows to
 * exactly that status, with NO time bound ("every pet whose CURRENT status is
 * X" — e.g. every historically negative-closed observation, not just recent
 * ones); the row cap below still bounds the result size.
 */
export async function fetchObservaciones(scope: ObservacionesScope, filters: ObservacionesFilters) {
  if (scope.role === "govt" && scope.jurisdictions.length === 0) return [];

  const conditions = [];

  if (filters.status) {
    conditions.push(eq(pets.rabiesObservationStatus, filters.status));
  } else {
    const since30 = new Date(Date.now() - RECENT_COMPLETED_WINDOW_DAYS * DAY_MS);
    conditions.push(sql`(
      ${pets.rabiesObservationStatus} = 'in_progress'
      OR EXISTS (
        SELECT 1 FROM ${petEvents}
        WHERE ${petEvents.petId} = ${pets.id}
          AND ${petEvents.eventType} = 'rabies_observation_ended'
          AND ${petEvents.occurredAt} >= ${since30.toISOString()}
      )
    )`);
  }

  if (scope.role === "govt") {
    const pairs = scope.jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  } else {
    if (scope.province) conditions.push(eq(pets.jurisdictionProvince, scope.province));
    if (scope.locality) conditions.push(eq(pets.jurisdictionLocality, scope.locality));
  }

  const rows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      species: pets.species,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      status: pets.rabiesObservationStatus,
    })
    .from(pets)
    .where(and(...conditions))
    // W1: the single "En curso" observation must LEAD — it is the only row
    // that needs a professional cierre (see the page for the full rationale).
    .orderBy(sql`(${pets.rabiesObservationStatus} = 'in_progress') DESC`, pets.name)
    .limit(OBSERVACIONES_ROW_LIMIT);

  return rows.map((r) => ({
    ...r,
    status: (r.status ?? "in_progress") as RabiesObservationStatus,
  }));
}

export type ObservacionRow = Awaited<ReturnType<typeof fetchObservaciones>>[number];
