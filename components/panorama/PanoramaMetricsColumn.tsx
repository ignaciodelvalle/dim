"use client";

// PanoramaMetricsColumn — the per-vista metrics column (panorama-vista-
// redesign Phase 3, design Decision 3). Replaces the flat 7-tile
// PanoramaKpiStrip body: shows only the ACTIVE preset's curated `metrics`
// (3-4 KpiIds, in the preset's declared order), reading the SAME
// `getPanoramaKpis()` result — no forked query, dashboard parity intact.
//
// Manual/advanced mode (no active preset, `metricIds` null) shows every KPI —
// nothing is hidden when the operator isn't following a curated question.

import { PanoramaKpiTile } from "@/components/panorama/PanoramaKpiTile";
import type {
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import type { PanoramaKpiId } from "@/src/modules/panorama/domain/types";

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids, in display order. Null = show all (manual mode). */
  metricIds: readonly PanoramaKpiId[] | null;
};

/**
 * The subset of `kpis.kpis` this column actually renders: every KPI in
 * manual mode (`metricIds` null), or exactly the active preset's curated
 * metrics, in the preset's declared order, dropping any id the strip result
 * doesn't carry (a partial payload). Exported so PanoramaConsole can feed the
 * SAME subset to PanoramaReading (QA fix, finding 5) — the one-line auto-
 * reading must never headline off a KPI the column itself is hiding.
 */
export function selectMetricKpis(
  kpis: PanoramaKpis,
  metricIds: readonly PanoramaKpiId[] | null,
): PanoramaKpi[] {
  return metricIds === null
    ? kpis.kpis
    : metricIds
        .map((id) => kpis.kpis.find((k) => k.id === id))
        .filter((k): k is NonNullable<typeof k> => k !== undefined);
}

export function PanoramaMetricsColumn({ kpis, metricIds }: Props) {
  const shown = selectMetricKpis(kpis, metricIds);

  if (shown.length === 0) {
    // QA fix (finding 6): a partial payload can filter every curated metric
    // out — say so instead of silently rendering nothing, which used to read
    // as "the column vanished" rather than "these metrics aren't available".
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
        Métricas no disponibles para esta vista.
      </p>
    );
  }

  return (
    <section aria-label="Indicadores de esta vista" className="space-y-3">
      {shown.map((kpi) => (
        <PanoramaKpiTile key={kpi.id} kpi={kpi} />
      ))}
    </section>
  );
}
