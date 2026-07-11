import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { PanoramaConsole, type SeededLayer } from "@/components/panorama/PanoramaConsole";
import { PanoramaDemoDisclosure } from "@/components/panorama/PanoramaDemoDisclosure";
import type { LocalityCentroids } from "@/lib/infra/ar-localidades";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
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
  /**
   * Headline KPIs recalculated for the active scope+period. Optional since perf
   * plan 1.3: a page may instead stream `kpisPromise` (un-awaited) so the shell
   * paints before the KPI fan-out resolves. Pass exactly one.
   */
  kpis?: PanoramaKpis;
  /**
   * perf plan 1.3 — un-awaited KPI loader promise streamed to the console over
   * RSC. Forwarded verbatim to PanoramaConsole, which resolves it client-side
   * and shows a "Cargando indicadores…" pending strip meanwhile.
   */
  kpisPromise?: Promise<PanoramaKpis>;
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
  /**
   * ISO 3166-2:AR code of the province the operator is IMPLICITLY scoped to
   * (single-province govt case) when no province is explicitly selected. Lets
   * the console render that province's administrative divisions on mount for a
   * jurisdiction-scoped operator who never touches the province picker (PO
   * validation 2026-07-07). Undefined for multi-province / admin national scope.
   * Presentation-only: the data scope is unchanged (enforced server-side).
   */
  initialDivisionProvince?: string | null;
  /**
   * Role-aware default vista auto-activated on a first visit (bare URL). The
   * page resolves it from the operator's role: a jurisdiction (govt) operator
   * opens on local syndromic surveillance; admin keeps the national default.
   * Omitted → PanoramaConsole falls back to DEFAULT_PANORAMA_PRESET_ID.
   * Presentation-only; the URL ?preset contract still wins.
   */
  defaultPresetId?: PresetId;
  /**
   * perf plan commit 1.2 — first-visit fast path. On a TRULY-first visit the
   * page resolves the role-default preset and seeds ALL its layers (cached) at
   * the preset's level + period; these props carry that seed to the console so
   * the map paints on first render with zero client fetches. Absent on
   * non-first visits (the page keeps seeding perdidas). `seededPresetId` equals
   * `defaultPresetId` on this path.
   */
  seededPresetId?: PresetId;
  seededLayers?: SeededLayer[];
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
  kpisPromise,
  initialBounds,
  suppressDemoDisclosure = false,
  initialLevel = "province",
  initialDivisionProvince,
  defaultPresetId,
  seededPresetId,
  seededLayers,
}: Props) {
  return (
    // v2C LIGHT operator theme (PO decision 2026-07-11 — the v1 dark
    // "situation-room" skin is retired on BOTH /gob and /admin). The ln-op-*
    // tokens resolve to their light :root defaults; the map canvas is now light
    // (#ffffff) too. The wrapper bleeds the light page background to the
    // content-region edges (negative margins cancel the shell's px-6 vertical
    // padding, then re-add a tighter inner pad) so the operator page canvas
    // reaches below the topbar and beside the rail without forking the shared
    // AppShell/topbar.
    <div
      className="-mx-6 -my-5.5 space-y-2.5 bg-ln-op-page px-6 py-3.5 text-ln-op-ink"
      // The negative margins shrink the box by the cancelled shell padding
      // (2 × 22px); stretch min-height back so the page background always reaches
      // the content-region bottom edge even on short states (px math lives in
      // style= because the token ratchet bans arbitrary px classes).
      style={{ minHeight: "calc(100% + 44px)" }}
    >
      {/* ARCHETYPE A identity line (eyebrow + live scope pill + "Acerca de esta
          vista") now lives INSIDE PanoramaConsole so the scope pill tracks the
          embedded client drill. The shell rendered it from the byte-static
          `scopeLabel` prop, which a shallow pushState drill never updates
          (live-QA regression 2026-07-11) — the console re-labels it live from the
          client scope state and receives the server default via `scopeLabel`. */}

      {/* panorama-redesign Fase 1 reflow: the console (presets + map) leads;
          the unified filters moved INTO the console's "Alcance y período"
          disclosure via the filtersSlot RSC slot (this server component keeps
          ownership of the JSX — the pickers' behavior, including their
          window.location.assign navigation, is byte-identical). Demo
          disclosure + methodology follow the console. */}
      <PanoramaConsole
        scopeLabel={scopeLabel}
        defaultLayerId={layer.id}
        defaultFeatures={features}
        defaultTruncated={truncated}
        defaultSuppressedCount={suppressedCount}
        initialKpis={kpis}
        kpisPromise={kpisPromise}
        initialBounds={initialBounds}
        localityCentroids={localityCentroids}
        initialLevel={initialLevel}
        initialDivisionProvince={initialDivisionProvince}
        defaultPresetId={defaultPresetId}
        seededPresetId={seededPresetId}
        seededLayers={seededLayers}
        // panorama embedded-drill: the console renders the JurisdictionSwitcher
        // CLIENT-SIDE so a province/locality pick commits the scope shallowly (no
        // reload). allowedProvinces + the initial localities are handed down; the
        // console refreshes localities/centroids from /api/panorama/scope on drill.
        allowedProvinces={allowedProvinces}
        localities={localities}
        filtersSlot={
          <div className="space-y-3 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card/40 p-3">
            {/* Panorama defaults to a multi-year window (3 años) and exposes the 3a/5a
                chips so the temporal reproduction spans the seeded history. The detail
                dashboards keep their own short defaults (multiYear only here). */}
            <PeriodPicker defaultPreset="3y" multiYear />
          </div>
        }
      />

      {/* Demo-data disclosure — synthetic dataset (exec-gate credibility).
          Suppressed when a global demo banner already covers the page (D3). */}
      <PanoramaDemoDisclosure hidden={suppressDemoDisclosure} />

      {/* Methodology / "acerca de estas métricas" — for a government data product
          the operator must be able to see how each indicator is computed, its
          sources, and the privacy treatment (exec-gate E9 credibility). */}
      <details className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card/40 px-3 py-2 text-sm text-ln-op-ink-2">
        <summary className="cursor-pointer select-none font-medium text-ln-op-ink">
          Acerca de estas métricas
        </summary>
        <ul className="mt-2 space-y-1.5 text-[var(--text-sm)] leading-relaxed">
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
    </div>
  );
}
