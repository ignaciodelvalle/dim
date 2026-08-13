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

import { type SQL, and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import type { SenasaEventRow } from "@/lib/analytics/senasa-export";
import { type ProjectionContext, jurisdictionPairClause } from "@/lib/metrics";

/** Filas por página del keyset. Acota la memoria, no el total exportado. */
const SENASA_PAGE_SIZE = 1000;

/**
 * La fila tal como sale de la query: SenasaEventRow más las dos columnas que
 * usa el keyset y que NO viajan al transform. Declarada explícitamente porque
 * el cursor se alimenta del resultado y el resultado depende del cursor —
 * TypeScript no puede inferir eso sin ayuda (TS7022).
 */
type SenasaPageRow = Omit<SenasaEventRow, "tipoEventoCode"> & {
  id: string;
  tipoEventoCode: string | null;
};

/**
 * Recorre los eventos alineados a SENASA en scope, DE A PÁGINAS.
 *
 * Acota en occurred_at (la fecha clínica), NO en recorded_at.
 * No emite nada para un contexto govt sin jurisdicciones (nada en scope).
 *
 * POR QUÉ ES UN GENERADOR Y NO DEVUELVE UN ARRAY (2026-08-13). Hasta hoy esto
 * era `fetchSenasaBatch(ctx): Promise<SenasaEventRow[]>`: una query sin LIMIT
 * sobre `pet_events` que materializaba el resultado entero en memoria. Está
 * dormida —cero callers— y por eso la 2a pasada de auditoría la dejó como nota
 * y no como hallazgo.
 *
 * Se cambia igual, y ahora, precisamente porque está dormida: el día que
 * alguien cablee la ruta de export SENASA no va a auditar esta función, va a
 * asumir que está lista. Es la misma forma del hallazgo #4 (correcto por ítem,
 * ruinoso por barrido) atrapada antes de tener consecuencias, y el costo ahora
 * es una fracción del costo después. Para dimensionar: `pets` tiene 32.428 filas
 * en la base local y `pet_events` es varias veces eso.
 *
 * La firma es la que impide el mal uso, no un comentario: no existe una función
 * que devuelva todo junto. Quien quiera el array completo tiene que escribir el
 * `for await` y acumular a propósito, que es una decisión visible en su código.
 *
 * El keyset es compuesto `(occurred_at, id)` porque occurred_at no es único —
 * paginar sólo por fecha saltearía o repetiría filas que comparten el instante.
 */
export async function* streamSenasaBatch(
  ctx: ProjectionContext,
  // `pageSize` existe para que un test pueda cruzar el límite de página con
  // pocas filas. El default sigue acotando la memoria en producción; no hay
  // forma de pedir "todo en una página" sin escribirlo explícitamente.
  opts: { pageSize?: number } = {},
): AsyncGenerator<SenasaEventRow, void, undefined> {
  const pageSize = opts.pageSize ?? SENASA_PAGE_SIZE;
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
    if (jurisdictions.length === 0) return;
    // jurisdictionPairClause applies whole-province subsumption — see
    // lib/metrics/scope.ts. Found via authz-subsumption fence hardening
    // (2026-07-22) — same bug class as commit 68501bb4. Without it, a
    // whole-province operator's SENASA export would silently drop every
    // barrio-tagged sanitary event in their own province.
    const scopeClause =
      jurisdictionPairClause(
        [...jurisdictions],
        sql`${pets.jurisdictionProvince}`,
        sql`${pets.jurisdictionLocality}`,
      ) ?? sql`false`;
    where = and(base, scopeClause);
  }

  let cursor: { occurredAt: Date; id: string } | null = null;

  for (;;) {
    const pageWhere: SQL | undefined = cursor
      ? and(
          where,
          // Comparación de fila: ordena por (occurred_at, id) igual que el
          // ORDER BY, así que retoma exactamente donde cortó la página anterior.
          // Los tipos van explícitos: sin el cast, el driver no sabe bindear un
          // Date y un uuid dentro de un constructor de fila y tira
          // ERR_INVALID_ARG_TYPE. Lo encontró el test de límite de página.
          sql`(${petEvents.occurredAt}, ${petEvents.id}) > (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
        )
      : where;

    const rows: SenasaPageRow[] = await db
      .select({
        id: petEvents.id,
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
      .where(pageWhere)
      .orderBy(petEvents.occurredAt, petEvents.id)
      .limit(pageSize);

    if (rows.length === 0) return;

    for (const r of rows) {
      // `id` es del keyset, no del contrato de salida: no viaja al transform.
      const { id: _id, ...row } = r;
      // tipoEventoCode is guaranteed non-null by the isNotNull predicate; narrow
      // the column type (text → string) for the pure transform's input contract.
      yield { ...row, tipoEventoCode: row.tipoEventoCode as string };
    }

    const last = rows[rows.length - 1];
    cursor = { occurredAt: last.occurredAt, id: last.id };
    if (rows.length < pageSize) return;
  }
}
