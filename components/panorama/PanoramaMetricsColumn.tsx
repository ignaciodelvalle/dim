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
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import type { PanoramaKpiId } from "@/src/modules/panorama/domain/types";

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids, in display order. Null = show all (manual mode). */
  metricIds: readonly PanoramaKpiId[] | null;
};

export function PanoramaMetricsColumn({ kpis, metricIds }: Props) {
  const shown =
    metricIds === null
      ? kpis.kpis
      : metricIds
          .map((id) => kpis.kpis.find((k) => k.id === id))
          .filter((k): k is NonNullable<typeof k> => k !== undefined);

  if (shown.length === 0) return null;

  return (
    <section aria-label="Indicadores de esta vista" className="space-y-3">
      {shown.map((kpi) => (
        <PanoramaKpiTile key={kpi.id} kpi={kpi} />
      ))}
    </section>
  );
}
