// Panorama auto-reading — one-line situational sentence (panorama-redesign Fase 1).
//
// Derives a headline clause (the KPI with the largest-magnitude period-over-
// period delta) plus a count-summary suffix, EXCLUSIVELY from the KpiDelta[]
// already computed by get-panorama-kpis.ts (deltaOf/priorWindowOf). It never
// issues a query and never touches the k-anon cell pipeline — deltas are
// jurisdiction-level dashboard aggregates, and deltaOf returns undefined when
// there is no meaningful prior base (privacy: no value is ever fabricated).
//
// Pure module — no DB, no React, no Next. The input type is STRUCTURAL so the
// domain stays framework-free: PanoramaKpi (application layer) satisfies it
// without an import in that direction.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structural subset of PanoramaKpi the reading needs (id + optional delta). */
export type ReadingKpi = {
  id: string;
  delta?: { pct: number; direction: "up" | "down" | "flat" };
};

// ---------------------------------------------------------------------------
// Internal constants (es-AR copy — PO may adjust wording, flagged non-blocking)
// ---------------------------------------------------------------------------

/**
 * Known window-sensitive KPIs: short display name + valence.
 * `goodUp: true` means an UP direction is an improvement (coverage rising);
 * `goodUp: false` means UP is a deterioration (bites/zoonosis rising).
 * Ids outside this map are ignored — without a valence, mejora/empeora would
 * be a guess, and the reading must never guess.
 */
const KNOWN_KPIS: Record<string, { name: string; goodUp: boolean }> = {
  cobertura: { name: "Cobertura antirrábica", goodUp: true },
  mordeduras: { name: "Mordeduras", goodUp: false },
  zoonosis: { name: "Zoonosis activas", goodUp: false },
};

/** Fixed fallback when no delta qualifies (no prior window, or all flat). */
const FALLBACK_SENTENCE = "Sin variación destacable frente al período anterior.";

// ---------------------------------------------------------------------------
// Reading builder
// ---------------------------------------------------------------------------

type QualifiedKpi = {
  name: string;
  pct: number;
  /** True when direction × valence is an improvement. */
  improves: boolean;
  /** True when the delta is non-flat (eligible for the headline). */
  moves: boolean;
};

function qualify(kpi: ReadingKpi): QualifiedKpi | null {
  const known = KNOWN_KPIS[kpi.id];
  if (!known || !kpi.delta) return null;
  const { pct, direction } = kpi.delta;
  const moves = direction !== "flat";
  const improves = moves && (direction === "up") === known.goodUp;
  return { name: known.name, pct, improves, moves };
}

/**
 * Build the one-line auto-reading sentence:
 *
 *   "{KPI} {empeora|mejora} {N}% vs período anterior; {X} de {Y} indicadores mejoran."
 *
 * Headline = the largest |pct| among non-flat deltas (tie-break: input array
 * order — deterministic). Suffix: X = improving KPIs, Y = KPIs carrying a
 * delta (flat deltas count in Y, never in X). Singular agreement when X = 1.
 * Returns the fixed fallback when nothing qualifies.
 */
export function buildPanoramaReading(kpis: readonly ReadingKpi[]): string {
  const qualified = kpis
    .map(qualify)
    .filter((q): q is QualifiedKpi => q !== null);

  let headline: QualifiedKpi | null = null;
  for (const q of qualified) {
    if (!q.moves) continue;
    // Strict > keeps the FIRST of equal magnitudes (input-order tie-break).
    if (headline === null || Math.abs(q.pct) > Math.abs(headline.pct)) headline = q;
  }
  if (headline === null) return FALLBACK_SENTENCE;

  const verb = headline.improves ? "mejora" : "empeora";
  const magnitude = Math.abs(headline.pct).toLocaleString("es-AR");

  const total = qualified.length;
  const improving = qualified.filter((q) => q.improves).length;
  const suffixVerb = improving === 1 ? "mejora" : "mejoran";

  return `${headline.name} ${verb} ${magnitude}% vs período anterior; ${improving} de ${total} indicadores ${suffixVerb}.`;
}
