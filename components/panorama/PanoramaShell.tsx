import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { PanoramaConsole } from "@/components/panorama/PanoramaConsole";
import { PanoramaDemoDisclosure } from "@/components/panorama/PanoramaDemoDisclosure";
import type { LocalityCentroids } from "@/lib/infra/ar-localidades";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import type {
  AggregationLevel,
  FeatureCollection,
  PanoramaLayer,
} from "@/src/modules/panorama/domain/types";

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
  /**
   * Centroid map (slug → [lng, lat]) for the selected province's localities.
   * Used by SituationalMap to autozoom when a locality is picked (A1 PR-7).
   * Empty object when no province is selected.
   */
  localityCentroids?: LocalityCentroids;
  /** Headline KPIs recalculated for the active scope+period (server-rendered). */
  kpis: PanoramaKpis;
  /**
   * Pre-zoomed bounding box for the map's initial viewport.
   * Govt operators receive their jurisdiction bbox (server-computed); admin
   * leaves this undefined to keep the national/data-extent view.
   */
  initialBounds?: [[number, number], [number, number]];
  /**
   * Suppress PanoramaShell's own "Datos de demostración" notice when a GLOBAL
   * demo banner already covers the page (e.g. /admin with NEXT_PUBLIC_DEMO_MODE=
   * true) — avoids stacking two identical disclosures (D3).
   */
  suppressDemoDisclosure?: boolean;
  /**
   * Aggregation axis the page resolved the default layer's seed at — must
   * match the level passed to getLayerFeatures. Scoped views pass "locality"
   * so the console opens at the finest granularity (QA 2026-07-03).
   */
  initialLevel?: AggregationLevel;
};

export function PanoramaShell({
  scopeLabel,
  layer,
  features,
  truncated = false,
  suppressedCount = 0,
  allowedProvinces,
  localities,
  localityCentroids = {},
  kpis,
  initialBounds,
  suppressDemoDisclosure = false,
  initialLevel = "province",
}: Props) {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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
        {/* Panorama defaults to a multi-year window (3 años) and exposes the 3a/5a
            chips so the temporal reproduction spans the seeded history. The detail
            dashboards keep their own short defaults (multiYear only here). */}
        <PeriodPicker defaultPreset="3y" multiYear />
      </div>

      {/* Demo-data disclosure — synthetic dataset (exec-gate credibility).
          Suppressed when a global demo banner already covers the page (D3). */}
      <PanoramaDemoDisclosure hidden={suppressDemoDisclosure} />

      {/* Methodology / "acerca de estas métricas" — for a government data product
          the operator must be able to see how each indicator is computed, its
          sources, and the privacy treatment (exec-gate E9 credibility). */}
      <details className="rounded-[6px] border border-ln-op-line bg-ln-op-card/40 px-3 py-2 text-sm text-ln-op-ink-2">
        <summary className="cursor-pointer select-none font-medium text-ln-op-ink">
          Acerca de estas métricas
        </summary>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
          <li>
            <span className="font-medium text-ln-op-ink">Cálculo.</span> Los indicadores reusan los
            mismos cálculos que los dashboards de detalle (idéntico denominador): el Panorama no los
            recalcula con otra fórmula, los lee de la misma fuente.
          </li>
          <li>
            <span className="font-medium text-ln-op-ink">Fuentes.</span> Densidad poblacional del
            Censo 2022 (INDEC); jurisdicciones y centroides de localidades del padrón{" "}
            <code className="text-xs">ar_localities</code>.
          </li>
          <li>
            <span className="font-medium text-ln-op-ink">Privacidad.</span> Las denuncias de
            bienestar se ubican en el centroide de la localidad, nunca en la dirección exacta. Las
            celdas con menos de 5 casos se suprimen por k-anonimato. Cada capa se limita a 2.000
            puntos por vista.
          </li>
          <li>
            <span className="font-medium text-ln-op-ink">Reproducción temporal.</span> La línea de
            tiempo reconstruye los eventos registrados hasta la fecha elegida. Las capas de estado
            actual (cobertura, mortalidad, refugios) no se reproducen en el tiempo y se atenúan
            mientras se reproduce.
          </li>
        </ul>
      </details>

      <PanoramaConsole
        defaultLayerId={layer.id}
        defaultFeatures={features}
        defaultTruncated={truncated}
        defaultSuppressedCount={suppressedCount}
        initialKpis={kpis}
        initialBounds={initialBounds}
        localityCentroids={localityCentroids}
        initialLevel={initialLevel}
      />
    </div>
  );
}
