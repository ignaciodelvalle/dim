// SENASA / LSUCyF batch export — scoped gather (IO stage).
//
// See docs/design/sdd/2026-07-07-senasa-lsucyf-batch-export.md.
//
// The ONLY database-touching part of the SENASA export. Gathers sanitary-
// aligned pet_events (tipo_evento_code IS NOT NULL) within a ProjectionContext
// (jurisdiction scope + period), joined to their pets, and returns plain
// SenasaEventRow[] for the pure transform in senasa-export.ts. Scoping mirrors
// lib/analytics/campaign-metrics.ts exactly:
//   - admin (scope.kind='global') → no jurisdiction WHERE.
//   - govt  (scope.kind='jurisdictions') → OR of (province AND locality) pairs
//     matched against pets.jurisdiction_province / pets.jurisdiction_locality.

import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import type { SenasaEventRow } from "@/lib/analytics/senasa-export";
import type { ProjectionContext } from "@/lib/metrics";

/**
 * Gathers the SENASA-aligned events in scope for the given context.
 * Bounds on occurred_at (the clinical date), NOT recorded_at.
 * Returns [] for a govt context with no jurisdictions (nothing in scope).
 */
export async function fetchSenasaBatch(ctx: ProjectionContext): Promise<SenasaEventRow[]> {
  const { since, until } = ctx.period;

  // Base predicate: only sanitary-aligned rows, within the clinical-date window.
  const base = and(
    isNotNull(petEvents.tipoEventoCode),
    gte(petEvents.occurredAt, since),
    lt(petEvents.occurredAt, until),
  );

  // Jurisdiction scope.
  let where = base;
  if (ctx.scope.kind === "jurisdictions") {
    const { jurisdictions } = ctx.scope;
    if (jurisdictions.length === 0) return [];
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    where = and(base, sql.join(pairs, sql` OR `));
  }

  const rows = await db
    .select({
      animalToken: pets.publicToken,
      species: pets.species,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
      occurredAt: petEvents.occurredAt,
      tipoEventoCode: petEvents.tipoEventoCode,
      loteBiologico: petEvents.loteBiologico,
      laboratorio: petEvents.laboratorio,
      vencimientoBiologico: petEvents.vencimientoBiologico,
      viaAplicacionCode: petEvents.viaAplicacionCode,
      vetMatricula: petEvents.vetMatricula,
      vetJurisdiccionCode: petEvents.vetJurisdiccionCode,
      establecimientoRenspa: petEvents.establecimientoRenspa,
      proximaDosisAt: petEvents.proximaDosisAt,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(where)
    .orderBy(petEvents.occurredAt);

  // tipoEventoCode is guaranteed non-null by the isNotNull predicate; narrow
  // the column type (text → string) for the pure transform's input contract.
  return rows.map((r) => ({
    ...r,
    tipoEventoCode: r.tipoEventoCode as string,
  }));
}
