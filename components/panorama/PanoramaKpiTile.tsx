"use client";

// PanoramaKpiTile — one headline KPI tile (extracted from PanoramaKpiStrip,
// panorama-vista-redesign Phase 3). Renders an OpKpi card + a neutral delta
// line underneath. Reused by PanoramaMetricsColumn (per-vista curated set).
//
// The delta stays a neutral text line — NEVER a valence color. Several
// panorama KPIs are bad-when-up (zoonosis, mordeduras); a green "Sube" would
// misread a worsening trend as an improvement (code review 2026-07-03).

import { OpKpi } from "@/components/ui/dashboard";
import type { KpiDelta, PanoramaKpi } from "@/src/modules/panorama/application/get-panorama-kpis";

const DELTA_GLYPH: Record<KpiDelta["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "＝",
};

type Props = {
  kpi: PanoramaKpi;
};

export function PanoramaKpiTile({ kpi }: Props) {
  return (
    <div className="space-y-1">
      <OpKpi
        label={kpi.label}
        value={kpi.value}
        tone={kpi.tone}
        bar={kpi.bar}
        sub={kpi.sub}
        href={kpi.href}
        info={kpi.info}
      />
      {kpi.delta && (
        <p className="flex items-center gap-1 text-xs tabular-nums text-ln-op-mute">
          <span aria-hidden="true">{DELTA_GLYPH[kpi.delta.direction]}</span>
          <span>{kpi.delta.label}</span>
        </p>
      )}
    </div>
  );
}
