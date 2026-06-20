"use client";

// PanoramaKpiStrip — the console's headline KPI tiles.
//
// Renders the use-case's KPIs as OpKpi tiles (with ⓘ info tooltips and drill
// hrefs to the matching detail dashboard). A visible cue states the numbers are
// "recalculado para este alcance / este período" so the operator understands
// the strip tracks the active filters — not a static national figure.
//
// PARITY: the values + tooltip wording come straight from getPanoramaKpis,
// which calls the same tested dashboard fetchers — so a number here always
// matches the same number on the detail dashboard it links to.

import { OpKpi } from "@/components/ui/dashboard";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";

export function PanoramaKpiStrip({ kpis }: { kpis: PanoramaKpis }) {
  return (
    <section aria-label="Indicadores del panorama" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.kpis.map((kpi) => (
          <OpKpi
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            tone={kpi.tone}
            bar={kpi.bar}
            sub={kpi.sub}
            href={kpi.href}
            info={kpi.info}
          />
        ))}
      </div>
      {/* Recalculation cue — the strip tracks the active scope + period. */}
      <p className="flex items-center gap-1.5 text-[11px] text-ln-op-mute">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ln-op-azul" />
        {kpis.recalculatedFor} Consistente con las superficies de detalle.
      </p>
    </section>
  );
}
