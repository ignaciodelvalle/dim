"use client";

// PanoramaKpiTile — one headline KPI tile (extracted from PanoramaKpiStrip,
// panorama-vista-redesign Phase 3). Renders an OpKpi card + a neutral delta
// line underneath. Reused by PanoramaMetricsColumn (per-vista curated set).
//
// The delta stays a neutral text line — NEVER a valence color. Several
// panorama KPIs are bad-when-up (zoonosis, mordeduras); a green "Sube" would
// misread a worsening trend as an improvement (code review 2026-07-03).
//
// v+1 rail: `bar` (target-progress meter) and `sparkline` (inline trend) are
// straight pass-throughs to OpKpi — both already existed on OpKpi, only
// `kpi.sparkline` is new (get-panorama-kpis.ts). No new visual language.

import { Icon } from "@/components/Icon";
import { OpKpi } from "@/components/ui/dashboard";
import type { KpiDelta, PanoramaKpi } from "@/src/modules/panorama/application/get-panorama-kpis";

// Delta direction glyph — up/down route through the Icon registry (no bare
// triangle glyphs); "flat" has no lucide equivalent worth a registry entry
// for a single fullwidth "＝" (not a banned symbol-as-icon character).
function DeltaGlyph({ direction }: { direction: KpiDelta["direction"] }) {
  if (direction === "flat") return <span aria-hidden="true">＝</span>;
  return <Icon name={direction === "up" ? "chevron-up" : "chevron-down"} size="sm" decorative />;
}

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
        sparkline={kpi.sparkline}
      />
      {kpi.delta && (
        <p className="flex items-center gap-1 text-xs tabular-nums text-ln-op-mute">
          <DeltaGlyph direction={kpi.delta.direction} />
          <span>{kpi.delta.label}</span>
        </p>
      )}
    </div>
  );
}
