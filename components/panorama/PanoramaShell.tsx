import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { PanoramaConsole } from "@/components/panorama/PanoramaConsole";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import type { FeatureCollection, PanoramaLayer } from "@/src/modules/panorama/domain/types";

// ---------------------------------------------------------------------------
// PanoramaShell — server component composing the situational console chrome:
// header + scope chip + unified filters (JurisdictionSwitcher + PeriodPicker) +
// demo-data disclosure + the (client) multi-layer console (map + LayerPanel).
//
// Shared by /admin/panorama (universal scope) and /gob/panorama (jurisdiction
// scope). The default layer (perdidas) is resolved server-side; the client
// console fetches the other layers on toggle, threading the same filters.
// ---------------------------------------------------------------------------

type Props = {
  /** Human scope label, e.g. "Nacional · todas las provincias" or "Salta". */
  scopeLabel: string;
  /** The default-on layer's registry entry (perdidas). */
  layer: PanoramaLayer;
  /** Pre-scoped features for the default layer (resolved server-side). */
  features: FeatureCollection;
  /** Envelope for the default layer (surfaced in the LayerPanel). */
  truncated?: boolean;
  suppressedCount?: number;
  /** Provinces the viewer may filter to (admin: all; govt: its own). */
  allowedProvinces: Array<{ code: string; name: string }>;
  /** Localities of the selected province (for the JurisdictionSwitcher). */
  localities: Array<{ slug: string; name: string }>;
  /** Headline KPIs recalculated for the active scope+period (server-rendered). */
  kpis: PanoramaKpis;
};

export function PanoramaShell({
  scopeLabel,
  layer,
  features,
  truncated = false,
  suppressedCount = 0,
  allowedProvinces,
  localities,
  kpis,
}: Props) {
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

      {/* Unified filters — scope + period drive the layers (same controls as the
          dashboards). Changing them reloads the server render (default layer) and
          the client re-fetches active layers with the new params. */}
      <div className="space-y-3 rounded-[8px] border border-ln-op-line bg-ln-op-card/40 p-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* Demo-data disclosure — this is a synthetic dataset (exec-gate credibility). */}
      <p className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-1.5 text-[11px] text-ln-op-ink-2">
        <span className="font-semibold">Datos de demostración.</span> El dataset cargado es
        sintético (densidad ponderada por Censo 2022); no representa casos reales.
      </p>

      <PanoramaConsole
        defaultLayerId={layer.id}
        defaultFeatures={features}
        defaultTruncated={truncated}
        defaultSuppressedCount={suppressedCount}
        initialKpis={kpis}
      />
    </div>
  );
}
