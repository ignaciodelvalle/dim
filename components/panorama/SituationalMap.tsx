"use client";

import type maplibregl from "maplibre-gl";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

import { CabaInset } from "@/components/panorama/CabaInset";
import {
  INCIDENT_LABEL,
  PET_STATUS_LABEL,
  SEVERITY_LABEL,
} from "@/components/panorama/DetailDrawer";
import { SavedViewsPopover } from "@/components/panorama/SavedViewsPopover";
import {
  BIVARIATE_LEGEND_GRID,
  bivariateFillColorExpr,
  bivariateReadouts,
  bivariateSuppressedCodes,
  bivariateSuppressedFilter,
} from "@/components/panorama/bivariate-fill";
import { fetchGeojsonCached } from "@/components/panorama/geojson-cache";
import {
  type GraduatedScale,
  buildGraduatedScale,
  graduatedMaxCount,
} from "@/components/panorama/graduated-scale";
import { HATCH_IMAGE_ID, buildHatchImageData } from "@/components/panorama/hatch-pattern";
import { histogramPeak, valueHistogram } from "@/components/panorama/legend-histogram";
import {
  type LayerReadout,
  buildLayerReadout,
  buildPinnedPopupHtml,
} from "@/components/panorama/map-popup";
import { buildExportFooter } from "@/components/panorama/panorama-export";
import { type DomainBounds, resolveScrubDomain } from "@/components/panorama/scale-lock";
import { type BivariateCell, riskLabel } from "@/src/modules/panorama/domain/bivariate";

import {
  type DivisionLevel,
  divisionFillColorExpr,
  divisionSuppressedFilter,
  divisionValueBounds,
  joinCellsToDivisionsMulti,
} from "@/components/panorama/division-fill";
import { divisionLabelAnchors } from "@/components/panorama/division-labels";
import {
  type Bbox,
  FRAMING_SNAP_MAX_ZOOM,
  type ProvinceBbox,
  Z_DIVISIONS,
  computeJurisdictionViewport,
  computePresetFrameViewport,
  computeProvinceBboxes,
  countRenderableFeatures,
  hasProvinceChoroplethLayer,
  resolveDivisionProvinces,
  shouldSnapFraming,
} from "@/components/panorama/situational-map-utils";
import {
  isCABA,
  normalizeBarioCode,
  normalizeDepartmentCode,
  provinceDepartmentPrefix,
} from "@/lib/infra/geo-join";
import type { PresetFraming } from "@/src/modules/panorama/domain/presets";
import type { AggregationLevel, FeatureCollection } from "@/src/modules/panorama/domain/types";

// maplibre-gl ships its own CSS (popups, controls, canvas). It is imported
// per-map-component in this repo (see LocationMap/LocationPicker), not globally.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  FIXED_RATE_DOMAIN,
  type ScaleBounds,
  provinceColorExpr,
  provinceDivergentColorExpr,
  provinceValueBounds,
} from "@/components/panorama/province-choropleth-style";
import {
  COLOR_NO_DATA,
  COLOR_SUPPRESSED,
  RAMP_BLUE,
  divergentStops,
  sampleStops,
} from "@/lib/analytics/viz-scales";
import { AR_BBOX } from "@/lib/ui/map-bounds";
import type { MapCamera } from "@/lib/ui/map-layer-nav";
import { escapeHtml } from "@/lib/utils/escape-html";

// ---------------------------------------------------------------------------
// SituationalMap — the Panorama console's geospatial canvas.
//
// PRIVACY (spec §13.4): the basemap is built ENTIRELY from a local GeoJSON
// asset (public/geo/ar-provinces.geojson). There is NO external tile/glyph
// provider — a government situational map must not beacon the operator's
// viewport or the plotted locations to a third party. This is why we do NOT
// reuse components/charts/MapChoropleth's OpenStreetMap raster style.
//
// Because we ship no glyph server, map layers carry NO on-canvas text; counts
// and details are surfaced via HTML popups (same approach as MapChoropleth).
//
// Slice 2 renders MULTIPLE simultaneous layers:
//   - point layers (clustered natively by MapLibre), and
//   - graduated-symbol choropleth layers (circle radius + color by value;
//     suppressed cells muted via COLOR_SUPPRESSED).
// Layers are added/removed dynamically as the LayerPanel toggles them. The map
// keeps a registry of mounted layer ids and reconciles against the prop on each
// render. Perdidas is the default-on layer (mounted by the parent on load).
// ---------------------------------------------------------------------------

/**
 * The rendering mode for a point-geometry layer (F1 Panorama v2).
 *
 *  - `"graduated"` — density+signal layers: one NON-clustered circle per
 *    administrative unit, radius scaled by the feature's `count` property.
 *    The toggle axis (province/locality) drives which granularity was used
 *    server-side; the client renders whatever the server sent.
 *  - `"reference"` — individual-entity layers (refugios, decomisos): discrete
 *    pins with MapLibre native clustering. The toggle axis is ignored for these.
 *  - `"points"` — panorama-event-points Slice 1: REAL event-location dots
 *    (perdidas sightings) at near zoom inside a jurisdiction. Shares the
 *    reference clustered-pin renderer (design D3) with per-layer color; an
 *    individual dot opens the DetailDrawer (the pet card the operator already
 *    accesses — no new PII surface, D7).
 */
export type PointRenderMode = "graduated" | "reference" | "points";

/** One active layer the map must render. `geomType` decides point vs choropleth;
 * for point layers, `renderMode` further decides graduated (F1) vs discrete pins. */
export type ActiveLayer = {
  id: string;
  color: string;
  label: string;
  geomType: "point" | "choropleth";
  /**
   * Point-layer rendering mode (F1 Panorama v2). Only set for geomType="point":
   *   - `"graduated"` → density/signal layers: per-unit circles sized by count.
   *   - `"reference"` → reference layers: discrete pins with native MapLibre clustering.
   * Undefined (or ignored) for choropleth layers.
   */
  renderMode?: PointRenderMode;
  features: FeatureCollection;
  /**
   * U5 aggregation axis (choropleth layers only, and graduated point layers).
   * For choropleth: "province" → fill the local ar-provinces polygons by value;
   * "locality" → centroid graduated symbols. For graduated point layers: reflects
   * which grouping the server used (province or locality). Reference layers and
   * choropleth layers leave this following U5 semantics.
   */
  level?: AggregationLevel;
  /** F4: muted while a time scrub is active because the layer has no time
   * dimension (refugios) or is a current-state rollup (cobertura/mortalidad) —
   * it shows live data, not as-of-t, so it is rendered dimmed (not as if as-of). */
  dimmed?: boolean;
  /**
   * F5: the layer's data-type taxonomy from the registry (threaded from
   * PanoramaLayer.dataType). Used to choose the divergent vs sequential
   * choropleth rendering path. Undefined for layers that pre-date F5 or for
   * point layers where dataType drives aggregation, not coloring.
   */
  dataType?: "rate" | "density" | "signal" | "reference";
  /**
   * F5: compliance target for `dataType: "rate"` layers (e.g. 80 for the
   * antirrábica 80% legal goal). When present alongside `dataType === "rate"`,
   * the province choropleth renders as a DIVERGENT scale anchored at this value.
   * Undefined for density/signal/reference layers (sequential coloring).
   */
  complianceTarget?: number;
  /**
   * map-QOL: per-layer opacity multiplier 0.2..1 (default 1), set from the
   * Personalizar panel. Multiplies the layer's base opacity expressions — the
   * suppressed-cell muting and the F4 dim behavior are preserved underneath.
   */
  opacity?: number;
  /**
   * task #63 (bivariate "riesgo-brotes"): when present, this province choropleth
   * is rendered as the 3×3 bivariate encoding (coverage terciles × signal
   * terciles) INSTEAD of its normal single-value fill. The cells carry both raw
   * values, both classes, and the k-anon suppression that PROPAGATED from either
   * input (a suppressed province is hatched, never colored). Only meaningful for
   * a province-level choropleth layer. Absent → normal single-value rendering.
   */
  bivariateCells?: BivariateCell[];
};

type Props = {
  /** The set of currently-active layers (perdidas default-on). */
  layers: ActiveLayer[];
  /** Accessible name for the map region. */
  label: string;
  /** Map height in px. */
  height?: number;
  /**
   * Fired when an INDIVIDUAL feature is clicked (not a cluster — clusters zoom).
   * Bubbles the layer id + the feature's GeoJSON properties up to the console,
   * which opens the DetailDrawer. Choropleth cells and points both emit this.
   */
  onFeatureClick?: (layerId: string, properties: Record<string, unknown>) => void;
  /**
   * Click-to-drill (task #55): fired when a PROVINCE polygon is clicked at
   * NATIONAL scope. The console commits the province to the scope (reusing the
   * existing `?province` param + the JurisdictionSwitcher full-navigation
   * pattern) so the scope-wins rule forces locality/department level and the map
   * re-renders the province's divisions. Absent → province clicks fall back to
   * pinning the popup (no drill target).
   */
  onProvinceDrill?: (provinceCode: string) => void;
  /**
   * Click-to-drill: fired by the in-map "← Volver" control to pop the scope drill
   * back to the national view. Provided ONLY when the operator can return to
   * national (an explicit province pick, not a forced jurisdiction) — its
   * presence is what renders the control.
   */
  onReturnNational?: () => void;
  /**
   * Pre-zoomed bounding box for the map's initial viewport.
   * When provided (govt operators with assigned jurisdictions), the map opens
   * fitted to this bbox instead of the data-extent bbox.
   * Admin (no assigned jurisdictions) leaves this undefined and keeps the
   * national/data-extent fit.
   */
  initialBounds?: [[number, number], [number, number]];
  /**
   * A1 PR-7: ISO 3166-2:AR province code currently selected in the
   * JurisdictionSwitcher (e.g. "AR-X"). null = national (no province filter).
   * When this changes, the map autozoom to the province's polygon bbox.
   */
  selectedProvinceCode?: string | null;
  /**
   * A1 PR-7: [lng, lat] centroid of the currently selected locality, or null
   * when no locality is selected. When non-null, the map fliesTo this center
   * at zoom 9.5 (locality takes precedence over province autozoom).
   */
  selectedLocalityCenter?: [number, number] | null;
  /**
   * panorama-redesign Fase 1: preset map framing. Set by PanoramaConsole when
   * the operator activates a preset that carries a `framing` field. `token`
   * is a monotonic counter so re-clicking the same preset re-frames. CAMERA
   * ONLY — data scope is untouched. null/undefined = no framing (behavior
   * identical to pre-change).
   */
  frame?: { framing: PresetFraming; token: number } | null;
  /**
   * panorama-ia-v2 §1.1: reports the camera zoom after each zoom gesture. The
   * console derives the aggregation level from it (locality once the camera
   * crosses Z_LOCALITY), replacing the removed manual AggregationToggle — the
   * level is now a property of (scope, zoom), never a control.
   */
  onZoom?: (zoom: number) => void;
  /**
   * "Copiar vista" fidelity (map-QOL): the camera to reproduce on load, decoded
   * from a shared URL. Applied ONCE via a programmatic jumpTo INSTEAD of the
   * computed jurisdiction/data frame so the reproduced view matches the sender's
   * exactly. Captured at mount (a stable per-load value); null/undefined → keep
   * today's computed-frame behavior.
   */
  initialCamera?: MapCamera | null;
  /**
   * "Copiar vista" fidelity (map-QOL): reports the full camera (zoom + center)
   * after every settle so the console can mirror it into the URL. Fires on the
   * same moveend as the zoom derivation (both user and programmatic moves).
   */
  onCameraChange?: (camera: MapCamera) => void;
  /**
   * panorama-ia-v2 §3.3: the unit key (province code) currently highlighted in
   * the RankedUnitsPanel, or null. Drives a feature-state highlight outline on
   * the matching province polygon (row → map sync).
   */
  highlightedUnitKey?: string | null;
  /**
   * panorama-ia-v2 §3.3: fired when the pointer enters/leaves a province
   * polygon on the map, bubbling its code up so the console can highlight the
   * matching ranked row (map → row sync). null on leave.
   */
  onUnitHover?: (key: string | null) => void;
  /**
   * panorama-ia-v2 §3.6: metadata for the "Exportar PNG" footer (auditable
   * provenance). Absent → the export/copy chrome is hidden.
   */
  viewMeta?: {
    asOf: Date | null;
    scopeLabel: string;
    periodLabel: string;
    suppressedCount: number;
  };
};

// Continental Argentina centroid + a zoom that frames the mainland.
const AR_CENTER: [number, number] = [-63.6167, -40.0];
const AR_ZOOM = 3.4;
const BASEMAP_URL = "/geo/ar-provinces.geojson";
// Always-visible admin divisions for a single-province scope (PO directive
// "siempre mostrar la división"). Loaded LAZILY (same-origin — CSP allows only
// 'self') and ONLY when a province scope is active, never on the national view:
// caba-barrios (353 KB) for CABA, ar-departments (693 KB, filtered client-side to
// the active province) for everyone else. The national view keeps the provinces
// basemap untouched.
const CABA_BARRIOS_URL = "/geo/caba-barrios.geojson";
const AR_DEPARTMENTS_URL = "/geo/ar-departments.geojson";
// Regional context basemap: neighbouring South American countries (Chile,
// Uruguay, Brazil, Paraguay, Bolivia, Peru), heavily simplified. Drawn as a
// NON-interactive muted layer BELOW the Argentine provinces so the country no
// longer floats alone on the canvas. Malvinas is NEVER here — it renders only
// as part of Argentina (see scripts/prep-geo-context.ts).
const CONTEXT_URL = "/geo/sudamerica-context.geojson";

// map-QOL zoom-bounds clamp: the camera can never wander away from the
// national territory. AR_BBOX (lib/ui/map-bounds) padded by a few degrees so
// border jurisdictions aren't pinned against the viewport edge.
const MAX_BOUNDS_PAD_DEG = 6;
const AR_MAX_BOUNDS: [[number, number], [number, number]] = [
  [AR_BBOX[0][0] - MAX_BOUNDS_PAD_DEG, AR_BBOX[0][1] - MAX_BOUNDS_PAD_DEG],
  [AR_BBOX[1][0] + MAX_BOUNDS_PAD_DEG, AR_BBOX[1][1] + MAX_BOUNDS_PAD_DEG],
];
const MIN_ZOOM = 3;
// The default max-zoom every programmatic fitBounds uses (before the magnetic
// snap can clamp it lower). Kept as a named constant so all three camera sites
// pass the same ceiling to `framingMaxZoom`.
const FRAME_MAX_ZOOM = 11;
const FRAME_PADDING = 56;

/**
 * panorama magnetic-zoom Phase 2 — resolve the max-zoom a PROGRAMMATIC fitBounds
 * should use. If the frame's NATURAL landing zoom (what fitBounds would pick with
 * no ceiling) falls within ±0.5 of the province↔locality flip, clamp it to
 * `FRAMING_SNAP_MAX_ZOOM` so the frame lands decisively BELOW the flip; otherwise
 * keep the default ceiling. Only programmatic frames route through here — a user
 * wheel/pinch (originalEvent present on the maplibre event) never does, so manual
 * zoom still crosses the boundary freely.
 */
function framingMaxZoom(map: maplibregl.Map, bbox: [[number, number], [number, number]]): number {
  const camera = map.cameraForBounds(bbox, { padding: FRAME_PADDING });
  const landing = camera?.zoom;
  return typeof landing === "number" && shouldSnapFraming(landing)
    ? FRAMING_SNAP_MAX_ZOOM
    : FRAME_MAX_ZOOM;
}

// Dark government-console palette (canvas / land / borders).
const COLOR_CANVAS = "#0b1020";
const COLOR_LAND = "#161d33";
const COLOR_BORDER = "#2b3658";
// Regional-context (neighbour countries) palette: a desaturated, darker
// variant of COLOR_LAND/COLOR_BORDER that sits just above COLOR_CANVAS, so the
// surrounding landmass is legible but clearly recedes behind Argentina.
const COLOR_CONTEXT_LAND = "#0f1528";
const COLOR_CONTEXT_BORDER = "#1c2540";
// Division outlines: a touch brighter than the province border so barrio /
// departamento lines read over COLOR_LAND, but still subtle (they must never
// compete with the data fill on top). Matches the basemap's line treatment.
const COLOR_DIVISION_LINE = "#3a4568";
// Admin-boundary stroke for province outlines. Replaces the old COLOR_CANVAS
// choropleth line, which painted near-black seams that read as CRACKS between
// colored provinces (map-polish cursor #1). A hierarchy-aware neutral slate that
// reads as a boundary over both the land basemap and the data fill.
const COLOR_ADMIN_STROKE = "#5b6b8c";
// map-polish cursor #4 — data/basemap luminance separation. When a data layer
// fills polygons the basemap land dims so the choropleth "sits on" the territory
// instead of tinting it uniformly; outlines keep full opacity.
const DATA_FILL_OPACITY = 0.92;
const BASEMAP_FILL_ACTIVE = 0.55;
const BASEMAP_FILL_IDLE = 1;
// map-polish cursor #5 — border hierarchy. Province admin lines read normally
// when provinces are the finest division on screen, and fade when departamento /
// barrio lines are active so the subordinate divisions dominate.
const PROV_LINE_WIDTH = 0.9;
const PROV_LINE_OPACITY = 0.7;
const PROV_LINE_OPACITY_FADED = 0.3;
// map-polish cursor #7 — division outlines fade IN over DIVISION_FADE_MS on
// drill (prefetch + transition) instead of a hard pop after the camera settles.
const DIVISION_LINE_OPACITY = 0.85;
const DIVISION_FADE_MS = 300;
// cursor #2 — the k-anon hatch overlay opacity, and a SOLID fallback opacity for
// when the diagonal-hatch pattern image is unavailable (SSR / no canvas). The
// fallback keeps suppressed divisions visually distinct from genuine no-data so
// the legend's fill / hatch / no-data trichotomy never silently collapses.
const HATCH_FILL_OPACITY = 0.85;
const SUPPRESS_SOLID_OPACITY = 0.5;

// Per-layer maplibre object ids are namespaced by layer id so multiple layers
// coexist without collision.
const srcId = (id: string) => `pano-src-${id}`;
const clusterLayerId = (id: string) => `pano-cluster-${id}`;
const pointLayerId = (id: string) => `pano-point-${id}`;
const choroLayerId = (id: string) => `pano-choro-${id}`;
// U5 province-choropleth: a fill (+ its hover outline) over the SHARED
// ar-provinces basemap source, colored by a per-layer data-join on the polygon
// `code` property. Namespaced by layer id so two province-choropleths coexist.
const provinceFillLayerId = (id: string) => `pano-prov-fill-${id}`;
const provinceLineLayerId = (id: string) => `pano-prov-line-${id}`;
// Always-visible admin divisions for a scoped province. ONE shared source
// (barrios or the active province's departamentos), a single always-on outline
// layer, and a per-choropleth-layer data fill over that shared source (namespaced
// by layer id, like the province choropleth over ar-provinces).
const DIVISION_SRC = "pano-divisions";
const DIVISION_LINE_ID = "pano-div-line";
// cursor #6: feature-state hover glow over the division polygons.
const DIVISION_HOVER_ID = "pano-div-hover";
// cursor #2: hatched k-anon suppression overlay for divisions whose only cells
// are suppressed — a diagonal fill-pattern that is perceptually distinct from
// both the colored data fill and the outline-only no-data cell.
const DIVISION_SUPPRESS_ID = (id: string) => `pano-div-suppress-${id}`;
const divisionFillLayerId = (id: string) => `pano-div-fill-${id}`;
// task #63: the bivariate k-anon hatch overlay over the SHARED ar-provinces
// source (province cells are structurally never suppressed today, but suppression
// PROPAGATES through the bivariate join, so the honest trichotomy is kept intact).
const provinceSuppressLayerId = (id: string) => `pano-prov-suppress-${id}`;

/** Compute a [[minLng,minLat],[maxLng,maxLat]] bbox over many feature sets. */
function layersBbox(layers: ActiveLayer[]): [[number, number], [number, number]] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const layer of layers) {
    for (const f of layer.features.features) {
      if (!f.geometry) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng) || maxLng <= minLng || maxLat <= minLat) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** One feature of a local division GeoJSON, as much of it as the join reads. */
type DivisionRawFeature = {
  geometry?: unknown;
  properties?: { code?: string; name?: string } | null;
};

/** Same-origin fetch of a local GeoJSON asset → its features (null on failure).
 * Routed through the shared session cache so a repeat/concurrent request for the
 * same asset (province drills, re-mounts, the CABA inset) reuses one fetch. */
async function fetchGeojsonFeatures(url: string): Promise<DivisionRawFeature[] | null> {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: runtime JSON from local GeoJSON asset.
    const raw = await fetchGeojsonCached<any>(url);
    return (raw.features ?? []) as DivisionRawFeature[];
  } catch {
    return null; // Divisions unavailable — the provinces basemap still renders.
  }
}

export function SituationalMap({
  layers,
  label,
  height = 560,
  onFeatureClick,
  onProvinceDrill,
  onReturnNational,
  initialBounds,
  selectedProvinceCode = null,
  selectedLocalityCenter = null,
  frame = null,
  onZoom,
  initialCamera = null,
  onCameraChange,
  highlightedUnitKey = null,
  onUnitHover,
  viewMeta,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mlRef = useRef<typeof maplibregl | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // The PINNED popup (fix: popup-as-document). Separate from the hover popupRef so
  // the fast hover preview and the persistent, selectable, multi-layer readout can
  // coexist. Constructed with a close button + closeOnClick:false so it survives a
  // pointer move (the hover popup does not) and is dismissable via ✕ or Esc.
  const pinnedPopupRef = useRef<maplibregl.Popup | null>(null);
  // Latest viewMeta, read inside one-time map handlers to stamp the pinned popup's
  // fecha-de-corte context line without re-wiring handlers on every scrub.
  const viewMetaRef = useRef(viewMeta);
  viewMetaRef.current = viewMeta;
  const loadedRef = useRef(false);
  // Track which layer ids are currently mounted on the map so we can reconcile.
  const mountedRef = useRef<Set<string>>(new Set());
  // panorama-event-points Slice 1: the point render mode a layer is CURRENTLY
  // mounted as. A GeoJSON source's `cluster` option is fixed at creation, so when
  // a point layer flips render mode (e.g. perdidas graduated→points), the source
  // must be torn down and re-added — a plain setData would keep the old geometry
  // treatment. This tracks the mounted mode so syncLayers detects the flip.
  const mountedPointModeRef = useRef<Map<string, PointRenderMode>>(new Map());
  // Keep the latest layers prop accessible inside one-time map handlers.
  const layersRef = useRef<ActiveLayer[]>(layers);
  layersRef.current = layers;
  // Keep the latest click callback accessible inside one-time map handlers.
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  // Click-to-drill: latest handler for the one-time province click wiring, plus a
  // re-entrancy guard so a click that lands on BOTH the province choropleth fill
  // and the base province fill drills exactly once (the console navigation is
  // idempotent, but the guard also spares a double fitBounds).
  const onProvinceDrillRef = useRef(onProvinceDrill);
  onProvinceDrillRef.current = onProvinceDrill;
  const drillingRef = useRef(false);
  // Time-scrub color-scale lock (fixes the flicker bug). While an as-of scrub is
  // active, the choropleth/division/bubble domains are FROZEN at the live-edge
  // value so a datum keeps the same color/size across frames. Refreshed on every
  // live frame; keyed by layer id (province/division) for a single global max
  // (graduated). See resolveScrubDomain (scale-lock.ts).
  const lockedGraduatedMaxRef = useRef<number | null>(null);
  const lockedDivisionDomainRef = useRef<Map<string, DomainBounds>>(new Map());
  const lockedProvinceDomainRef = useRef<Map<string, DomainBounds>>(new Map());
  // panorama-ia-v2 §1.1: keep the latest zoom callback for the one-time map
  // handler that reports the camera zoom to the console (derived level).
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  // "Copiar vista": latest camera-report callback for the one-time moveend
  // handler that mirrors the camera (zoom + center) into the shareable URL.
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  // panorama-ia-v2 §3.3: latest map→row hover callback for the one-time handler.
  const onUnitHoverRef = useRef(onUnitHover);
  onUnitHoverRef.current = onUnitHover;
  // The province code currently highlighted via feature-state (row→map sync),
  // so the sync effect can clear the previous one before setting the next.
  const highlightedCodeRef = useRef<string | null>(null);
  // cursor #6 — the province / division code currently under the pointer (its
  // feature-state `hover` glow is set), so the interaction handlers can clear the
  // previous one before setting the next.
  const hoveredProvinceRef = useRef<string | null>(null);
  const hoveredDivisionRef = useRef<string | null>(null);
  // Division-fill interactions bind to a per-layer-id MapLibre event target that
  // SURVIVES a removeLayer/re-addLayer cycle (map.on handlers are keyed by the
  // layer id string, not the layer instance). syncDivisions tears the fill down
  // and re-adds it on every province-set change, so without this guard each pass
  // stacks another full set of hover/click handlers → duplicate popups + double
  // feature-state writes. We wire ONCE per layer id and never re-bind.
  const divisionWiredRef = useRef<Set<string>>(new Set());
  // Capture initialBounds once at mount — it's a stable server-computed value
  // (jurisdiction bbox) that must not change after the map is constructed.
  const initialBoundsRef = useRef(initialBounds);
  // "Copiar vista": capture the restore camera ONCE at mount (a stable per-load
  // value decoded from the URL). When present the load handler reproduces it
  // verbatim instead of computing a frame.
  const initialCameraRef = useRef(initialCamera);
  // A1 PR-7: the national bbox used as fallback for the autozoom helper.
  // Populated after the initial fitBounds resolves on load. Never mutated.
  const nationalBboxRef = useRef<[[number, number], [number, number]] | null>(null);
  // A1 PR-7: the loaded ar-provinces basemap features, stored after the basemap
  // fetch completes. The autozoom effect reads these to compute the province bbox.
  const basemapFeaturesRef = useRef<
    Array<{
      properties: { code: string; name: string } | null;
      geometry: { type: string; coordinates: unknown } | null;
    }>
  >([]);
  // Always-visible divisions: the ISO province code the divisions belong to, the
  // division level (barrio | department), and the loaded division codes/names.
  // Kept in a ref (read inside one-time map handlers). null = national scope, no
  // divisions loaded (the provinces basemap is the only geometry).
  const selectedProvinceRef = useRef(selectedProvinceCode);
  selectedProvinceRef.current = selectedProvinceCode;
  // The divisions currently mounted. `signature` is the sorted effective-province
  // set key — a stable identity so a moveend that does not change the visible
  // province set skips the rebuild/refetch entirely. `deptCodes`/`barrioCodes`
  // are the two disjoint code spaces present in the shared source (departamentos
  // of the non-CABA provinces in view + CABA barrios), so the per-layer fill can
  // join both levels over the union. null = national clean view, no divisions.
  const divisionsRef = useRef<{
    signature: string;
    deptCodes: Set<string>;
    barrioCodes: Set<string>;
    names: Map<string, string>;
  } | null>(null);
  // task #64: the HTML place-label markers currently on the map (department /
  // barrio names at drill level). maplibregl.Marker anchors HTML to a lng/lat and
  // auto-repositions it on pan/zoom — the glyph-free way to put text on the map
  // (no glyph server; see the file docblock). Cleared + rebuilt with the division
  // set; only ever present in division mode, so the province view stays clean.
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  // Monotonic token so a superseded division resolution (rapid zoom/pan/switch)
  // never paints stale polygons over the newer viewport.
  const divisionTokenRef = useRef(0);
  // Per-province bbox, computed ONCE from the loaded basemap — the zoom-driven
  // viewport→province resolution reads these (point 5: approximate + cheap).
  const provinceBboxesRef = useRef<ProvinceBbox[]>([]);
  // The full division GeoJSON files, cached after their FIRST fetch so the 693 KB
  // departments file (and the barrios file) load at most once per session; every
  // later province-set change filters the cached features client-side (point 3).
  const departmentsRawRef = useRef<DivisionRawFeature[] | null>(null);
  const barriosRawRef = useRef<DivisionRawFeature[] | null>(null);
  // Debounce handle for the moveend-driven division resolution — a rapid zoom/pan
  // gesture coalesces into a single syncDivisions call once the camera settles.
  const divisionMoveTimerRef = useRef<number | null>(null);
  // Per-layer division fill values (division code → summed value), populated in
  // syncLayers so the hover/click popup can look up a division's value without
  // recomputing the whole join per pointer move.
  const divisionValuesRef = useRef<Map<string, Map<string, number>>>(new Map());
  // cursor #2 + #10 — per-layer set of SUPPRESSED division codes (hatched). The
  // hover popup reads it so a protected division reads "dato protegido"
  // (k-anonimato), never "sin datos" (which conflates suppression with no-data).
  const divisionSuppressedRef = useRef<Map<string, Set<string>>>(new Map());
  // Legend descriptor for the active locality choropleth division fill (min/max
  // over the visible divisions). State (not a ref) so the legend overlay repaints
  // when the fill changes; guarded setState avoids a render loop.
  const [divisionLegend, setDivisionLegend] = useState<{
    label: string;
    unitNoun: string;
    min: number;
    max: number;
    // Whether a value ramp is shown (there is at least one visible division).
    hasRamp: boolean;
    // cursor #2 — at least one visible division is k-anon suppressed (hatched),
    // so the legend shows the "Suprimido (k-anon)" hatch swatch.
    suppressed: boolean;
  } | null>(null);
  // #6/#7: the data-driven graduated-symbol scale (bubble legend bins + radius
  // stops), anchored on the observed maximum count across the active graduated
  // layers. State so the legend repaints when the data range changes; the map's
  // circle-radius interpolate is driven from the SAME scale in syncLayers, so a
  // legend bubble always matches its on-map bubble. Guarded setState (like
  // divisionLegend) avoids a render loop.
  const [graduatedScale, setGraduatedScale] = useState<GraduatedScale | null>(null);
  // cursor Part2 — the live camera zoom, tracked in state (not just the ref) so
  // the CABA/AMBA inset panel can show at national scope and hide on drill.
  const [insetZoom, setInsetZoom] = useState(AR_ZOOM);

  // --- One-time map construction (basemap only). ---------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;
      mlRef.current = maplibregl;

      const style: maplibregl.StyleSpecification = {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": COLOR_CANVAS } }],
      };

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: AR_CENTER,
        zoom: AR_ZOOM,
        attributionControl: false,
        dragRotate: false,
        // RESILIENCE (2026-07-10, PO instrumented-review re-confirm): a single
        // wheel tick over the canvas used to zoom the map AND scroll the page at
        // once — the operator lost their place every time they scrolled past the
        // console. cooperativeGestures gates wheel-zoom behind Ctrl/⌘ (and pan
        // behind two fingers on touch), so a plain scroll moves the PAGE, never
        // the map. Help text localized below.
        cooperativeGestures: true,
        // map-QOL zoom bounds: pan/zoom clamped to the national territory —
        // the operator can never get lost in the open ocean or zoom out to
        // a meaningless world view.
        maxBounds: AR_MAX_BOUNDS,
        minZoom: MIN_ZOOM,
        // panorama-ia-v2 §3.6: keep the drawing buffer so getCanvas().toDataURL()
        // returns the rendered map for the PNG export (blank otherwise).
        canvasContextAttributes: { preserveDrawingBuffer: true },
        // es-AR labels for MapLibre's built-in NavigationControl (zoom buttons)
        // — otherwise a govt user sees "Zoom in"/"Zoom out" tooltips in English.
        // "Map.Title" is the aria-label MapLibre stamps on the interactive canvas
        // (default "Map"); override it so a screen-reader user in a Spanish app
        // hears an es-AR name instead of an English one.
        locale: {
          "Map.Title": "Mapa de situación",
          "NavigationControl.ZoomIn": "Acercar",
          "NavigationControl.ZoomOut": "Alejar",
          "NavigationControl.ResetBearing": "Restablecer orientación",
          // cooperativeGestures overlay copy (es-AR) — shown when the operator
          // scrolls over the canvas without the modifier key.
          "CooperativeGesturesHandler.WindowsHelpText": "Usá Ctrl + rueda para hacer zoom",
          "CooperativeGesturesHandler.MacHelpText": "Usá ⌘ + rueda para hacer zoom",
          "CooperativeGesturesHandler.MobileHelpText": "Usá dos dedos para mover el mapa",
        },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // panorama-ia-v2 §1.1: report the camera zoom after every zoom gesture so
      // the console can derive the aggregation level (province → locality once
      // the camera crosses Z_LOCALITY). Fires once per gesture, not per frame.
      map.on("zoomend", () => {
        const z = map.getZoom();
        onZoomRef.current?.(z);
        // cursor #7: warm the department GeoJSON cache BEFORE the camera crosses
        // Z_DIVISIONS so outlines fade in immediately on drill instead of popping
        // after the 693 KB file resolves post-moveend. Same-origin, cached once.
        if (z >= Z_DIVISIONS - 0.5 && departmentsRawRef.current === null) {
          void fetchGeojsonFeatures(AR_DEPARTMENTS_URL).then((raw) => {
            if (raw !== null && departmentsRawRef.current === null) {
              departmentsRawRef.current = raw;
            }
          });
        }
        // cursor Part2: drive the CABA inset visibility (shown at national scope,
        // hidden once the operator drills past the division threshold).
        setInsetZoom(z);
      });
      // PO directive 2026-07-07: divisions are ALSO zoom-driven. After the camera
      // settles (moveend covers both zoom and pan), re-resolve which province(s)
      // are in view and (de)activate their admin divisions. Debounced so a rapid
      // gesture coalesces into ONE resolution (→ at most one file fetch); the
      // signature dedupe inside syncDivisions then skips no-op rebuilds.
      map.on("moveend", () => {
        // W1/W3 fix: report the REAL camera zoom after EVERY camera settle,
        // including PROGRAMMATIC moves — the initial fitBounds, the jurisdiction
        // viewport flyTo/fitBounds, and preset framing. `zoomend` alone fires only
        // on a user gesture (and not at all when a programmatic move lands on the
        // same zoom), so the console otherwise derived its aggregation level from
        // the stale `mapZoom` placeholder until the first manual gesture — spuriously
        // downgrading a shared/saved locality board to province. moveend catches all
        // of them (fitBounds/flyTo settle with moveend); setMapZoom no-ops when the
        // value is unchanged, so a pure pan costs nothing.
        onZoomRef.current?.(map.getZoom());
        // "Copiar vista": mirror the settled camera (zoom + center) into the URL
        // so a shared link reproduces the exact frame. moveend coalesces a rapid
        // gesture, so this fires once per settle (not per frame).
        const center = map.getCenter();
        onCameraChangeRef.current?.({ zoom: map.getZoom(), lng: center.lng, lat: center.lat });
        if (divisionMoveTimerRef.current !== null) {
          window.clearTimeout(divisionMoveTimerRef.current);
        }
        divisionMoveTimerRef.current = window.setTimeout(() => {
          divisionMoveTimerRef.current = null;
          void syncDivisions();
        }, 200);
      });
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "panorama-popup",
      });
      // The pinned popup: a persistent, selectable document (close button, never
      // auto-removed on pointer move or map click). One instance reused across
      // clicks; each open replaces its content + anchor.
      pinnedPopupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: "panorama-popup panorama-popup-pinned",
        maxWidth: "280px",
        focusAfterOpen: false,
      });

      map.on("load", async () => {
        if (cancelled) return;
        // cursor #2: register the diagonal-hatch tile ONCE as a map image so the
        // k-anon suppression overlay can reference it via `fill-pattern`.
        try {
          if (!map.hasImage(HATCH_IMAGE_ID)) {
            const hatch = buildHatchImageData();
            if (hatch) map.addImage(HATCH_IMAGE_ID, hatch, { pixelRatio: 2 });
          }
        } catch {
          // No canvas / addImage unavailable — suppressed cells stay outline-only.
        }
        // Regional context: neighbouring countries as a muted, non-interactive
        // backdrop. Added FIRST so it renders BELOW the Argentine provinces
        // (MapLibre draws layers in insertion order). No feature-state / hover
        // / clicks — purely a spatial-reference basemap.
        try {
          // biome-ignore lint/suspicious/noExplicitAny: runtime JSON from local GeoJSON asset.
          const context = await fetchGeojsonCached<any>(CONTEXT_URL);
          if (cancelled) return;
          map.addSource("sudamerica-context", { type: "geojson", data: context });
          map.addLayer({
            id: "context-fill",
            type: "fill",
            source: "sudamerica-context",
            paint: { "fill-color": COLOR_CONTEXT_LAND, "fill-opacity": 1 },
          });
          map.addLayer({
            id: "context-line",
            type: "line",
            source: "sudamerica-context",
            paint: { "line-color": COLOR_CONTEXT_BORDER, "line-width": 0.6 },
          });
        } catch {
          // Context basemap unavailable — Argentina still renders on the canvas.
        }
        if (cancelled) return;
        // Local basemap: Argentine province polygons (no external tiles).
        try {
          // biome-ignore lint/suspicious/noExplicitAny: runtime JSON from local GeoJSON asset.
          const basemap = await fetchGeojsonCached<any>(BASEMAP_URL);
          if (cancelled) return;
          // promoteId: "code" so feature-state can key on the province code
          // (panorama-ia-v2 §3.3 row→map highlight).
          map.addSource("ar-provinces", { type: "geojson", data: basemap, promoteId: "code" });
          map.addLayer({
            id: "ar-prov-fill",
            type: "fill",
            source: "ar-provinces",
            paint: { "fill-color": COLOR_LAND, "fill-opacity": 1 },
          });
          map.addLayer({
            id: "ar-prov-line",
            type: "line",
            source: "ar-provinces",
            paint: {
              "line-color": COLOR_ADMIN_STROKE,
              "line-width": PROV_LINE_WIDTH,
              "line-opacity": PROV_LINE_OPACITY,
            },
          });
          // panorama-ia-v2 §3.3: highlight outline driven by feature-state — a
          // ranked-row hover thickens the matching province's border (row→map).
          map.addLayer({
            id: "ar-prov-highlight",
            type: "line",
            source: "ar-provinces",
            paint: {
              "line-color": "#f8fafc",
              // cursor #6: the outline responds to BOTH the ranked-row highlight
              // (row→map, feature-state `highlighted`) AND a direct pointer hover
              // (feature-state `hover`) — a slightly thinner glow for hover so the
              // polygon itself reacts, glyph-free.
              "line-width": [
                "case",
                ["boolean", ["feature-state", "highlighted"], false],
                2.5,
                ["boolean", ["feature-state", "hover"], false],
                1.75,
                0,
              ],
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "highlighted"], false],
                1,
                ["boolean", ["feature-state", "hover"], false],
                0.85,
                0,
              ],
            },
          });
          // A1 PR-7: cache province features for the autozoom helper.
          // Safe: the local GeoJSON asset is authored by us and has this shape.
          basemapFeaturesRef.current =
            (basemap.features as Array<{
              properties: { code: string; name: string } | null;
              geometry: { type: string; coordinates: unknown } | null;
            }>) ?? [];
          // Precompute each province's bbox ONCE for the zoom-driven division
          // resolution (viewport → intersecting provinces).
          provinceBboxesRef.current = computeProvinceBboxes(basemapFeaturesRef.current);
          // Click-to-drill (task #55): the BASE province fill drills when national
          // AND no province choropleth is on top (a choropleth fill covers every
          // province and owns the click via its own handler; the guard avoids a
          // double drill). Wired once — the base layer is never torn down.
          map.on("click", "ar-prov-fill", (e) => {
            if (selectedProvinceRef.current != null) return; // already scoped
            if (!onProvinceDrillRef.current) return; // no drill target
            const hasProvChoropleth = layersRef.current.some(
              (l) => l.geomType === "choropleth" && l.level === "province",
            );
            if (hasProvChoropleth) return; // the choropleth handler owns the click
            const f = e.features?.[0];
            if (!f) return;
            const code = (f.properties as { code?: string }).code ?? "";
            drillToProvince(map, code);
          });
          // Pointer affordance on the drillable base fill (national scope only).
          map.on("mouseenter", "ar-prov-fill", () => {
            if (selectedProvinceRef.current == null && onProvinceDrillRef.current) {
              map.getCanvas().style.cursor = "pointer";
            }
          });
          map.on("mouseleave", "ar-prov-fill", () => {
            map.getCanvas().style.cursor = "";
          });
        } catch {
          // Basemap unavailable — points still render over the dark canvas.
        }
        if (cancelled) return;
        loadedRef.current = true;
        syncLayers();
        // If a province scope is already active at mount, load its divisions.
        void syncDivisions();
        // Prefer the server-computed jurisdiction bbox (govt) over the
        // data-extent bbox (admin/national). Falls back to the data-extent
        // when no initialBounds was supplied (admin = national view).
        const bbox = initialBoundsRef.current ?? layersBbox(layersRef.current);
        if (bbox) {
          // A1 PR-7: store as the national fallback for subsequent autozoom.
          nationalBboxRef.current = bbox;
        }
        // "Copiar vista": a shared URL that pinned an exact camera wins over the
        // computed frame — reproduce it verbatim with ONE jumpTo so the reloaded
        // view matches the sender's. Otherwise fall through to the computed frame.
        // (The A1 autozoom effect early-returns at mount — it only handles later
        // jurisdiction picks — so it never clobbers this restored camera.)
        const restoredCamera = initialCameraRef.current;
        if (restoredCamera) {
          map.jumpTo({
            center: [restoredCamera.lng, restoredCamera.lat],
            zoom: restoredCamera.zoom,
          });
        } else {
          // Click-to-drill (task #55): when the operator drilled into a province
          // (explicit `?province`, no server jurisdiction bbox), FRAME that province
          // polygon on load — the drill committed via navigation, so the reloaded
          // map must land fitted to the province, not the national data extent.
          let frameBbox = bbox;
          if (
            !initialBoundsRef.current &&
            selectedProvinceRef.current &&
            basemapFeaturesRef.current.length > 0
          ) {
            const vp = computeJurisdictionViewport(
              selectedProvinceRef.current,
              null,
              basemapFeaturesRef.current,
              bbox ?? AR_BBOX,
            );
            if (vp.kind === "fitBounds") frameBbox = vp.bbox;
          }
          if (frameBbox) {
            map.fitBounds(frameBbox, {
              padding: FRAME_PADDING,
              animate: false,
              // Magnetic snap: a first fit that would land right on the flip is
              // clamped just below it so the derived level starts unambiguous.
              maxZoom: framingMaxZoom(map, frameBbox),
            });
          }
        }
        // cursor #9: sync insetZoom to the map's ACTUAL zoom after the initial
        // fitBounds. insetZoom otherwise only updates on zoomend, so a govt
        // jurisdiction that fits past Z_DIVISIONS would still show the CABA inset
        // (initial visibility computed from the stale AR_ZOOM default) until the
        // first user zoom gesture.
        setInsetZoom(map.getZoom());
      });
    });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mountedRef.current = new Set();
      if (divisionMoveTimerRef.current !== null) {
        window.clearTimeout(divisionMoveTimerRef.current);
        divisionMoveTimerRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Build the map ONCE; layer reconciliation happens in the effect below.
  }, []);

  // --- Reconcile layers whenever the prop changes. -------------------------
  // `layers` IS the trigger; syncLayers reads the latest via layersRef, so the
  // ref-read deps are intentionally omitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layers is the intended trigger.
  useEffect(() => {
    if (loadedRef.current) syncLayers();
  }, [layers]);

  // --- A1 PR-7: autozoom on jurisdiction select. ---------------------------
  // Fires when the operator picks a province or locality in the
  // JurisdictionSwitcher. The pure helper (situational-map-utils) resolves the
  // correct viewport descriptor; this effect applies it to the MapLibre instance.
  //
  // Guard conditions:
  //  - Skip until the map is loaded (the load event sets loadedRef).
  //  - Skip when the national bbox has not yet been captured (first-load init
  //    hasn't run — e.g. basemap fetch is still in-flight).
  //  - Cancel the fit when the effect re-runs or on unmount (stale guard via
  //    `cancelled` flag; MapLibre's flyTo/fitBounds is not directly cancelable
  //    but the map is removed on unmount so the call is a no-op).
  useEffect(() => {
    if (!loadedRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    const nationalBbox = nationalBboxRef.current;
    if (!nationalBbox) return; // initial bounds not yet captured

    let cancelled = false;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const viewport = computeJurisdictionViewport(
      selectedProvinceCode,
      selectedLocalityCenter,
      basemapFeaturesRef.current,
      nationalBbox,
    );

    if (cancelled) return;

    if (viewport.kind === "fitBounds") {
      map.fitBounds(viewport.bbox, {
        padding: FRAME_PADDING,
        animate: !prefersReducedMotion,
        // Magnetic snap: a jurisdiction fit that would land on the flip clamps
        // just below it (camera-only; a province scope still forces locality).
        maxZoom: framingMaxZoom(map, viewport.bbox),
      });
    } else {
      map.flyTo({ center: viewport.center, zoom: viewport.zoom, animate: !prefersReducedMotion });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedProvinceCode, selectedLocalityCenter]);

  // --- panorama-redesign Fase 1: preset frame (camera-only). ----------------
  // Mirrors the A1 PR-7 autozoom effect above: when the operator activates a
  // preset carrying a `framing` field, fit the camera to the resolved bbox.
  // The `token` in the frame object makes re-clicking the same preset re-frame
  // (new object identity re-fires the effect). Data scope is NEVER touched —
  // a national frame over a scoped operator shows their data on a wider
  // canvas. The camera stays clamped by AR_MAX_BOUNDS (map maxBounds).
  useEffect(() => {
    if (frame == null) return;
    if (!loadedRef.current) return;
    const map = mapRef.current;
    if (!map) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const viewport = computePresetFrameViewport(frame.framing, nationalBboxRef.current, AR_BBOX);
    if (viewport === null || viewport.kind !== "fitBounds") return;

    map.fitBounds(viewport.bbox, {
      padding: FRAME_PADDING,
      animate: !prefersReducedMotion,
      // Magnetic snap: a preset frame that would land on the flip clamps just
      // below it so an automated frame never leaves the level teetering.
      maxZoom: framingMaxZoom(map, viewport.bbox),
    });
  }, [frame]);

  // panorama-ia-v2 §3.3: row→map highlight. Mirror the RankedUnitsPanel's
  // highlighted unit onto the province polygon via feature-state (the
  // ar-prov-highlight line reads it). Clears the previous highlight first.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!map.getSource("ar-provinces")) return;
    const prev = highlightedCodeRef.current;
    if (prev !== null && prev !== highlightedUnitKey) {
      map.setFeatureState({ source: "ar-provinces", id: prev }, { highlighted: false });
    }
    if (highlightedUnitKey !== null) {
      map.setFeatureState(
        { source: "ar-provinces", id: highlightedUnitKey },
        { highlighted: true },
      );
    }
    highlightedCodeRef.current = highlightedUnitKey;
  }, [highlightedUnitKey]);

  // Always-visible admin divisions: (re)load whenever the province scope changes.
  // National scope (null) removes them; a single province loads its barrios (CABA)
  // or departamentos (elsewhere). biome-ignore: syncDivisions reads live refs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedProvinceCode is the intended trigger.
  useEffect(() => {
    if (loadedRef.current) void syncDivisions();
  }, [selectedProvinceCode]);

  // Fetch (or drop) the division polygons for the active province scope, then add
  // the always-on outline and re-run the layer sync so any active locality
  // choropleth fills the divisions. National scope removes the division source.
  async function syncDivisions() {
    const map = mapRef.current;
    if (!map || !mlRef.current || !loadedRef.current) return;

    // Resolve the EFFECTIVE province set. An explicit selection/scope wins at any
    // zoom (existing behavior); otherwise the camera decides — past the threshold
    // every province whose bbox intersects the viewport gets its divisions (PO
    // directive: "a partir de cierto punto SIEMPRE mostrar las localidades").
    const b = map.getBounds();
    const cameraBbox: Bbox = [
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ];
    const provinces = resolveDivisionProvinces({
      selectedProvince: selectedProvinceRef.current ?? null,
      zoom: map.getZoom(),
      cameraBbox,
      provinceBboxes: provinceBboxesRef.current,
    });

    // Empty set (national below the threshold, no selection) → clean provinces
    // view: tear divisions down, restore any centroid circles.
    if (provinces.length === 0) {
      if (divisionsRef.current) {
        removeDivisions(map);
        divisionsRef.current = null;
        syncLayers();
      }
      return;
    }

    // The visible province set is unchanged — nothing to rebuild or refetch. This
    // is what makes rapid zoom/pan cheap: only a set change touches the map.
    const signature = [...provinces].sort().join(",");
    if (divisionsRef.current && divisionsRef.current.signature === signature) return;

    // Split CABA (→ barrios file) from the rest (→ departamentos, one shared file
    // filtered to the UNION of the visible provinces' INDEC prefixes).
    const deptPrefixes: string[] = [];
    let needsBarrios = false;
    for (const iso of provinces) {
      if (isCABA(iso)) {
        needsBarrios = true;
      } else {
        const p = provinceDepartmentPrefix(iso);
        if (p) deptPrefixes.push(p);
      }
    }

    const token = ++divisionTokenRef.current;

    // Ensure each raw file is fetched AT MOST ONCE per session (perf point 3);
    // every later set change filters the cached features client-side.
    if (deptPrefixes.length > 0 && departmentsRawRef.current === null) {
      const raw = await fetchGeojsonFeatures(AR_DEPARTMENTS_URL);
      if (token !== divisionTokenRef.current || !mapRef.current) return;
      if (raw === null) return;
      departmentsRawRef.current = raw;
    }
    if (needsBarrios && barriosRawRef.current === null) {
      const raw = await fetchGeojsonFeatures(CABA_BARRIOS_URL);
      if (token !== divisionTokenRef.current || !mapRef.current) return;
      if (raw === null) return;
      barriosRawRef.current = raw;
    }
    // A newer resolution superseded this one while a fetch was in flight.
    if (token !== divisionTokenRef.current || !mapRef.current) return;

    // Build the UNION of division polygons for the effective set: departamentos
    // (filtered by prefix) + CABA barrios, keeping their two code spaces disjoint
    // so the per-layer fill can join both levels over the shared source.
    const features: DivisionRawFeature[] = [];
    const deptCodes = new Set<string>();
    const barrioCodes = new Set<string>();
    const names = new Map<string, string>();

    if (deptPrefixes.length > 0 && departmentsRawRef.current) {
      for (const f of departmentsRawRef.current) {
        const rawCode = f.properties?.code;
        if (typeof rawCode !== "string") continue;
        const code = normalizeDepartmentCode(rawCode);
        if (!deptPrefixes.some((p) => code.startsWith(p))) continue;
        features.push(f);
        deptCodes.add(code);
        if (f.properties?.name) names.set(code, String(f.properties.name));
      }
    }
    if (needsBarrios && barriosRawRef.current) {
      for (const f of barriosRawRef.current) {
        const rawCode = f.properties?.code;
        if (typeof rawCode !== "string") continue;
        const code = normalizeBarioCode(rawCode);
        features.push(f);
        barrioCodes.add(code);
        if (f.properties?.name) names.set(code, String(f.properties.name));
      }
    }

    // Nothing renderable (e.g. only unknown provinces) → keep the clean view.
    if (deptCodes.size === 0 && barrioCodes.size === 0) {
      if (divisionsRef.current) {
        removeDivisions(map);
        divisionsRef.current = null;
        syncLayers();
      }
      return;
    }

    // Replace any previous divisions, then add the shared source + always-on
    // outline. The outline renders EVEN WHERE THERE IS NO DATA (PO directive).
    removeDivisions(map);
    map.addSource(DIVISION_SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection,
      promoteId: "code",
    });
    map.addLayer({
      id: DIVISION_LINE_ID,
      type: "line",
      source: DIVISION_SRC,
      paint: {
        "line-color": COLOR_DIVISION_LINE,
        "line-width": 0.65,
        // cursor #7: start transparent and fade IN so the outlines don't hard-pop
        // after the camera settles. The transition is applied before the value.
        "line-opacity": 0,
        "line-opacity-transition": { duration: DIVISION_FADE_MS, delay: 0 },
      },
    });
    // cursor #6: a feature-state hover glow on the division polygons — the polygon
    // itself responds to the pointer (glyph-free), mirroring the province path.
    map.addLayer({
      id: DIVISION_HOVER_ID,
      type: "line",
      source: DIVISION_SRC,
      paint: {
        "line-color": "#e2e8f0",
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.75, 0],
        "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
      },
    });
    divisionsRef.current = { signature, deptCodes, barrioCodes, names };
    // task #64: render the drill-level place labels for this division set.
    if (mlRef.current) renderDivisionLabels(map, mlRef.current, features);
    // Kick the fade-in on the next frame so MapLibre registers the 0→target step.
    const fadeMap = map;
    window.requestAnimationFrame(() => {
      if (fadeMap.getLayer(DIVISION_LINE_ID)) {
        fadeMap.setPaintProperty(DIVISION_LINE_ID, "line-opacity", DIVISION_LINE_OPACITY);
      }
    });
    syncLayers();
    updateChromeHierarchy(map);
  }

  // Add/update/remove maplibre sources+layers to match `layersRef.current`.
  function syncLayers() {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    const active = layersRef.current;
    const activeIds = new Set(active.map((l) => l.id));
    // Time-scrub color-scale lock: true when an as-of scrub is active (viewMeta
    // carries the current asOf). Every scale below freezes its domain at the
    // live-edge value while this holds so color/size meaning is stable per frame.
    const scrubbing = viewMetaRef.current?.asOf != null;

    // Remove layers no longer active.
    for (const id of mountedRef.current) {
      if (!activeIds.has(id)) {
        removeLayer(map, id);
        mountedRef.current.delete(id);
        mountedPointModeRef.current.delete(id);
      }
    }

    // #6/#7: derive the graduated-symbol scale ONCE per sync from the observed
    // maximum count across every active graduated layer, so all bubbles (and the
    // single shared legend) size on the same data-driven, area-proportional axis.
    const graduatedCollections = active
      .filter((l) => l.renderMode === "graduated")
      .map((l) => ({
        features: l.features.features as ReadonlyArray<{
          properties?: { count?: number | null } | null;
        }>,
      }));
    // Lock the graduated bubble scale's max across a scrub so a unit's circle
    // keeps the same radius frame-to-frame (r ∝ √count on a FIXED max).
    const liveGraduatedMax = graduatedMaxCount(graduatedCollections);
    const gradLock = resolveScrubDomain({
      live: liveGraduatedMax,
      scrubbing,
      locked: lockedGraduatedMaxRef.current,
    });
    lockedGraduatedMaxRef.current = gradLock.locked;
    const gradScale = buildGraduatedScale(gradLock.domain);

    // The division-fill legend descriptor for the active locality choropleth (at
    // most one base layer is active at a time). Collected during the loop and
    // committed once, so the legend overlay repaints with the current fill range.
    let nextDivisionLegend: {
      label: string;
      unitNoun: string;
      min: number;
      max: number;
      hasRamp: boolean;
      suppressed: boolean;
    } | null = null;

    // Add or update active layers.
    for (const layer of active) {
      const data = layer.features as unknown as GeoJSON.FeatureCollection;
      // U5: a province-level choropleth fills the SHARED basemap polygons — it
      // has no own GeoJSON source, so it can't be reconciled via getSource. We
      // recompute its data-driven color expression in place on every sync.
      if (layer.geomType === "choropleth" && layer.level === "province") {
        // Sequential province layers lock their color domain across a scrub. Rate
        // layers already render on the FIXED [0,100] domain (comparability), so
        // they are stable frame-to-frame and need no lock.
        const isSequential = !(
          layer.dataType === "rate" && typeof layer.complianceTarget === "number"
        );
        let seqDomain: DomainBounds | null = null;
        if (isSequential) {
          const lock = resolveScrubDomain({
            live: provinceValueBounds(layer.features),
            scrubbing,
            locked: lockedProvinceDomainRef.current.get(layer.id) ?? null,
          });
          if (lock.locked) lockedProvinceDomainRef.current.set(layer.id, lock.locked);
          else lockedProvinceDomainRef.current.delete(layer.id);
          seqDomain = lock.domain;
        }
        if (mountedRef.current.has(layer.id)) {
          updateProvinceChoroplethLayer(map, layer, seqDomain);
        } else {
          addProvinceChoroplethLayer(map, layer, seqDomain);
          mountedRef.current.add(layer.id);
        }
        // task #63: keep the bivariate suppression hatch in sync (no-op otherwise).
        applyProvinceBivariateSuppression(map, layer);
        applyDim(map, layer);
        continue;
      }

      // Locality choropleth with a scoped province whose divisions are loaded:
      // fill the barrio/departamento polygons and keep ONLY the unmatched cells
      // as centroid circles (fallback — no data loss). Suppressed matched cells
      // render outline-only (excluded from both the fill and the circles).
      const divs = divisionsRef.current;
      // Divisions may now be active WITHOUT a selection (zoom-driven), so the
      // guard no longer requires a matching selected province — the join itself
      // fills only cells whose codes are in the loaded division sets; the rest
      // fall back to centroid circles.
      const divisionActive =
        layer.geomType === "choropleth" && layer.level === "locality" && divs !== null;
      if (divisionActive && divs) {
        // Join over BOTH code spaces present in the shared source (departamentos
        // and/or CABA barrios) — the multi-province zoom-driven case.
        const levels: Array<{ level: DivisionLevel; codes: Set<string> }> = [];
        if (divs.deptCodes.size > 0) levels.push({ level: "department", codes: divs.deptCodes });
        if (divs.barrioCodes.size > 0) levels.push({ level: "barrio", codes: divs.barrioCodes });
        const join = joinCellsToDivisionsMulti(layer.features, levels);
        divisionValuesRef.current.set(layer.id, join.values);
        divisionSuppressedRef.current.set(layer.id, join.suppressed);
        const circleData = join.unmatched as unknown as GeoJSON.FeatureCollection;
        const existing = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
        if (existing) existing.setData(circleData);
        else addChoroplethLayer(map, layer, circleData);
        // Lock the division-fill color domain across a scrub so a division keeps
        // the same color across as-of frames (the legend ramp uses the SAME
        // locked bounds, so swatch and map agree).
        const divLock = resolveScrubDomain({
          live: divisionValueBounds(join.values),
          scrubbing,
          locked: lockedDivisionDomainRef.current.get(layer.id) ?? null,
        });
        if (divLock.locked) lockedDivisionDomainRef.current.set(layer.id, divLock.locked);
        else lockedDivisionDomainRef.current.delete(layer.id);
        if (map.getLayer(divisionFillLayerId(layer.id))) {
          updateDivisionFillLayer(map, layer, join.values, divLock.domain);
        } else {
          addDivisionFillLayer(map, layer, join.values, divLock.domain);
        }
        // cursor #2: hatch the divisions whose only cells are k-anon suppressed —
        // honest trichotomy (colored value / outline-only no-data / hatched
        // suppressed). Presentation only; the join already dropped the numbers.
        addDivisionSuppressionLayer(map, layer, join.suppressed);
        mountedRef.current.add(layer.id);
        applyDim(map, layer);
        const bounds = divLock.domain;
        const hasSuppressed = join.suppressed.size > 0;
        if (bounds || hasSuppressed) {
          nextDivisionLegend = {
            label: layer.label,
            // Name the unit by which code space(s) are in view: a mixed
            // departamentos+barrios union reads as the generic "división".
            unitNoun:
              divs.deptCodes.size > 0 && divs.barrioCodes.size > 0
                ? "división"
                : divs.barrioCodes.size > 0
                  ? "barrio"
                  : "departamento",
            min: bounds?.min ?? 0,
            max: bounds?.max ?? 0,
            hasRamp: bounds !== null,
            suppressed: hasSuppressed,
          };
        }
        continue;
      }
      // Not in division-fill mode: drop any stale division fill + suppression
      // hatch for this layer so the centroid circles become the sole rep again.
      if (map.getLayer(DIVISION_SUPPRESS_ID(layer.id))) {
        map.removeLayer(DIVISION_SUPPRESS_ID(layer.id));
      }
      if (map.getLayer(divisionFillLayerId(layer.id))) {
        map.removeLayer(divisionFillLayerId(layer.id));
        divisionValuesRef.current.delete(layer.id);
        divisionSuppressedRef.current.delete(layer.id);
      }

      const existing = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
      // panorama-event-points Slice 1: a point layer that flipped render mode
      // (e.g. perdidas graduated→points) cannot be reconciled via setData — the
      // source's clustering is fixed at creation. Tear it down and re-add.
      const pointModeFlipped =
        layer.geomType === "point" &&
        existing !== undefined &&
        mountedPointModeRef.current.get(layer.id) !== layer.renderMode;
      if (existing && !pointModeFlipped) {
        existing.setData(data);
        // #6/#7: the source's data changed but its paint did not — re-apply the
        // freshly derived area-proportional radius stops so the bubbles track the
        // new observed maximum instead of a stale add-time scale.
        if (layer.renderMode === "graduated" && map.getLayer(pointLayerId(layer.id))) {
          map.setPaintProperty(
            pointLayerId(layer.id),
            "circle-radius",
            graduatedRadiusExpr(gradScale.radiusStops),
          );
        }
      } else {
        if (pointModeFlipped) {
          removeLayer(map, layer.id);
          mountedRef.current.delete(layer.id);
          mountedPointModeRef.current.delete(layer.id);
        }
        if (layer.geomType === "choropleth") {
          addChoroplethLayer(map, layer, data);
        } else if (layer.renderMode === "graduated") {
          // F1: density+signal layers render as per-unit graduated circles (no clustering).
          addGraduatedPointLayer(map, layer, data, gradScale.radiusStops);
          mountedPointModeRef.current.set(layer.id, "graduated");
        } else {
          // Reference layers (refugios, decomisos) AND perdidas real-dots (points):
          // discrete pins with native MapLibre clustering (design D3).
          addReferencePointLayer(map, layer, data);
          mountedPointModeRef.current.set(layer.id, layer.renderMode ?? "reference");
        }
        mountedRef.current.add(layer.id);
      }
      // F4: reconcile the dimmed state on every sync (covers toggling dim on a
      // layer that is already mounted). Dimmed layers are muted, not hidden, so
      // the operator still sees the current-state context — never AS-OF-t data.
      applyDim(map, layer);
    }

    // Commit the division-fill legend, but only when it actually changed —
    // syncLayers runs inside effects, so an unconditional setState would loop.
    setDivisionLegend((prev) => {
      const same =
        (prev === null && nextDivisionLegend === null) ||
        (prev !== null &&
          nextDivisionLegend !== null &&
          prev.label === nextDivisionLegend.label &&
          prev.unitNoun === nextDivisionLegend.unitNoun &&
          prev.min === nextDivisionLegend.min &&
          prev.max === nextDivisionLegend.max &&
          prev.hasRamp === nextDivisionLegend.hasRamp &&
          prev.suppressed === nextDivisionLegend.suppressed);
      return same ? prev : nextDivisionLegend;
    });

    // #6/#7: commit the graduated-symbol scale for the legend, guarded (same
    // reason as divisionLegend) — a stable maxValue must not re-trigger a render.
    setGraduatedScale((prev) => (prev?.maxValue === gradScale.maxValue ? prev : gradScale));

    // cursors #4 + #5: reconcile basemap luminance + border hierarchy after every
    // layer change (a province choropleth toggling on/off flips the basemap dim).
    updateChromeHierarchy(map);
  }

  // --- Always-visible divisions: fill + outline lifecycle. -------------------

  // task #64: drill-level place labels (department / barrio names). HTML markers
  // (glyph-free — the map has no glyph server), muted slate with a dark halo so
  // they read over the navy land without shouting; non-interactive so they never
  // block the polygon hover/click. Only ever created in division mode, so the
  // province view stays label-free (province shapes are recognizable on their own).
  function clearDivisionLabels() {
    for (const m of labelMarkersRef.current) m.remove();
    labelMarkersRef.current = [];
  }

  function renderDivisionLabels(
    map: maplibregl.Map,
    ml: typeof maplibregl,
    features: readonly DivisionRawFeature[],
  ) {
    clearDivisionLabels();
    for (const a of divisionLabelAnchors(features)) {
      const el = document.createElement("div");
      el.textContent = a.name;
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "pointer-events:none;user-select:none;white-space:nowrap;font:600 11px/1 system-ui,sans-serif;color:#cbd5e1;text-shadow:0 0 2px #0b1020,0 0 2px #0b1020,0 0 3px #0b1020;";
      const marker = new ml.Marker({ element: el, anchor: "center" })
        .setLngLat([a.lng, a.lat])
        .addTo(map);
      labelMarkersRef.current.push(marker);
    }
  }

  /** Remove the shared division source, its outline, hover glow, and every
   * per-layer fill + suppression-hatch overlay. */
  function removeDivisions(map: maplibregl.Map) {
    clearDivisionLabels();
    for (const id of mountedRef.current) {
      const fid = divisionFillLayerId(id);
      if (map.getLayer(fid)) map.removeLayer(fid);
      const sid = DIVISION_SUPPRESS_ID(id);
      if (map.getLayer(sid)) map.removeLayer(sid);
    }
    divisionValuesRef.current.clear();
    divisionSuppressedRef.current.clear();
    // cursor #6: clear any lingering hover glow BEFORE the source is torn down.
    // Otherwise hoveredDivisionRef keeps pointing at a code whose feature-state
    // can no longer be reset (mouseleave no-ops once the source is gone), so the
    // glow reappears stale on the next division set until leave/re-enter.
    const prevHover = hoveredDivisionRef.current;
    if (prevHover !== null && map.getSource(DIVISION_SRC)) {
      map.setFeatureState({ source: DIVISION_SRC, id: prevHover }, { hover: false });
    }
    hoveredDivisionRef.current = null;
    if (map.getLayer(DIVISION_HOVER_ID)) map.removeLayer(DIVISION_HOVER_ID);
    if (map.getLayer(DIVISION_LINE_ID)) map.removeLayer(DIVISION_LINE_ID);
    if (map.getSource(DIVISION_SRC)) map.removeSource(DIVISION_SRC);
  }

  // map-polish cursors #4 + #5 — data/basemap luminance + border hierarchy.
  // Dims the basemap land under active data fills and fades province admin lines
  // when divisions (departamento/barrio) are active so they read as subordinate.
  function updateChromeHierarchy(map: maplibregl.Map) {
    const active = layersRef.current;
    const provinceDataActive = active.some(
      (l) => l.geomType === "choropleth" && l.level === "province",
    );
    // Locality choropleths are the only layers that FILL the divisions with data.
    const localityDataActive = active.some(
      (l) => l.geomType === "choropleth" && l.level === "locality",
    );
    const divisionsActive = divisionsRef.current !== null;
    // Judgment #4: dim the basemap only under an active DATA fill (province OR
    // locality choropleth), NOT merely because division OUTLINES are loaded. The
    // outlines can be on with no data layer active (zoom-driven prefetch), and
    // dimming the land then just washes out the basemap past Z_DIVISIONS with
    // nothing to justify it.
    const dataActive = provinceDataActive || localityDataActive;
    if (map.getLayer("ar-prov-fill")) {
      map.setPaintProperty(
        "ar-prov-fill",
        "fill-opacity",
        dataActive ? BASEMAP_FILL_ACTIVE : BASEMAP_FILL_IDLE,
      );
    }
    const provLineOpacity = divisionsActive ? PROV_LINE_OPACITY_FADED : PROV_LINE_OPACITY;
    if (map.getLayer("ar-prov-line")) {
      map.setPaintProperty("ar-prov-line", "line-opacity", provLineOpacity);
    }
    for (const id of mountedRef.current) {
      const lid = provinceLineLayerId(id);
      if (map.getLayer(lid)) map.setPaintProperty(lid, "line-opacity", provLineOpacity);
    }
  }

  // Fill the division polygons by value (data-join on the polygon `code`),
  // inserted BELOW the always-on outline so the barrio/departamento lines stay
  // crisp on top. Divisions with no visible data are transparent (outline only).
  function addDivisionFillLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    values: Map<string, number>,
    // Fix: time-scrub color-scale lock — the frozen live-edge domain (or null at
    // the live edge, where the expr computes the domain from `values`).
    domain?: DomainBounds | null,
  ) {
    if (!map.getSource(DIVISION_SRC)) return;
    const fillId = divisionFillLayerId(layer.id);
    if (!map.getLayer(fillId)) {
      map.addLayer(
        {
          id: fillId,
          type: "fill",
          source: DIVISION_SRC,
          paint: {
            "fill-color": divisionFillColorExpr(values, domain),
            "fill-opacity": DATA_FILL_OPACITY,
          },
        },
        map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined,
      );
    } else {
      map.setPaintProperty(fillId, "fill-color", divisionFillColorExpr(values, domain));
    }
    wireDivisionInteractions(map, layer);
  }

  function updateDivisionFillLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    values: Map<string, number>,
    domain?: DomainBounds | null,
  ) {
    const fillId = divisionFillLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, "fill-color", divisionFillColorExpr(values, domain));
    } else {
      addDivisionFillLayer(map, layer, values, domain);
    }
  }

  // cursor #2 — the diagonal-hatch overlay for k-anon-suppressed divisions. A
  // fill-pattern layer over the shared division source, filtered to the
  // suppressed code set, inserted BELOW the outline so the barrio/departamento
  // lines stay crisp on top. An empty set yields a constant-false filter (the
  // layer renders nothing). Honest: this only PRESENTS the suppression the join
  // already computed — it never surfaces a suppressed count.
  function addDivisionSuppressionLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    codes: ReadonlySet<string>,
  ) {
    if (!map.getSource(DIVISION_SRC)) return;
    const sid = DIVISION_SUPPRESS_ID(layer.id);
    // Fail-honest: if the diagonal-hatch pattern image is unavailable (SSR / no
    // canvas), fall back to a SOLID suppressed-tone fill rather than skipping the
    // overlay. A skipped overlay leaves suppressed divisions outline-only — which
    // is indistinguishable from genuine no-data and would break the legend's
    // trichotomy. Presentation only; the join already dropped the counts.
    const hasPattern = map.hasImage(HATCH_IMAGE_ID);
    const paint: maplibregl.FillLayerSpecification["paint"] = hasPattern
      ? { "fill-pattern": HATCH_IMAGE_ID, "fill-opacity": HATCH_FILL_OPACITY }
      : { "fill-color": COLOR_SUPPRESSED, "fill-opacity": SUPPRESS_SOLID_OPACITY };
    if (!map.getLayer(sid)) {
      map.addLayer(
        {
          id: sid,
          type: "fill",
          source: DIVISION_SRC,
          paint,
          filter: divisionSuppressedFilter(codes),
        },
        map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined,
      );
    } else {
      map.setFilter(sid, divisionSuppressedFilter(codes));
    }
  }

  // --- Pinned popup (popup-as-document) ------------------------------------
  // The fecha-de-corte context line for the pinned popup: the as-of date under a
  // scrub, otherwise the active period label. Null when no viewMeta is supplied.
  function pinnedCutoffLabel(): string | null {
    const vm = viewMetaRef.current;
    if (!vm) return null;
    if (vm.asOf) return `Al ${vm.asOf.toLocaleDateString("es-AR")}`;
    return vm.periodLabel || null;
  }

  // Aggregate the readout across ALL active PROVINCE-choropleth layers at one
  // province code — the multi-layer readout (each value labeled by its layer).
  function provinceReadouts(code: string): LayerReadout[] {
    const out: LayerReadout[] = [];
    for (const l of layersRef.current) {
      if (l.geomType !== "choropleth" || l.level !== "province") continue;
      // task #63: a bivariate layer reports BOTH raw values + their class + the
      // combined risk band (or the protected state when suppressed) — never a
      // single value, so the color can't be reverse-engineered into a hidden one.
      if (l.bivariateCells) {
        const cell = l.bivariateCells.find((c) => c.provinceCode === code);
        if (cell) return bivariateReadouts(cell);
        continue;
      }
      let value: number | null = null;
      for (const f of l.features.features) {
        const p = f.properties as { provinceCode?: string; value?: number };
        if (p.provinceCode === code) {
          value = p.value ?? 0;
          break;
        }
      }
      out.push(
        buildLayerReadout({
          label: l.label,
          value,
          dataType: l.dataType,
          complianceTarget: l.complianceTarget,
        }),
      );
    }
    return out;
  }

  // Aggregate the readout across ALL active LOCALITY-choropleth layers currently
  // in division-fill mode, at one normalized division code (dept/barrio). Reads
  // the same value + k-anon refs the fill + hover popup already use.
  function divisionReadouts(code: string): LayerReadout[] {
    const out: LayerReadout[] = [];
    for (const l of layersRef.current) {
      if (l.geomType !== "choropleth" || l.level !== "locality") continue;
      const values = divisionValuesRef.current.get(l.id);
      if (!values) continue; // not in division-fill mode for this layer
      const suppressed = divisionSuppressedRef.current.get(l.id)?.has(code) === true;
      const value = values.get(code) ?? null;
      out.push(
        buildLayerReadout({
          label: l.label,
          value,
          suppressed,
          dataType: l.dataType,
          complianceTarget: l.complianceTarget,
        }),
      );
    }
    return out;
  }

  // Pin the persistent popup at a unit: selectable multi-layer readout + a
  // "Ver detalle →" affordance that opens the DetailDrawer (keeps both patterns —
  // the popup is the quick layer, the drawer the deep layer). Works on touch: a
  // tap fires the same "click" event that pins it.
  function openPinnedPopup(opts: {
    map: maplibregl.Map;
    lngLat: maplibregl.LngLatLike;
    place: string;
    readouts: LayerReadout[];
    detail?: { layerId: string; properties: Record<string, unknown> };
  }) {
    const pinned = pinnedPopupRef.current;
    if (!pinned) return;
    const html = buildPinnedPopupHtml({
      place: opts.place,
      readouts: opts.readouts,
      cutoffLabel: pinnedCutoffLabel(),
      withDetail: opts.detail !== undefined,
    });
    pinned.setLngLat(opts.lngLat).setHTML(html).addTo(opts.map);
    // Wire the "Ver detalle →" affordance to the DetailDrawer (deep layer).
    const detail = opts.detail;
    if (detail) {
      const el = pinned.getElement()?.querySelector<HTMLButtonElement>("[data-pano-detail]");
      el?.addEventListener("click", () => {
        onFeatureClickRef.current?.(detail.layerId, detail.properties);
      });
    }
  }

  // --- Click-to-drill (task #55) -------------------------------------------
  /** The precomputed bbox for a province code, or null (basemap not yet loaded). */
  function provinceBboxFor(code: string): [[number, number], [number, number]] | null {
    return provinceBboxesRef.current.find((p) => p.code === code)?.bbox ?? null;
  }

  // Drill into a province: immediate camera feedback (fitBounds) + hand the code
  // to the console, which commits it to the `?province` scope. The scope-wins
  // rule then forces locality/department level and re-renders the province's
  // divisions. Idempotent + re-entrancy-guarded so a click over two stacked fills
  // drills once. Returns false when there is no drill target (caller pins instead).
  function drillToProvince(map: maplibregl.Map, code: string): boolean {
    if (!onProvinceDrillRef.current || !code) return false;
    if (drillingRef.current) return true;
    drillingRef.current = true;
    const bbox = provinceBboxFor(code);
    if (bbox) {
      map.fitBounds(bbox, {
        padding: FRAME_PADDING,
        animate: true,
        maxZoom: framingMaxZoom(map, bbox),
      });
    }
    onProvinceDrillRef.current(code);
    // Release the guard on the next tick — a fresh click can drill again (e.g.
    // when the console did not navigate, only updated state).
    window.setTimeout(() => {
      drillingRef.current = false;
    }, 0);
    return true;
  }

  // Hover names the division (barrio/departamento) + its value; a CLICK pins the
  // persistent popup (selectable, multi-layer) with a "Ver detalle →" affordance
  // that opens the DetailDrawer.
  function wireDivisionInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    // Bind ONCE per layer id — the handlers persist across the fill layer's
    // remove/re-add cycles (see divisionWiredRef), so re-wiring would stack
    // duplicate handlers (duplicate popups, double hover-state writes).
    if (divisionWiredRef.current.has(layer.id)) return;
    divisionWiredRef.current.add(layer.id);
    const fillId = divisionFillLayerId(layer.id);
    // The shared source can hold BOTH departamentos (numeric INDEC codes) and
    // CABA barrios (slug codes). Normalize per-feature by the code's shape rather
    // than a single division level.
    const codeFor = (rawCode: string): string =>
      /^\d/.test(rawCode.trim()) ? normalizeDepartmentCode(rawCode) : normalizeBarioCode(rawCode);
    map.on("mouseenter", fillId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", fillId, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
      // cursor #6: clear the division hover glow.
      const prev = hoveredDivisionRef.current;
      if (prev !== null && map.getSource(DIVISION_SRC)) {
        map.setFeatureState({ source: DIVISION_SRC, id: prev }, { hover: false });
        hoveredDivisionRef.current = null;
      }
    });
    map.on("mousemove", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = codeFor(props.code ?? "");
      // cursor #6: move the division hover glow to the polygon under the pointer
      // (feature id = the promoted `code` property). Mirrors the province path.
      const fid = f.id as string | number | undefined;
      const prevHover = hoveredDivisionRef.current;
      if (fid !== undefined && String(fid) !== prevHover) {
        if (prevHover !== null) {
          map.setFeatureState({ source: DIVISION_SRC, id: prevHover }, { hover: false });
        }
        map.setFeatureState({ source: DIVISION_SRC, id: fid }, { hover: true });
        hoveredDivisionRef.current = String(fid);
      }
      const value = divisionValuesRef.current.get(layer.id)?.get(code);
      const isSuppressed = divisionSuppressedRef.current.get(layer.id)?.has(code) === true;
      const place = props.name ?? props.code ?? "—";
      // cursor #10: suppressed (hatched) divisions read as PROTECTED, never as a
      // number and never as plain "Sin datos" — the honest k-anon copy.
      const valueLine = isSuppressed
        ? `<span style="color:#94a3b8">Datos insuficientes (protegidos por privacidad · k-anonimato)</span>`
        : value === undefined
          ? `<span style="color:#94a3b8">Sin datos</span>`
          : `<strong>${value.toLocaleString("es-AR")}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    map.on("click", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = codeFor(props.code ?? "");
      // A barrio feature carries a slug code; a departamento a numeric one.
      const isBarrio = !/^\d/.test((props.code ?? "").trim());
      const value = divisionValuesRef.current.get(layer.id)?.get(code) ?? null;
      // Honesty: pass the REAL k-anon state of this division (the same set the
      // hatch layer and hover popup already read) so the DetailDrawer renders
      // the "protegido por privacidad · k-anonimato" branch instead of a bogus
      // "0". A suppressed division has no value to reveal — never a count.
      const isSuppressed = divisionSuppressedRef.current.get(layer.id)?.has(code) === true;
      // Pin the persistent popup: the multi-layer readout across every active
      // locality choropleth, plus a "Ver detalle →" that opens the DetailDrawer
      // with the SAME payload the direct click used to emit.
      openPinnedPopup({
        map,
        lngLat: e.lngLat,
        place: props.name ?? props.code ?? "—",
        readouts: divisionReadouts(code),
        detail: {
          layerId: layer.id,
          properties: {
            // Barrio divisions map 1:1 to a locality, so surface the name as the
            // locality (unit-history keyed by locality still works). Departamento
            // fills aggregate several localities — carry the department name
            // instead and leave locality null (no single locality to drill).
            locality: isBarrio ? (props.name ?? null) : null,
            departmentName: props.name ?? null,
            value,
            level: "locality",
            suppressed: isSuppressed,
          },
        },
      });
    });
  }

  /**
   * F1 Panorama v2: graduated circles for density+signal layers.
   *
   * One NON-clustered circle per administrative unit (province or locality).
   * `circle-radius` is a step expression on the feature's `count` property so
   * higher event counts render as larger circles. Suppressed cells (count null
   * → coalesced to 0) render at a fixed small muted radius, same as the
   * choropleth's suppressed-cell treatment.
   *
   * This replaces MapLibre's generic point clustering for these layers so the
   * map shows a STABLE, DETERMINISTIC symbol per unit regardless of zoom level.
   */
  /**
   * #6/#7 — the AREA-proportional, data-driven `circle-radius` expression for a
   * graduated layer. Suppressed cells keep the fixed small muted radius; visible
   * cells interpolate over `radiusStops` derived from the observed maximum count
   * (r ∝ √count — see graduated-scale.ts). Stops come from the shared scale so
   * the on-map bubble matches the legend bubble for any value.
   */
  function graduatedRadiusExpr(
    radiusStops: ReadonlyArray<readonly [number, number]>,
  ): maplibregl.ExpressionSpecification {
    return [
      "case",
      ["==", ["get", "suppressed"], true],
      5,
      ["interpolate", ["linear"], ["coalesce", ["get", "count"], 0], ...radiusStops.flat()],
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  function addGraduatedPointLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
    radiusStops: ReadonlyArray<readonly [number, number]>,
  ) {
    // Non-clustered source — one feature per unit is already the aggregation unit.
    map.addSource(srcId(layer.id), { type: "geojson", data });
    map.addLayer({
      id: pointLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          COLOR_SUPPRESSED,
          layer.color,
        ],
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.45, 0.82],
        "circle-radius": graduatedRadiusExpr(radiusStops),
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wireGraduatedPointInteractions(map, layer);
  }

  /**
   * Reference-layer rendering: discrete pins with MapLibre native clustering.
   * Used for refugios and decomisos — each feature represents an individual
   * entity (shelter / expediente) that must not be spatially merged.
   */
  function addReferencePointLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
  ) {
    map.addSource(srcId(layer.id), {
      type: "geojson",
      data,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 12,
    });
    // Cluster bubbles (no on-canvas text: privacy).
    map.addLayer({
      id: clusterLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      filter: ["has", "point_count"],
      paint: {
        "circle-color": layer.color,
        "circle-opacity": 0.8,
        "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24, 500, 32],
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 2,
      },
    });
    // Unclustered points.
    map.addLayer({
      id: pointLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": layer.color,
        "circle-radius": 6,
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wireReferencePointInteractions(map, layer);
  }

  function addChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
  ) {
    map.addSource(srcId(layer.id), { type: "geojson", data });
    // Graduated symbol: radius scales with `value`; suppressed cells (value null
    // → coalesced to 0 by maplibre 'get') render muted at a fixed small radius.
    map.addLayer({
      id: choroLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          COLOR_SUPPRESSED,
          layer.color,
        ],
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.45, 0.78],
        "circle-radius": [
          "case",
          ["==", ["get", "suppressed"], true],
          5,
          ["interpolate", ["linear"], ["coalesce", ["get", "value"], 0], 0, 6, 50, 16, 250, 26],
        ],
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wireChoroplethInteractions(map, layer);
  }

  // --- U5 province-choropleth: fill the local basemap polygons by value. -----

  // Add a fill (+ hover outline) over the SHARED ar-provinces basemap source.
  // The fill-color is a data-driven expression keyed on the polygon `code`
  // property (a local-only data-join — NO external provider, mirrors the
  // MapChoropleth color-expression approach but on the local polygons). If the
  // basemap source is missing (fetch failed), there is nothing to fill.
  /** Choose the fill-color expression for a province choropleth based on dataType.
   * Rate layers with a complianceTarget render as a divergent scale (F5);
   * all others keep the sequential RAMP_BLUE path. */
  function provinceColorExprForLayer(layer: ActiveLayer, seqDomain?: DomainBounds | null) {
    // task #63: a bivariate layer paints from its precomputed class matrix (a
    // `match` on the polygon code → the 3×3 palette), not from a single value.
    if (layer.bivariateCells) {
      return bivariateFillColorExpr(layer.bivariateCells);
    }
    if (layer.dataType === "rate" && typeof layer.complianceTarget === "number") {
      // panorama-ia-v2 §3.2: rate layers use the FIXED [0,100] domain so every
      // province is colored on the same axis (cross-province comparability); the
      // observed range would rescale per dataset and let a hot province wash out
      // the rest.
      return provinceDivergentColorExpr(layer.features, layer.complianceTarget, FIXED_RATE_DOMAIN);
    }
    // Sequential layers: `seqDomain` is the scrub-locked domain (null at the live
    // edge, where the expr computes the domain from the frame's own values).
    return provinceColorExpr(layer.features, seqDomain);
  }

  function addProvinceChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    seqDomain?: DomainBounds | null,
  ) {
    if (!map.getSource("ar-provinces")) return;
    const fillId = provinceFillLayerId(layer.id);
    const lineId = provinceLineLayerId(layer.id);
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: "ar-provinces",
        paint: {
          "fill-color": provinceColorExprForLayer(layer, seqDomain),
          "fill-opacity": DATA_FILL_OPACITY,
        },
      });
    }
    if (!map.getLayer(lineId)) {
      // cursor #1: admin-neutral stroke (NOT COLOR_CANVAS) so province edges read
      // as boundaries over the fill, never as near-black cracks. Faded by
      // updateChromeHierarchy when divisions are active (cursor #5).
      map.addLayer({
        id: lineId,
        type: "line",
        source: "ar-provinces",
        paint: {
          "line-color": COLOR_ADMIN_STROKE,
          "line-width": PROV_LINE_WIDTH,
          "line-opacity": PROV_LINE_OPACITY,
        },
      });
    }
    wireProvinceChoroplethInteractions(map, layer);
  }

  // Recompute the color expression in place when the layer's features change
  // (e.g. scope/period refetch). The fill layer + source are reused.
  function updateProvinceChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    seqDomain?: DomainBounds | null,
  ) {
    const fillId = provinceFillLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, "fill-color", provinceColorExprForLayer(layer, seqDomain));
    } else {
      // Basemap may have loaded after the first sync attempt — try to add now.
      addProvinceChoroplethLayer(map, layer, seqDomain);
    }
  }

  // task #63: hatch the provinces whose bivariate cell is k-anon suppressed (its
  // color was withheld). A fill-pattern layer over the shared ar-provinces source,
  // filtered to the suppressed codes, inserted ABOVE the bivariate fill. Removed
  // when the layer is not bivariate or nothing is suppressed. Same fail-honest
  // fallback as the division hatch (solid tone when the pattern image is absent).
  function applyProvinceBivariateSuppression(map: maplibregl.Map, layer: ActiveLayer) {
    const sid = provinceSuppressLayerId(layer.id);
    const codes = layer.bivariateCells ? bivariateSuppressedCodes(layer.bivariateCells) : [];
    if (codes.length === 0) {
      if (map.getLayer(sid)) map.removeLayer(sid);
      return;
    }
    if (!map.getSource("ar-provinces")) return;
    const hasPattern = map.hasImage(HATCH_IMAGE_ID);
    const paint: maplibregl.FillLayerSpecification["paint"] = hasPattern
      ? { "fill-pattern": HATCH_IMAGE_ID, "fill-opacity": HATCH_FILL_OPACITY }
      : { "fill-color": COLOR_SUPPRESSED, "fill-opacity": SUPPRESS_SOLID_OPACITY };
    if (!map.getLayer(sid)) {
      map.addLayer({ id: sid, type: "fill", source: "ar-provinces", paint });
    }
    map.setFilter(sid, bivariateSuppressedFilter(codes));
  }

  function wireProvinceChoroplethInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const fillId = provinceFillLayerId(layer.id);
    // Look up the value for a province code from the layer's current features.
    const valueFor = (code: string): number | null => {
      const current = layersRef.current.find((l) => l.id === layer.id);
      for (const f of current?.features.features ?? []) {
        const p = f.properties as { provinceCode?: string; province?: string; value?: number };
        if (p.provinceCode === code) return p.value ?? 0;
      }
      return null;
    };
    map.on("mouseenter", fillId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", fillId, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
      // panorama-ia-v2 §3.3: clear the ranked-row highlight (map→row sync).
      onUnitHoverRef.current?.(null);
      // cursor #6: clear the polygon hover glow.
      const prev = hoveredProvinceRef.current;
      if (prev !== null) {
        map.setFeatureState({ source: "ar-provinces", id: prev }, { hover: false });
        hoveredProvinceRef.current = null;
      }
    });
    map.on("mousemove", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = props.code ?? "";
      // panorama-ia-v2 §3.3: highlight the matching ranked row (map→row sync).
      onUnitHoverRef.current?.(code);
      // cursor #6: move the polygon hover glow to the province under the pointer.
      const prev = hoveredProvinceRef.current;
      if (prev !== code) {
        if (prev !== null) {
          map.setFeatureState({ source: "ar-provinces", id: prev }, { hover: false });
        }
        if (code) map.setFeatureState({ source: "ar-provinces", id: code }, { hover: true });
        hoveredProvinceRef.current = code || null;
      }
      const place = props.name ?? code ?? "—";
      // task #63: a bivariate layer's hover preview names the combined risk band
      // (or the protected state), not a single value — the pinned popup carries
      // the full both-values readout on click.
      const current = layersRef.current.find((l) => l.id === layer.id);
      let valueLine: string;
      if (current?.bivariateCells) {
        const cell = current.bivariateCells.find((c) => c.provinceCode === code);
        if (!cell || (cell.coverageValue === null && cell.signalValue === null)) {
          valueLine = `<span style="color:#94a3b8">Sin datos</span>`;
        } else if (cell.suppressed) {
          valueLine = `<span style="color:#94a3b8">Dato protegido (k-anonimato)</span>`;
        } else if (cell.coverageClass !== null && cell.signalClass !== null) {
          valueLine = `<strong>Riesgo ${escapeHtml(riskLabel(cell.coverageClass, cell.signalClass))}</strong>`;
        } else {
          valueLine = `<span style="color:#94a3b8">Sin datos</span>`;
        }
      } else {
        const value = valueFor(code);
        valueLine =
          value === null
            ? `<span style="color:#94a3b8">Sin datos</span>`
            : `<strong>${value.toLocaleString("es-AR")}</strong>`;
      }
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    // Clicking a province at NATIONAL scope DRILLS into it (task #55). When
    // already scoped (or no drill target), it pins the persistent popup
    // (multi-layer readout) with a "Ver detalle →" affordance.
    map.on("click", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = props.code ?? "";
      if (selectedProvinceRef.current == null && drillToProvince(map, code)) return;
      openPinnedPopup({
        map,
        lngLat: e.lngLat,
        place: props.name ?? code ?? "—",
        readouts: provinceReadouts(code),
        detail: {
          layerId: layer.id,
          properties: {
            provinceCode: code,
            province: props.name ?? code,
            value: valueFor(code),
            level: "province",
          },
        },
      });
    });
  }

  /**
   * Interactions for graduated-circle layers (F1 density+signal).
   * No cluster — every feature is already one unit. Hover shows the count;
   * click opens the DetailDrawer.
   */
  function wireGraduatedPointInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const pl = pointLayerId(layer.id);

    map.on("mouseenter", pl, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", pl, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as {
        place?: string;
        count?: number | null;
        suppressed?: boolean;
      };
      const place = p.place ?? "—";
      const valueLine = p.suppressed
        ? `<span style="color:#94a3b8">Datos insuficientes (protegidos por privacidad · k-anonimato)</span>`
        : `<strong>${(p.count ?? 0).toLocaleString("es-AR")}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    map.on("click", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
    // map-QOL: double-click a unit → open its DetailDrawer AND zoom in on it
    // (cancels MapLibre's default dblclick zoom so the camera centers the unit).
    map.on("dblclick", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      e.preventDefault();
      const geom = f.geometry as GeoJSON.Point;
      map.easeTo({
        center: geom.coordinates as [number, number],
        zoom: Math.max(map.getZoom() + 1.5, 8),
      });
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  /**
   * Interactions for reference-layer discrete pins (refugios, decomisos).
   * Cluster bubbles zoom in; unclustered points open the DetailDrawer.
   */
  function wireReferencePointInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const cl = clusterLayerId(layer.id);
    const pl = pointLayerId(layer.id);

    map.on("mouseenter", cl, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", cl, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", cl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const n = (f.properties as { point_count?: number }).point_count ?? 0;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><strong>${n}</strong> en esta zona<br/><em style="font-size:11px;color:#94a3b8">Clic para acercar</em></div>`,
        )
        .addTo(map);
    });
    map.on("click", cl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const clusterId = (f.properties as { cluster_id?: number }).cluster_id;
      const src = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
      if (clusterId == null || !src) return;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        const geom = f.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });
    });

    map.on("mouseenter", pl, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", pl, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(pointPopupHtml(layer, f.properties ?? {}))
        .addTo(map);
    });
    // Clicking an INDIVIDUAL point opens the DetailDrawer (clusters zoom; see above).
    map.on("click", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  function wireChoroplethInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const id = choroLayerId(layer.id);
    map.on("mouseenter", id, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", id, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as {
        locality?: string;
        province?: string;
        value?: number | null;
        suppressed?: boolean;
      };
      const place = [p.locality, p.province].filter(Boolean).join(", ") || "—";
      // Suppressed cells NEVER show a number — privacy (k-anon).
      const valueLine = p.suppressed
        ? `<span style="color:#94a3b8">Datos insuficientes (protegidos por privacidad · k-anonimato)</span>`
        : `<strong>${p.value ?? 0}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    // Clicking a choropleth cell opens the DetailDrawer. Suppressed cells still
    // open — the drawer renders "Suprimido", never the real count (k-anon).
    map.on("click", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
    // map-QOL: double-click a locality cell → DetailDrawer + zoom to the cell.
    map.on("dblclick", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      e.preventDefault();
      const geom = f.geometry as GeoJSON.Point;
      map.easeTo({
        center: geom.coordinates as [number, number],
        zoom: Math.max(map.getZoom() + 1.5, 8),
      });
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  // PR-6: count only features with non-null geometry (Point coordinates).
  // Province-choropleth features carry geometry: null — they color basemap
  // polygons via a data-join and are visible even when this count is 0.
  const renderableCount = countRenderableFeatures(layers);
  // True when at least one active layer fills the province basemap polygons.
  // Province choropleth layers ARE visible on the map even when renderableCount
  // is 0, so the "Sin datos" overlay must be suppressed when this is true.
  const hasProvChoro = hasProvinceChoroplethLayer(layers);

  // U5 + F5: province-choropleth scale legend. One entry per active province-mode
  // choropleth layer, with its value min→max range and (for rate layers) the
  // compliance target. Rendered as an HTML overlay — no on-canvas text (privacy).
  // Legends are always visible (not gated on zoom) — fixes the "coropletas sin
  // leyenda" complaint: the overlay sits on top of the map at all zoom levels.
  // task #63: the active bivariate layer (if any) drives the 3×3 matrix legend
  // below; it is excluded from the ordinary province ramp legends.
  const bivariateLayer =
    layers.find((l) => l.geomType === "choropleth" && l.level === "province" && l.bivariateCells) ??
    null;

  const provinceLegends = layers
    .filter((l) => l.geomType === "choropleth" && l.level === "province" && !l.bivariateCells)
    .map((l) => ({
      layer: l,
      bounds: provinceValueBounds(l.features),
      isDivergent: l.dataType === "rate" && typeof l.complianceTarget === "number",
    }))
    .filter(
      (
        x,
      ): x is {
        layer: ActiveLayer;
        bounds: ScaleBounds;
        isDivergent: boolean;
      } => x.bounds !== null,
    );

  // F1 Panorama v2: FIXED graduated-circle legend for density+signal layers.
  // Shows the circle-size → count-bucket mapping from the step expression in
  // addGraduatedPointLayer. Independent of zoom (circles are non-clustered, one
  // per unit, so this legend is always accurate). Shown when at least one
  // graduated layer is active.
  // #6/#7: the graduated legend is data-driven — its sample bubbles come from
  // `graduatedScale` (built in syncLayers from the observed max), so they show the
  // scale the data actually occupies (e.g. 1–4 when the signals are tiny) at the
  // exact area-proportional sizes rendered on the map. Only shown when a graduated
  // layer is active AND the scale has resolved with real data.
  const hasGraduatedLayer =
    layers.some((l) => l.renderMode === "graduated") &&
    graduatedScale !== null &&
    graduatedScale.bins.length > 0;
  // Name the stacked graduated legend by its layer(s), so it reads "Eventos por
  // unidad — Zoonosis" rather than a context-free "Eventos por unidad" that never
  // says WHICH metric the bubbles encode (PO finding: each stacked legend must
  // name its layer).
  const graduatedLayerLabel = layers
    .filter((l) => l.renderMode === "graduated")
    .map((l) => l.label)
    .join(" · ");

  // panorama-ia-v2 §3.6: copy the canonical view URL (deep-link) to clipboard.
  const [copied, setCopied] = useState(false);
  function copyView() {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => {
        /* clipboard denied — no-op (the URL is still shareable from the bar) */
      },
    );
  }

  // panorama-ia-v2 §3.6: export the map as a PNG with an auditable metadata
  // footer (data-as-of · source · scope · period · suppressed cells). Composes
  // the map canvas onto a taller canvas and appends the footer strip.
  function exportPng() {
    const map = mapRef.current;
    if (!map || !viewMeta) return;
    const mapCanvas = map.getCanvas();
    const footer = buildExportFooter(viewMeta);
    const stripH = 34;
    const out = document.createElement("canvas");
    out.width = mapCanvas.width;
    out.height = mapCanvas.height + stripH;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(mapCanvas, 0, 0);
    ctx.fillStyle = COLOR_CANVAS;
    ctx.fillRect(0, mapCanvas.height, out.width, stripH);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(footer, 12, mapCanvas.height + stripH / 2);
    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "panorama-mimar.png";
    a.click();
  }

  // Reset view: snap the camera back to the operator's scope — the
  // server-computed jurisdiction bbox (govt) or the national/data extent.
  function fitToScope() {
    const map = mapRef.current;
    if (!map) return;
    const bbox = initialBoundsRef.current ?? nationalBboxRef.current ?? AR_BBOX;
    map.fitBounds(bbox, { padding: 56, animate: true, maxZoom: 11 });
  }
  // Accessible label for the reset-view control. Named per operator type so the
  // home icon's tooltip is honest: a scoped govt operator (initialBounds present)
  // returns to their jurisdiction; admin/universal returns to the national view.
  const resetViewLabel = initialBounds ? "Volver a mi jurisdicción" : "Vista nacional";

  // task #70 — audience-aware empty-state copy. "en tu cobertura" is GOVT copy;
  // showing it to a universal-scope admin/superadmin (no assigned jurisdiction)
  // leaks the wrong audience's framing. Same operator-type signal the reset label
  // uses (initialBounds ⟺ scoped govt). An admin who DRILLED into a province by
  // choice reads a neutral "en este alcance" — they have no assigned "cobertura".
  const emptyStateScope =
    selectedLocalityCenter != null || selectedProvinceCode != null
      ? "en este alcance"
      : initialBounds
        ? "en tu cobertura"
        : "en todo el país";

  // cursor Part2 — the active choropleth base layer whose CABA aggregates the
  // inset renders at barrio scale. Shown only at national/regional zoom (before
  // the operator drills past Z_DIVISIONS, where CABA becomes readable on the main
  // map anyway). Privacy-safe: same aggregates, same tokens, same k-anon hatch.
  //
  // #9 — CABA (~200 km²) is a pixel at national zoom on a web-mercator map, so
  // the densest jurisdiction is invisible right where it matters. A LOCALITY-level
  // choropleth fills the 48 barrios with real per-barrio data (the finest, honest
  // case). A PROVINCE-level choropleth (e.g. rabies coverage at national zoom) has
  // one CABA value: rather than hide CABA entirely (the original defect), fill the
  // barrios UNIFORMLY with that single value, evaluated against the SAME scale the
  // main map uses (divergent for rate layers, sequential otherwise) so the inset
  // color matches CABA's tiny main-map polygon, and label the panel "valor
  // provincial" so it never over-promises per-barrio granularity.
  const insetLocalityLayer =
    layers.find((l) => l.geomType === "choropleth" && l.level === "locality") ?? null;
  const insetProvinceLayer =
    insetLocalityLayer === null
      ? (layers.find((l) => l.geomType === "choropleth" && l.level === "province") ?? null)
      : null;

  // The single CABA province value + its flat fill color (province-level only).
  let insetUniformFill: string | null = null;
  if (insetProvinceLayer) {
    const cabaFeature = insetProvinceLayer.features.features.find((f) =>
      isCABA(String((f.properties as { provinceCode?: string } | null)?.provinceCode ?? "")),
    );
    const cabaValue = (cabaFeature?.properties as { value?: number } | null)?.value;
    if (typeof cabaValue === "number") {
      if (
        insetProvinceLayer.dataType === "rate" &&
        typeof insetProvinceLayer.complianceTarget === "number"
      ) {
        // Same FIXED [0,100] divergent axis + meta anchor as the main province fill.
        insetUniformFill = sampleStops(
          divergentStops(
            insetProvinceLayer.complianceTarget,
            FIXED_RATE_DOMAIN.min,
            FIXED_RATE_DOMAIN.max,
          ),
          cabaValue,
        );
      } else {
        // Sequential RAMP_BLUE over the observed province range (matches provinceColorExpr).
        const b = provinceValueBounds(insetProvinceLayer.features);
        if (b) {
          insetUniformFill = sampleStops(
            [
              [b.min, RAMP_BLUE[0]],
              [b.max, RAMP_BLUE[1]],
            ],
            cabaValue,
          );
        }
      }
    }
  }

  // The layer the inset renders: the locality layer if present, else the
  // province layer ONLY when a CABA value resolved (avoids an empty panel).
  const insetLayer = insetLocalityLayer ?? (insetUniformFill !== null ? insetProvinceLayer : null);
  const insetVisible = insetLayer !== null && insetZoom < Z_DIVISIONS;

  // Keyboard: Escape dismisses the pinned popup (Esri "documents are closeable").
  // The popup's ✕ + "Ver detalle" are real, tab-reachable buttons; this adds the
  // conventional Esc shortcut. Fires from anywhere in the map subtree (canvas,
  // controls, or the popup itself hold focus after interaction).
  function handleMapKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && pinnedPopupRef.current?.isOpen()) {
      pinnedPopupRef.current.remove();
    }
  }

  return (
    <div className="relative w-full" style={{ height }} onKeyDown={handleMapKeyDown}>
      {/* role="img" TRADEOFF (fix, keyboard/focus): the map is an interactive
          canvas, but exposing it as role="img" gives assistive tech a single
          static-image summary (the aria-label point count) instead of an
          unlabeled, un-navigable canvas. The real interactive affordances —
          zoom (NavigationControl), reset-view, ← Volver, and the pinned popup's
          ✕ + "Ver detalle" — are all tab-reachable, labeled <button>s outside
          this element, and Esc closes the popup (handleMapKeyDown). Full
          keyboard PAN/feature-navigation on the canvas stays deferred (a larger
          effort); this keeps the summary honest without a dead, silent canvas. */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-ln-op-line"
        style={{ background: COLOR_CANVAS }}
        role="img"
        aria-label={`${label}. ${renderableCount} ${renderableCount === 1 ? "punto" : "puntos"} en la vista.`}
      />
      {/* cursor Part2: CABA/AMBA inset — a docked barrio-scale mini-map so the
          micro-jurisdiction is legible at national zoom (not an unreadable smear).
          Static camera, non-interactive, shares the choropleth + k-anon system. */}
      <CabaInset layer={insetLayer} visible={insetVisible} uniformFill={insetUniformFill} />
      {/* Top-left control cluster: scope drill ("← Volver") + camera reset. */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        {/* Click-to-drill (task #55): pop the province scope back to national.
            Rendered only when the operator can return (explicit province pick). */}
        {onReturnNational && (
          <button
            type="button"
            onClick={onReturnNational}
            className="rounded-[var(--radius-sm)] border border-white/20 bg-black/55 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-black/70"
          >
            ← Volver
          </button>
        )}
        {/* Reset view (fix): a HOME icon is the universal "return to the default
            frame" convention — replaces the internal-jargon "Mi alcance" text.
            fitToScope re-frames the camera to the operator's scope default
            (national for admin/universal; the jurisdiction frame for scoped govt).
            The accessible label + tooltip name the destination honestly per
            operator type; the visible control is the icon. */}
        <button
          type="button"
          onClick={fitToScope}
          title={resetViewLabel}
          aria-label={resetViewLabel}
          className="flex items-center justify-center rounded-[var(--radius-sm)] border border-white/20 bg-black/55 p-1.5 text-white/90 hover:bg-black/70"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </button>
      </div>
      {/* panorama-ia-v2 §3.6: briefing chrome — copy the deep-link + export a
          PNG with an auditable metadata footer. */}
      {viewMeta && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {copied && (
            <output className="rounded-[var(--radius-sm)] bg-black/70 px-2 py-1 text-xs text-white/90">
              Vista copiada
            </output>
          )}
          <button
            type="button"
            onClick={copyView}
            className="rounded-[var(--radius-sm)] border border-white/20 bg-black/55 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-black/70"
          >
            Copiar vista
          </button>
          {/* task #66b: named bookmarks of the current view URL (localStorage). */}
          <SavedViewsPopover />
          <button
            type="button"
            onClick={exportPng}
            className="rounded-[var(--radius-sm)] border border-white/20 bg-black/55 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-black/70"
          >
            Exportar PNG
          </button>
          {/* Roadmap signal (PO obs 1048, re-ratified 2026-07-09): the one-click
              situación report — the visualization + export console — is planned
              and the PO wants this placeholder VISIBLE in production so the
              affordance reads as "coming". Visibly disabled — the only dead UI
              on this surface — so it never reads as broken. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="En desarrollo"
            className="cursor-not-allowed rounded-[var(--radius-sm)] border border-white/10 bg-black/40 px-2.5 py-1 text-xs font-medium text-white/40"
          >
            Informe de situación (en desarrollo)
          </button>
        </div>
      )}
      {renderableCount === 0 && !hasProvChoro && divisionLegend === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-[var(--radius-md)] bg-black/40 px-4 py-2 text-[var(--text-md)] text-white/80">
            Sin datos para esta capa {emptyStateScope}.
          </p>
        </div>
      )}
      {/* map-QOL merged single legend: ONE region (bottom-left) hosts every
          scale — province choropleth ramps, the division-fill ramp, AND the
          graduated-circle buckets. */}
      {(provinceLegends.length > 0 ||
        hasGraduatedLayer ||
        divisionLegend !== null ||
        bivariateLayer !== null) && (
        <div
          aria-label="Leyenda del mapa"
          className="pointer-events-none absolute bottom-3 left-3 space-y-2"
        >
          {/* task #63: the bivariate legend IS the 3×3 matrix — coverage terciles
              (x, "Cobertura →") × signal terciles (y, "Señales ↑"). The risk
              corner (low coverage · high signal) is marked. A hatch swatch names
              the k-anon-protected state (color withheld, never inferred). */}
          {bivariateLayer !== null && (
            <div className="rounded-[var(--radius-md)] bg-black/55 px-3 py-2 text-[var(--text-sm)] text-white/90">
              <div className="mb-1.5 font-medium">Riesgo de brotes</div>
              <div className="flex items-stretch gap-1.5">
                {/* y-axis label */}
                <div className="flex flex-col items-center justify-center">
                  <span className="whitespace-nowrap text-[10px] text-white/60 [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                    Señales ↑
                  </span>
                </div>
                <div>
                  {/* 3 rows × 3 cols; grid is row-major, top row = high signal. */}
                  <div className="grid grid-cols-3 gap-[2px]">
                    {BIVARIATE_LEGEND_GRID.map((sw) => (
                      <span
                        key={`biv-${sw.cov}-${sw.sig}`}
                        className={`h-4 w-4 rounded-[var(--radius-xs)] ${
                          sw.risk ? "ring-1 ring-white/80" : "border border-white/10"
                        }`}
                        style={{ background: sw.color }}
                        title={sw.risk ? "Riesgo alto: cobertura baja · señales altas" : undefined}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <div className="mt-0.5 text-center text-[10px] text-white/60">Cobertura →</div>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(203,213,225,0.85) 0, rgba(203,213,225,0.85) 1px, transparent 1px, transparent 3px)",
                  }}
                  aria-hidden="true"
                />
                Protegido (k-anonimato)
              </div>
            </div>
          )}
          {/* Division-fill legend: sequential ramp for the active locality
              choropleth over the barrio/departamento polygons. Names the unit so
              the operator reads the fill as "por barrio/departamento", and states
              that an unfilled division is a genuine no-data (or k-anon protected)
              cell — the always-on outline is the "no data" signal, not a gap. */}
          {divisionLegend !== null && (
            <div className="rounded-[var(--radius-md)] bg-black/55 px-3 py-2 text-[var(--text-sm)] text-white/90">
              <div className="mb-1 font-medium">
                {divisionLegend.label}{" "}
                <span className="font-normal text-white/60">· por {divisionLegend.unitNoun}</span>
              </div>
              {divisionLegend.hasRamp && (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{divisionLegend.min.toLocaleString("es-AR")}</span>
                  <span
                    className="h-2.5 w-24 rounded-full"
                    style={{
                      background: `linear-gradient(to right, ${RAMP_BLUE[0]}, ${RAMP_BLUE[1]})`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums">{divisionLegend.max.toLocaleString("es-AR")}</span>
                </div>
              )}
              {/* cursor #2: the three states are trichotomous — a colored fill is a
                  value, a DIAGONAL HATCH is a k-anon-protected division, and an
                  outline-only cell is genuine no-data. Each swatch matches its map
                  mark exactly so a govt user never reads "protegido" as "cero". */}
              {divisionLegend.suppressed && (
                <div className="mt-1 flex items-center gap-1.5 text-white/70">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(203,213,225,0.85) 0, rgba(203,213,225,0.85) 1px, transparent 1px, transparent 3px)",
                    }}
                    aria-hidden="true"
                  />
                  Suprimido (k-anonimato)
                </div>
              )}
              <div className="mt-1 flex items-center gap-1.5 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                  aria-hidden="true"
                />
                Sin datos (solo contorno)
              </div>
            </div>
          )}
          {provinceLegends.map(({ layer, bounds, isDivergent }) => {
            // #5: the actual province values, for the in-legend distribution. On
            // the FIXED [0,100] divergent axis they otherwise vanish into the mid
            // band — the histogram shows the real spread (and the empty above-meta
            // half) so the reader sees more than the two endpoints.
            const values = layer.features.features
              .map((f) => (f.properties as { value?: number } | null)?.value)
              .filter((v): v is number => typeof v === "number");
            const hist =
              isDivergent && typeof layer.complianceTarget === "number"
                ? valueHistogram(values, FIXED_RATE_DOMAIN.min, FIXED_RATE_DOMAIN.max, 16)
                : [];
            const histPeak = histogramPeak(hist);
            const metaPct =
              typeof layer.complianceTarget === "number"
                ? (100 * (layer.complianceTarget - FIXED_RATE_DOMAIN.min)) /
                  (FIXED_RATE_DOMAIN.max - FIXED_RATE_DOMAIN.min)
                : 0;
            return (
              <div
                key={layer.id}
                className="rounded-[var(--radius-md)] bg-black/55 px-3 py-2 text-[var(--text-sm)] text-white/90"
              >
                <div className="mb-1 font-medium">{layer.label}</div>
                {isDivergent && typeof layer.complianceTarget === "number" ? (
                  // F5: divergent legend — two poles with the target anchor labeled.
                  // Colorblind-safe: orange=below, white=at target, teal=above.
                  // Text labels accompany every color swatch (not color-only).
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {/* panorama-ia-v2 §3.2: FIXED [0,100] endpoints flank the
                          gradient (below-pole → neutral-at-meta → above-pole) so the
                          scale reads the same for every province. */}
                      <span className="tabular-nums text-white/70">0</span>
                      {/* #5: gradient + overlaid value distribution + meta marker,
                          all on the SAME [0,100] axis so the reader sees where the
                          provinces actually fall relative to the meta. */}
                      <span className="relative h-6 w-28 flex-none">
                        {histPeak > 0 && (
                          <span
                            className="absolute inset-x-0 top-0 flex h-3.5 items-end gap-px"
                            aria-hidden="true"
                          >
                            {hist.map((b) => (
                              <span
                                key={b.lo}
                                className="flex-1 rounded-t-[1px] bg-white/45"
                                style={{ height: `${Math.round((100 * b.count) / histPeak)}%` }}
                              />
                            ))}
                          </span>
                        )}
                        <span
                          className="absolute inset-x-0 bottom-0 block h-2.5 rounded-full"
                          style={{
                            background: `linear-gradient(to right, ${COLOR_DIVERGENT_BELOW}, ${COLOR_DIVERGENT_NEUTRAL}, ${COLOR_DIVERGENT_ABOVE})`,
                          }}
                          aria-hidden="true"
                        />
                        {/* meta anchor — a vertical tick at the compliance target */}
                        <span
                          className="absolute bottom-0 block h-5 w-px bg-white/80"
                          style={{ left: `${metaPct}%` }}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="tabular-nums text-white/70">100</span>
                    </div>
                    {histPeak > 0 && (
                      <div className="text-[var(--text-xs)] leading-tight text-white/45">
                        Distribución de {values.length}{" "}
                        {values.length === 1 ? "provincia" : "provincias"} (barras) · meta marcada
                      </div>
                    )}
                    <div className="flex justify-between text-[var(--text-xs)] text-white/55">
                      <span>bajo meta</span>
                      <span>sobre meta</span>
                    </div>
                    {/* Target anchor — the pivotal reference point */}
                    <div className="flex items-center gap-1.5 text-white/60">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/30"
                        style={{ background: COLOR_DIVERGENT_NEUTRAL }}
                        aria-hidden="true"
                      />
                      <span>
                        meta{" "}
                        <strong className="text-white/80">
                          {layer.complianceTarget.toLocaleString("es-AR")}%
                        </strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  // Sequential legend for density/count choropleths.
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{bounds.min.toLocaleString("es-AR")}</span>
                    <span
                      className="h-2.5 w-24 rounded-full"
                      style={{
                        background: `linear-gradient(to right, ${RAMP_BLUE[0]}, ${RAMP_BLUE[1]})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">{bounds.max.toLocaleString("es-AR")}</span>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1.5 text-white/70">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)]"
                    style={{ background: COLOR_NO_DATA }}
                    aria-hidden="true"
                  />
                  Sin datos
                </div>
                {/* k-anon disclosure: province cells with fewer than 5 records are
                  suppressed server-side (AGENTS.md k=5 policy) and fall back to
                  the same neutral fill as genuine no-data. Spell out WHY so a
                  govt user reads a blank cell as privacy protection, not a gap.
                  Copy parity with MapChoropleth ("protegidos por privacidad ·
                  k-anonimato"). */}
                <div className="mt-0.5 text-[var(--text-xs)] leading-tight text-white/55">
                  Dato protegido — menos de 5 registros (k-anonimato)
                </div>
              </div>
            );
          })}
          {/* F1 graduated-circle legend: fixed size → count-bucket mapping.
              Does NOT depend on zoom — circles are non-clustered, one per unit. */}
          {hasGraduatedLayer && graduatedScale && (
            <div className="rounded-[var(--radius-md)] bg-black/55 px-3 py-2 text-[var(--text-sm)] text-white/90">
              <div className="mb-1.5 font-medium text-white/80">
                Eventos por unidad
                {graduatedLayerLabel && (
                  <span className="font-normal text-white/60"> — {graduatedLayerLabel}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {graduatedScale.bins.map((b) => (
                  <div key={b.value} className="flex items-center gap-2">
                    <span
                      className="flex-none rounded-full"
                      style={{
                        width: b.r * 2,
                        height: b.r * 2,
                        background: "rgba(255,255,255,0.25)",
                        border: "1.5px solid rgba(255,255,255,0.5)",
                      }}
                      aria-hidden="true"
                    />
                    <span className="tabular-nums text-white/70">{b.label}</span>
                  </div>
                ))}
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className="flex-none rounded-full"
                    style={{
                      width: 10,
                      height: 10,
                      background: COLOR_SUPPRESSED,
                      opacity: 0.6,
                    }}
                    aria-hidden="true"
                  />
                  {/* Copy parity with MapChoropleth's legend ("Datos
                      insuficientes (privacidad)") — design-QA 2026-07-04 P2:
                      the same suppression state must read the same across
                      dashboard and situational surfaces. */}
                  <span className="text-white/50">Datos insuficientes (privacidad)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Remove every maplibre object belonging to a layer id (point, locality
// choropleth, AND province-choropleth fill/outline over the shared basemap).
function removeLayer(map: maplibregl.Map, id: string) {
  for (const lid of [
    clusterLayerId(id),
    pointLayerId(id),
    choroLayerId(id),
    provinceFillLayerId(id),
    provinceLineLayerId(id),
    provinceSuppressLayerId(id),
    divisionFillLayerId(id),
    DIVISION_SUPPRESS_ID(id),
  ]) {
    if (map.getLayer(lid)) map.removeLayer(lid);
  }
  // Only the per-layer GeoJSON source is removed; the SHARED ar-provinces basemap
  // and pano-divisions sources are never removed here (their fills borrow them).
  if (map.getSource(srcId(id))) map.removeSource(srcId(id));
}

// F4: mute a layer (and re-restore it) by scaling circle-opacity. We never hide
// dimmed layers — the operator keeps the current-state context while scrubbing —
// but the reduced opacity signals "not reproducible in time" on the canvas.
const DIM_OPACITY = 0.18;
function applyDim(map: maplibregl.Map, layer: ActiveLayer) {
  const dim = layer.dimmed === true;
  // map-QOL: the per-layer opacity multiplier (Personalizar slider) scales the
  // BASE opacities; the F4 dim state and the suppressed-cell muting win under it.
  const op = typeof layer.opacity === "number" ? Math.min(Math.max(layer.opacity, 0.2), 1) : 1;
  const scaled = (base: number) => base * op;
  if (layer.geomType === "choropleth") {
    // U5 province mode: mute the polygon fill instead of the centroid circles.
    if (layer.level === "province") {
      const fid = provinceFillLayerId(layer.id);
      if (map.getLayer(fid))
        map.setPaintProperty(fid, "fill-opacity", dim ? DIM_OPACITY : scaled(DATA_FILL_OPACITY));
      return;
    }
    // Locality mode with a division fill: mute the polygon fill alongside the
    // fallback circles so the whole layer dims as one while scrubbing.
    const dfid = divisionFillLayerId(layer.id);
    if (map.getLayer(dfid)) {
      map.setPaintProperty(dfid, "fill-opacity", dim ? DIM_OPACITY : scaled(DATA_FILL_OPACITY));
    }
    // cursor #2 + #8: scale the k-anon hatch overlay in lockstep with the data
    // fill. Without this the hatch stays at full opacity while the fill dims to
    // DIM_OPACITY during a time-scrub, making suppressed cells visually DOMINATE
    // the muted layer. The base opacity depends on whether the pattern rendered
    // (hatch) or fell back to a solid tone (no-canvas).
    const sid = DIVISION_SUPPRESS_ID(layer.id);
    if (map.getLayer(sid)) {
      const hatchBase = map.hasImage(HATCH_IMAGE_ID) ? HATCH_FILL_OPACITY : SUPPRESS_SOLID_OPACITY;
      map.setPaintProperty(sid, "fill-opacity", dim ? DIM_OPACITY : scaled(hatchBase));
    }
    const cid = choroLayerId(layer.id);
    if (!map.getLayer(cid)) return;
    // Suppressed cells were 0.45, visible 0.78; restore via the original case expr.
    map.setPaintProperty(
      cid,
      "circle-opacity",
      dim
        ? DIM_OPACITY
        : ([
            "case",
            ["==", ["get", "suppressed"], true],
            scaled(0.45),
            scaled(0.78),
          ] as unknown as number),
    );
    return;
  }
  // F1 graduated point layers: single circle per unit (no cluster layer).
  if (layer.renderMode === "graduated") {
    const pl = pointLayerId(layer.id);
    if (map.getLayer(pl)) {
      map.setPaintProperty(
        pl,
        "circle-opacity",
        dim
          ? DIM_OPACITY
          : ([
              "case",
              ["==", ["get", "suppressed"], true],
              scaled(0.45),
              scaled(0.82),
            ] as unknown as number),
      );
    }
    return;
  }
  // Reference layers (discrete pins with clustering).
  const pl = pointLayerId(layer.id);
  const cl = clusterLayerId(layer.id);
  if (map.getLayer(pl)) map.setPaintProperty(pl, "circle-opacity", dim ? DIM_OPACITY : scaled(1));
  if (map.getLayer(cl)) map.setPaintProperty(cl, "circle-opacity", dim ? DIM_OPACITY : scaled(0.8));
}

// Layer-specific point popup copy (es-AR). Coarse layers (denuncias) state the
// marker is a locality centroid, never a precise spot.
function pointPopupHtml(layer: ActiveLayer, props: Record<string, unknown>): string {
  if (layer.id === "denuncias") {
    const place = [props.locality, props.province].filter(Boolean).join(", ") || "Localidad";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(place)}</strong><br/><em style="font-size:11px;color:#94a3b8">Ubicación aproximada (centroide de localidad)</em></div>`;
  }
  if (layer.id === "refugios") {
    const name = String(props.name ?? "Refugio");
    const v = props.verified ? " · verificado" : "";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(name)}</strong><span style="color:#94a3b8">${v}</span></div>`;
  }
  // panorama-event-points Slice 1: a perdidas REAL sighting dot (LostPointProps
  // carries `token` + `lastSeenAt`). Popup: "Avistaje" + date + a subtle
  // capture-precision hint. Clicking the dot opens the DetailDrawer (D7).
  if (layer.id === "perdidas" && typeof props.token === "string") {
    const name = String(props.name ?? "Mascota");
    const when =
      typeof props.lastSeenAt === "string" && props.lastSeenAt
        ? new Date(props.lastSeenAt).toLocaleDateString("es-AR")
        : null;
    const precision =
      props.locationSource === "gps"
        ? "ubicación GPS"
        : props.locationSource === "pin_manual"
          ? "punto marcado en el mapa"
          : props.locationSource === "geocodificada"
            ? "ubicación aproximada por dirección"
            : null;
    const meta = ["Avistaje", when].filter(Boolean).join(" · ");
    const hint = precision
      ? `<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(precision)}</em>`
      : "";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(name)}</strong><br/><span style="color:#94a3b8">${escapeHtml(meta)}</span>${hint}</div>`;
  }
  // Generic: a primary label + a meta line built from common props.
  const primary = String(props.name ?? props.code ?? props.diseaseLabel ?? layer.label);
  const incidentType =
    typeof props.incidentType === "string"
      ? (INCIDENT_LABEL[props.incidentType] ?? props.incidentType)
      : undefined;
  const severity =
    typeof props.severity === "string"
      ? (SEVERITY_LABEL[props.severity] ?? props.severity)
      : undefined;
  const status =
    typeof props.status === "string" ? (PET_STATUS_LABEL[props.status] ?? props.status) : undefined;
  const meta = [incidentType, severity, status, props.diseaseLabel ? undefined : props.diseaseCode]
    .filter(Boolean)
    .join(" · ");
  return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(primary)}</strong>${meta ? `<br/><span style="color:#94a3b8">${escapeHtml(meta)}</span>` : ""}</div>`;
}
