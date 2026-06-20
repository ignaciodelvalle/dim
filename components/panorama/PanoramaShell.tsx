import type { FeatureCollection, PanoramaLayer } from "@/src/modules/panorama/domain/types";
import { SituationalMapDynamic } from "./SituationalMapDynamic";

// ---------------------------------------------------------------------------
// PanoramaShell — server component composing the situational console chrome:
// header + scope chip + demo-data disclosure + the (client) map + a legend.
//
// Shared by /admin/panorama (universal scope) and /gob/panorama (jurisdiction
// scope). Slice 1 renders a single active layer (perdidas); the LayerPanel and
// viewport KPIs compose into this shell in later slices.
// ---------------------------------------------------------------------------

type Props = {
  /** Human scope label, e.g. "Nacional · todas las provincias" or "Salta". */
  scopeLabel: string;
  /** The active layer's registry entry (label + color for the legend). */
  layer: PanoramaLayer;
  /** Pre-scoped features for the active layer (resolved server-side). */
  features: FeatureCollection;
};

export function PanoramaShell({ scopeLabel, layer, features }: Props) {
  const count = features.features.length;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Centro de Situación Nacional
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Panorama</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ln-op-line bg-ln-op-card px-2.5 py-0.5 text-[11px] text-ln-op-ink-2">
            <span aria-hidden="true">📍</span>
            {scopeLabel}
          </span>
        </div>
        <p className="text-[13px] text-ln-op-mute">
          Mapa situacional por capas sobre el registro de eventos. Las superficies de detalle
          (mortalidad, vigilancia, pérdidas) viven como capas de esta misma vista.
        </p>
      </header>

      {/* Demo-data disclosure — this is a synthetic dataset (exec-gate credibility). */}
      <p className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-1.5 text-[11px] text-ln-op-ink-2">
        <span className="font-semibold">Datos de demostración.</span> El dataset cargado es
        sintético (densidad ponderada por Censo 2022); no representa casos reales.
      </p>

      <SituationalMapDynamic
        features={features}
        color={layer.color}
        label={`Mapa: ${layer.label}`}
      />

      {/* Legend — the active layer (Slice 1). Becomes the LayerPanel in Slice 2. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ln-op-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full border border-ln-op-line"
            style={{ background: layer.color }}
            aria-hidden="true"
          />
          {layer.label}
        </span>
        <span className="tabular-nums text-ln-op-mute">
          {count.toLocaleString("es-AR")} {count === 1 ? "punto" : "puntos"}
        </span>
      </div>
    </div>
  );
}
