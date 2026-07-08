"use client";

// PanoramaReading — the one-line auto-reading above the map (panorama-redesign
// Fase 1). Thin presentational wrapper over the pure domain builder: the
// sentence derives EXCLUSIVELY from the KpiDelta[] the KPI strip already
// carries (get-panorama-kpis.ts) — zero new queries, never a value from a
// k-anon-suppressed cell.
//
// Hidden while the KPIs are stale: the kpisStale warning already covers that
// state, and a "reading" over stale numbers would mislead the operator.

import { type ReadingKpi, buildPanoramaReading } from "@/src/modules/panorama/domain/reading";

type Props = {
  /** The headline KPIs (PanoramaKpi[] satisfies this structurally). */
  kpis: readonly ReadingKpi[];
  /** True when the last KPI refetch failed — the numbers on screen are stale. */
  stale: boolean;
};

export function PanoramaReading({ kpis, stale }: Props) {
  if (stale) return null;
  return (
    <p aria-live="polite" className="text-sm font-medium text-ln-op-ink">
      {buildPanoramaReading(kpis)}
    </p>
  );
}
