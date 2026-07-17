"use client";

import type maplibregl from "maplibre-gl";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { CabaInset } from "@/components/panorama/CabaInset";
import {
  INCIDENT_LABEL,
  PET_STATUS_LABEL,
  SEVERITY_LABEL,
} from "@/components/panorama/DetailDrawer";
import { SavedViewsPopover } from "@/components/panorama/SavedViewsPopover";
import {
  bivariateCellColor,
  bivariateFillColorExpr,
  bivariateReadouts,
  bivariateSuppressedCodes,
  bivariateSuppressedFilter,
} from "@/components/panorama/bivariate-fill";
import { colorForValue, computeClassScale } from "@/components/panorama/class-scale";
import { resolveChoroplethEncoding } from "@/components/panorama/encoding";
import { fetchGeojsonCached } from "@/components/panorama/geojson-cache";
import {
  BUBBLE_R_MIN,
  type GraduatedScale,
  bubbleRadius,
  buildGraduatedScale,
  graduatedMaxCount,
} from "@/components/panorama/graduated-scale";
import { HATCH_IMAGE_ID, buildHatchImageData } from "@/components/panorama/hatch-pattern";
import {
  type LayerReadout,
  buildLayerReadout,
  buildPinnedPopupHtml,
  divisionReadoutDataType,
} from "@/components/panorama/map-popup";
import { buildExportFooter } from "@/components/panorama/panorama-export";
import { resolveScrubDomain } from "@/components/panorama/scale-lock";
import { type BivariateCell, riskLabel } from "@/src/modules/panorama/domain/bivariate";

import {
  type DivisionLevel,
  divisionFillColorExpr,
  divisionSuppressedFilter,
  divisionValueBounds,
  joinCellsToDivisionsMulti,
} from "@/components/panorama/division-fill";
import {
  type DivisionLabelAnchor,
  divisionLabelAnchors,
  visibleDivisionLabels,
} from "@/components/panorama/division-labels";
import {
  type Bbox,
  CABA_INSET_BBOX,
  FRAMING_SNAP_MAX_ZOOM,
  type ProvinceBbox,
  Z_DIVISIONS,
  bboxesIntersect,
  cabaInView,
  cabaInsetVisible,
  computeJurisdictionViewport,
  computePresetFrameViewport,
  computeProvinceBboxes,
  countRenderableFeatures,
  emptyOverlayMessage,
  hasProvinceChoroplethLayer,
  resetViewLabel,
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
  provinceMetaClassScale,
  provinceSeqClassScale,
} from "@/components/panorama/province-choropleth-style";
import { COLOR_NO_DATA, COLOR_SUPPRESSED } from "@/lib/analytics/viz-scales";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import { AR_BBOX } from "@/lib/ui/map-bounds";
import type { MapCamera } from "@/lib/ui/map-layer-nav";
import { escapeHtml } from "@/lib/utils/escape-html";
import { isMetaLayer } from "@/src/modules/panorama/domain/capabilities";

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

/**
 * Legend descriptor for the active locality-choropleth DIVISION fill (min/max
 * over the visible barrio/departamento polygons). Computed inside syncLayers
 * (from the rendered division data) and lifted to the console so the "Referencias"
 * rail section can render this legend off-canvas (ARCHETYPE A).
 */
export type DivisionLegendDescriptor = {
  label: string;
  unitNoun: string;
  min: number;
  max: number;
  /** Whether a value ramp is shown (there is at least one visible division). */
  hasRamp: boolean;
  /**
   * panorama redesign Theme 3 — the THRESHOLD-CLASSED breaks + colors actually
   * rendered on the map (computed from the same values + locked domain the fill
   * expression uses, so the off-canvas legend swatches never disagree with the
   * on-map class colors). Empty for a flat single-class fill.
   */
  breaks: number[];
  colors: string[];
  /**
   * cursor #2 — at least one visible division is k-anon suppressed (hatched), so
   * the legend shows the "Suprimido (k-anon)" hatch swatch.
   */
  suppressed: boolean;
};

/**
 * The THRESHOLD-CLASSED breaks + colors a SEQUENTIAL province choropleth renders,
 * keyed by layer id. Lifted from syncLayers (computed WITH the scrub-locked
 * `seqDomain` where a scrub is active) exactly like DivisionLegendDescriptor, so
 * the off-canvas province legend swatch ranges describe the PAINTED colors — even
 * mid-scrub, where a per-frame recompute would diverge from the locked map fill.
 * META'd rate layers are ALSO lifted here (their breaks are fixed by the compliance
 * target, so frame-stable and lift-parity-safe without a scrub lock).
 */
export type ProvinceSeqLegend = Record<string, { breaks: number[]; colors: string[] }>;

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
   * Q12: TRUE only for an operator whose HOME is a bounded jurisdiction (a govt
   * actor with assigned jurisdictions). Drives the reset-view control's copy so
   * only a bounded operator reads "Volver a mi jurisdicción"; admin/universal
   * reads "Vista nacional". NOT derivable from `initialBounds` alone — a DRILLED
   * admin also receives `initialBounds` (the drilled province bbox) yet has no
   * personal jurisdiction. Undefined/false → admin/universal.
   */
  boundedJurisdiction?: boolean;
  /**
   * H14 (cowork QA): frame the `selectedProvinceCode` polygon ONCE on load even
   * when a server `initialBounds` was supplied. Set by the console only for a
   * deep link that pins an explicit ?province with NO restored camera and an
   * un-pinned operator — so a shared province URL flies the camera exactly like a
   * click/select drill does, instead of stranding the view at national.
   */
  frameProvinceOnLoad?: boolean;
  /**
   * H14 (cowork QA H2): the active base is a RATE coverage layer drilled below
   * province, where coverage is not computed (repository V1 limitation). Swaps the
   * generic "Sin datos" empty overlay for an honest "la cobertura se calcula solo a
   * nivel provincia" so the operator does not read it as "no coverage here".
   */
  rateProvinceOnlyEmpty?: boolean;
  /**
   * Panorama QA 2026-07-14: TRUE when an ACTIVE layer's last fetch was the
   * server's budget/failure fallback (a timeout, not data). The empty overlay
   * must read "no pudimos calcular esta capa a tiempo", never "sin datos" —
   * the PBA cobertura drill painted a silent blank for exactly this case.
   */
  layerDegraded?: boolean;
  /**
   * Cowork QA ronda 3 §5 (privacy invariant §5 / C3): TRUE when the active base
   * layer HAS a scope-level aggregate (its KPI value exists) but every per-unit
   * cell is k-anon suppressed — so the empty overlay must read "detalle protegido
   * por privacidad", NOT "sin datos" (which contradicts the card's aggregate).
   * Computed by the console from the base layer's suppressed-cell count.
   */
  detailKAnonSuppressed?: boolean;
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
  /**
   * ARCHETYPE A (situation-room full-bleed): when true the map card fills its
   * parent's height (`h-full`) instead of the fixed `height` px. The console
   * wraps it in a viewport-relative sizer so the geography is the dominant
   * viewport element. A ResizeObserver keeps MapLibre's canvas in sync as the
   * card grows/shrinks with the viewport.
   */
  fill?: boolean;
  /**
   * ARCHETYPE A: the time scrubber, DOCKED to the map card's bottom edge (inside
   * the map's own chrome, always visible with the map) rather than floating as a
   * separate block below it. Rendered in a bordered strip under the canvas.
   */
  bottomDock?: ReactNode;
  /**
   * ARCHETYPE A: the on-canvas aggregation-level badge copy — "Provincias" at
   * national rollup, "Departamentos/partidos" / "Comunas" when drilled. Announces
   * that a map mark's MEANING changed with the granularity. Absent → no badge.
   */
  aggregationLabel?: string;
  /**
   * ARCHETYPE A: the condition chips (scope / period / data cutoff) that qualify
   * what the map is painting. Rendered in the map card's TOP chrome (left of the
   * briefing tools) so the map leads the fold — the conditions read as the map's
   * own header ("this map shows: …") instead of a separate row pushing the
   * geography below the fold.
   */
  conditionsSlot?: ReactNode;
  /**
   * v2C overlay mode: the console's top-right cluster row (scope pill +
   * period segmented). When present the map's OLD top chrome bar is NOT
   * rendered — instead a floating card overlays the canvas top-right holding
   * this slot on the first row and the map-owned actions (Copiar vista /
   * Vistas guardadas / Exportar PNG) on the second, per the v2C spec. The
   * actions stay inside SituationalMap because copy/export need map internals
   * (canvas capture, camera URL).
   */
  topRightSlot?: ReactNode;
  /**
   * ARCHETYPE A: lift the imperatively-computed legend descriptors OUT of the
   * canvas so the "Referencias" rail section can render them off-canvas. Fired
   * whenever the committed division-fill legend / graduated-symbol scale changes
   * (including → null when the layer set no longer produces one). The province
   * ramp + bivariate legends are render-derived from `layers` and don't need a
   * callback — the console recomputes them itself.
   */
  onDivisionLegendChange?: (legend: DivisionLegendDescriptor | null) => void;
  onGraduatedScaleChange?: (scale: GraduatedScale | null) => void;
  /**
   * Lift the sequential province choropleth's classed breaks/colors (keyed by
   * layer id, computed WITH the scrub-locked domain) so the off-canvas province
   * legend paints the SAME scale as the map fill — instead of recomputing a
   * live-edge scale that diverges mid-scrub. Empty object when no sequential
   * province layer is active.
   */
  onProvinceSeqLegendChange?: (legends: ProvinceSeqLegend) => void;
  /**
   * task #38 v3 rail: the console owns the chrome now (a floating vertical rail
   * replaces the legacy top toolbar / the v2C floating clusters). When true the
   * map renders NO legacy top chrome bar and NO top-right briefing card — the
   * rail (Vista/Filtro/Período/Línea de tiempo/Exportar/Actualizar/Acerca) and
   * the scope pill float over the map from the console instead. Direct
   * (non-console) callers omit it and keep the legacy bar. Default false.
   */
  overlayChrome?: boolean;
  /**
   * task #38 v3 rail: register the map's `exportPng` action so the console's
   * "Exportar" rail panel can trigger it. exportPng is map-ref coupled (needs the
   * live GL canvas), so it stays here; this callback hands a stable wrapper up to
   * the console on mount and clears it (null) on unmount.
   */
  registerExportPng?: (fn: (() => void) | null) => void;
};

// Continental Argentina centroid + a zoom that frames the mainland.
const AR_CENTER: [number, number] = [-63.6167, -40.0];
const AR_ZOOM = 3.4;
const BASEMAP_URL = "/geo/ar-provinces.geojson";
// Always-visible admin divisions for a single-province scope (PO directive
// "siempre mostrar la división"). Loaded LAZILY (same-origin — CSP allows only
// 'self') and ONLY when a province scope is active, never on the national view:
// caba-barrios (353 KB) for CABA, ar-departments (~2.0 MB on disk, filtered
// client-side to the active province) for everyone else. The national view keeps
// the provinces basemap untouched.
const CABA_BARRIOS_URL = "/geo/caba-barrios.geojson";
const AR_DEPARTMENTS_URL = "/geo/ar-departments.geojson";
// Regional context basemap: neighbouring South American countries (Chile,
// Uruguay, Brazil, Paraguay, Bolivia, Peru), heavily simplified. Drawn as a
// NON-interactive muted layer BELOW the Argentine provinces so the country no
// longer floats alone on the canvas. Malvinas is NEVER here — it renders only
// as part of Argentina (see scripts/prep-geo-context.ts).
const CONTEXT_URL = "/geo/sudamerica-context.geojson";

// map-QOL zoom-bounds clamp: the camera can never wander away from the
// national territory. AR_BBOX (lib/ui/map-bounds) padded so border
// jurisdictions aren't pinned against the viewport edge.
//
// v2C QA fix (2026-07-11) — the pads are now ASYMMETRIC and the longitude pad
// is wide, because MapLibre's maxBounds also acts as a MINIMUM-ZOOM clamp: the
// camera can never zoom out past the point where the viewport would exceed the
// bounds. Argentina is portrait (≈23° wide × 33° tall) while the v2C
// full-bleed console is landscape (≈1700×900 css px at 1920), so fitting the
// country's HEIGHT requires the viewport to span ≈60-90° of LONGITUDE. The old
// symmetric 1.5° pad (tuned for the narrow v1 map card) capped min-zoom ABOVE
// the national frame — «Vista nacional» / «← Volver a Nacional» / fitBounds
// silently no-opped and the constrained transform even mis-painted fills
// (live-QA find: unqueryable choropleth color over the open ocean). 31° of
// longitude headroom admits the national fit up to ~2560px-wide consoles while
// panning stays bounded (no roaming to other continents); latitude keeps a
// tight 2° so the country never scrolls away vertically.
const MAX_BOUNDS_PAD_LNG_DEG = 31;
const MAX_BOUNDS_PAD_LAT_DEG = 2;
const AR_MAX_BOUNDS: [[number, number], [number, number]] = [
  [AR_BBOX[0][0] - MAX_BOUNDS_PAD_LNG_DEG, AR_BBOX[0][1] - MAX_BOUNDS_PAD_LAT_DEG],
  [AR_BBOX[1][0] + MAX_BOUNDS_PAD_LNG_DEG, AR_BBOX[1][1] + MAX_BOUNDS_PAD_LAT_DEG],
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

// LIGHT operator-console palette (canvas / land / borders) — v2C retired the
// dark "situation-room" skin (PO decision 2026-07-11). Values track the
// operator DS ln-op-* tokens: canvas = --card (#ffffff), idle land = --page,
// borders = --line / --line-2, admin stroke = --faint.
const COLOR_CANVAS = "#ffffff";
const COLOR_LAND = "#eef1f4";
const COLOR_BORDER = "#dbe1e7";
// Regional-context (neighbour countries) palette: a faint neutral that sits
// just above COLOR_CANVAS, so the surrounding landmass is legible but clearly
// recedes behind Argentina.
const COLOR_CONTEXT_LAND = "#f4f6f8";
const COLOR_CONTEXT_BORDER = "#e8ecf0";
// Division outlines: a light neutral so barrio / departamento lines read over
// COLOR_LAND, but still subtle (they must never compete with the data fill on
// top). Matches the prototype's dashed-border neutral.
const COLOR_DIVISION_LINE = "#c7cfd6";
// Admin-boundary stroke for province outlines. A hierarchy-aware neutral slate
// (--faint) that reads as a boundary over both the land basemap and the data
// fill without painting near-black seams that read as CRACKS (map-polish #1).
const COLOR_ADMIN_STROKE = "#95a0a8";
// Circle-layer edge definition on the LIGHT canvas. Colored dots get a white
// halo so overlapping marks separate cleanly (the standard light-map "donut"
// separator). Suppressed cells (light COLOR_SUPPRESSED fill) instead keep a mid
// slate edge (POINT_STROKE_SUPPRESSED) — a darker edge defines the light fill,
// preserving the honest "suppressed looks different" treatment.
const POINT_STROKE = "rgba(255,255,255,0.9)";
const POINT_STROKE_SUPPRESSED = "#9aa4ad";
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
  boundedJurisdiction = false,
  frameProvinceOnLoad = false,
  rateProvinceOnlyEmpty = false,
  layerDegraded = false,
  detailKAnonSuppressed = false,
  selectedProvinceCode = null,
  selectedLocalityCenter = null,
  frame = null,
  onZoom,
  initialCamera = null,
  onCameraChange,
  highlightedUnitKey = null,
  onUnitHover,
  viewMeta,
  fill = false,
  bottomDock,
  aggregationLabel,
  conditionsSlot,
  topRightSlot,
  onDivisionLegendChange,
  onGraduatedScaleChange,
  onProvinceSeqLegendChange,
  overlayChrome = false,
  registerExportPng,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // ARCHETYPE A full-bleed: keep MapLibre's canvas sized to the (viewport-
  // relative) card as it grows/shrinks. Disconnected on unmount.
  const resizeObsRef = useRef<ResizeObserver | null>(null);
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
  // P4c (design §5.5): the wheel-hierarchy takeover (performNavStep + its
  // accumulator/cooldown/region refs) is GONE — scroll is camera-only under
  // cooperative gestures; drilling is a click (onProvinceDrill) or the switcher.
  // Time-scrub color-scale lock (fixes the flicker bug). While an as-of scrub is
  // active, the graduated bubble MAX and the choropleth/division classed BREAKS are
  // FROZEN at the live-edge frame so a datum keeps the same color/size across
  // frames. Refreshed on every live frame; keyed by layer id (province/division)
  // for a single global max (graduated). The classed layers freeze their live-edge
  // QUANTILE breaks (not a min/max domain), so classing stays quantile-balanced on
  // skew AND frame-stable across the scrub. See resolveScrubDomain (scale-lock.ts).
  const lockedGraduatedMaxRef = useRef<number | null>(null);
  const lockedDivisionBreaksRef = useRef<Map<string, number[]>>(new Map());
  const lockedProvinceBreaksRef = useRef<Map<string, number[]>>(new Map());
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
  // Same wire-once discipline for the PROVINCE choropleth fill (mirrors
  // divisionWiredRef): a layer toggle removes + re-adds the province fill, and
  // re-wiring would stack duplicate map.on('click'/'mousemove') handlers on the
  // same layer id (multi-fire popups + double hover-state writes).
  const provinceWiredRef = useRef<Set<string>>(new Set());
  // Capture initialBounds once at mount — it's a stable server-computed value
  // (jurisdiction bbox) that must not change after the map is constructed.
  const initialBoundsRef = useRef(initialBounds);
  // "Copiar vista": capture the restore camera ONCE at mount (a stable per-load
  // value decoded from the URL). When present the load handler reproduces it
  // verbatim instead of computing a frame.
  const initialCameraRef = useRef(initialCamera);
  // P4c (task_ccc31326): a preset frame set BEFORE the map finished loading (a
  // `?preset=` deep-link to a national-framed vista fires setPresetFrame at
  // mount). The [frame] effect can't apply it yet (loadedRef false) and never
  // re-fires (frame identity doesn't change), so it BUFFERS here and the load
  // handler applies it — after, and only in the absence of, a pinned camera and
  // the frameProvinceOnLoad province fit (camera-pin > province > preset frame).
  const pendingFrameRef = useRef<{ framing: PresetFraming; token: number } | null>(null);
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
  // Ref mirror of the selected locality centroid — read by the one-time load
  // handler (below) so a jurisdiction-scoped operator's initial frame flies to
  // their own locality, not just the province polygon.
  const selectedLocalityCenterRef = useRef(selectedLocalityCenter);
  selectedLocalityCenterRef.current = selectedLocalityCenter;
  // H14: whether to frame the selected province polygon on load (see the prop doc).
  const frameProvinceOnLoadRef = useRef(frameProvinceOnLoad);
  frameProvinceOnLoadRef.current = frameProvinceOnLoad;
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
  // task #36 fix 3/6 — the current division set's label anchors (with size
  // weights), stashed so a zoom change can re-paint the visible subset without a
  // full division rebuild.
  const labelAnchorsRef = useRef<DivisionLabelAnchor[]>([]);
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
  const [divisionLegend, setDivisionLegend] = useState<DivisionLegendDescriptor | null>(null);
  // #6/#7: the data-driven graduated-symbol scale (bubble legend bins + radius
  // stops), anchored on the observed maximum count across the active graduated
  // layers. State so the legend repaints when the data range changes; the map's
  // circle-radius interpolate is driven from the SAME scale in syncLayers, so a
  // legend bubble always matches its on-map bubble. Guarded setState (like
  // divisionLegend) avoids a render loop.
  const [graduatedScale, setGraduatedScale] = useState<GraduatedScale | null>(null);
  // Sequential province choropleth classed scale (breaks + colors), keyed by
  // layer id, computed WITH the scrub-locked domain in syncLayers and lifted to
  // the console so the off-canvas province legend paints the SAME scale as the
  // fill (never a live-edge recompute that diverges mid-scrub). Guarded setState.
  const [provinceSeqLegend, setProvinceSeqLegend] = useState<ProvinceSeqLegend>({});
  // ARCHETYPE A: notify the console when the imperatively-committed legend
  // descriptors change, so the off-canvas "Referencias" rail section can render
  // them. Ref mirrors keep the notify effects from re-subscribing on every
  // parent render (the callbacks are recreated each render in the console).
  const onDivisionLegendChangeRef = useRef(onDivisionLegendChange);
  onDivisionLegendChangeRef.current = onDivisionLegendChange;
  const onGraduatedScaleChangeRef = useRef(onGraduatedScaleChange);
  onGraduatedScaleChangeRef.current = onGraduatedScaleChange;
  const onProvinceSeqLegendChangeRef = useRef(onProvinceSeqLegendChange);
  onProvinceSeqLegendChangeRef.current = onProvinceSeqLegendChange;
  useEffect(() => {
    onDivisionLegendChangeRef.current?.(divisionLegend);
  }, [divisionLegend]);
  useEffect(() => {
    onGraduatedScaleChangeRef.current?.(graduatedScale);
  }, [graduatedScale]);
  useEffect(() => {
    onProvinceSeqLegendChangeRef.current?.(provinceSeqLegend);
  }, [provinceSeqLegend]);
  // task #36 fix 1 — whether CABA is inside the current viewport. Flip-gated:
  // the state (and its re-render) updates ONLY when the boolean crosses, so a
  // pure pan that keeps CABA in/out of view costs nothing. The updater is a
  // hoisted function declared below (like syncLayers) so the one-time
  // construction effect can call it without a reactive-dep lint flag.
  const [cabaViewportInView, setCabaViewportInView] = useState(true);
  const cabaInViewRef = useRef(true);

  // --- Resilience (task #39 hardening) -------------------------------------
  // A monotonic epoch that forces the one-time construction effect to tear the
  // map down and rebuild it from scratch — the single recovery primitive shared
  // by BOTH the WebGL-context-loss handler and the basemap-fetch retry. A rebuild
  // re-inits the GL context, re-fetches the basemap, re-adds every source/layer/
  // image and re-applies the camera captured below.
  const [mapEpoch, setMapEpoch] = useState(0);
  const setMapEpochRef = useRef(setMapEpoch);
  setMapEpochRef.current = setMapEpoch;
  // The camera to restore after a rebuild (WebGL restore / basemap retry), so
  // recovery lands EXACTLY where the operator was rather than snapping to the
  // national frame. Captured before a rebuild; consumed once by the load handler.
  const cameraBeforeReinitRef = useRef<MapCamera | null>(null);
  // The basemap (ar-provinces) GeoJSON fetch FAILED — the country outline never
  // loaded, so the canvas would be an honest-less blank. Drives a visible es-AR
  // error overlay with a retry instead of a silent empty map.
  const [basemapError, setBasemapError] = useState(false);
  const setBasemapErrorRef = useRef(setBasemapError);
  setBasemapErrorRef.current = setBasemapError;
  // The WebGL context was LOST (GPU reset, tab backgrounded too long, driver
  // hiccup). We preventDefault the loss so the browser attempts a restore, show a
  // recovering overlay, and rebuild on restore. A manual "Recargar" is offered as
  // a fallback if the automatic restore never fires.
  const [glLost, setGlLost] = useState(false);
  // Stable handler refs so the construction-effect cleanup can detach the GL
  // listeners from the canvas before the map (and its canvas) is destroyed.
  const glLostHandlerRef = useRef<((e: Event) => void) | null>(null);
  const glRestoredHandlerRef = useRef<(() => void) | null>(null);

  /** Capture the live camera (CPU-side transform, valid even after GL loss) so a
   * rebuild restores the exact frame. Hoisted like the other map helpers so the
   * construction effect can call it without a reactive-dep flag. */
  function captureCameraForReinit(map: maplibregl.Map): void {
    try {
      const c = map.getCenter();
      cameraBeforeReinitRef.current = { zoom: map.getZoom(), lng: c.lng, lat: c.lat };
    } catch {
      // Transform unreadable — the rebuild falls back to the computed frame.
    }
  }

  // --- Map construction (basemap only). Built at mount; REBUILT on `mapEpoch`. -
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mapEpoch` is the intentional rebuild trigger — bumping it tears the map down (cleanup) and re-inits it for WebGL-context restore / basemap retry. The other referenced helpers are hoisted + stable.
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
        // the map. Help text localized below. P4c (design §5.5): EVERY operator
        // gets this — the admin wheel-hierarchy takeover is gone; scroll is
        // camera-only and drilling is a click.
        cooperativeGestures: true,
        // map-QOL zoom bounds: pan/zoom clamped to the national territory —
        // the operator can never get lost in the open ocean or zoom out to
        // a meaningless world view.
        maxBounds: AR_MAX_BOUNDS,
        minZoom: MIN_ZOOM,
        // panorama redesign Theme 2 (anchor the camera): a manual-zoom CEILING so
        // the operator can never zoom past the deepest programmatic frame into an
        // empty, data-less void. Set just above FRAME_MAX_ZOOM (the ceiling every
        // programmatic fitBounds uses) so jurisdiction autozoom, preset frames and
        // the reset button all still land normally — only the free wheel-zoom roam
        // is bounded.
        maxZoom: FRAME_MAX_ZOOM + 2,
        // preserveDrawingBuffer stays OFF (GL memory + compositor optimizations
        // the always-on flag disables) — only "Exportar PNG" needs the buffer,
        // and exportPng() below captures it on-demand instead: it forces a
        // repaint and reads the canvas from INSIDE the resulting 'render'
        // callback, synchronously before the browser clears the buffer for the
        // next frame (the standard maplibre-gl v5 pattern for capturing a
        // non-preserved canvas).
        canvasContextAttributes: { preserveDrawingBuffer: false },
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
          // FullscreenControl + Popup close button — otherwise a govt user sees
          // "Enter fullscreen" / "Exit fullscreen" tooltips and a "Close popup"
          // aria-label in English (recorrido-80 QA: map controls in English).
          "FullscreenControl.Enter": "Pantalla completa",
          "FullscreenControl.Exit": "Salir de pantalla completa",
          "Popup.Close": "Cerrar",
          // cooperativeGestures overlay copy (es-AR) — shown when the operator
          // scrolls over the canvas without the modifier key.
          "CooperativeGesturesHandler.WindowsHelpText": "Usá Ctrl + rueda para hacer zoom",
          "CooperativeGesturesHandler.MacHelpText": "Usá ⌘ + rueda para hacer zoom",
          "CooperativeGesturesHandler.MobileHelpText": "Usá dos dedos para mover el mapa",
        },
      });
      mapRef.current = map;
      // Hardening test seam (task #39 chaos harness, hardening review H1): expose
      // the LIVE MapLibre instance so the harness can assert the camera via
      // getCenter()/getZoom() every round, not only when the URL happens to carry
      // z/lat/lng params. Read-only surface (no setter path exposed); harmless in
      // production since nothing but the harness ever reads it.
      if (typeof window !== "undefined") {
        (window as unknown as { __PANORAMA_MAP__?: maplibregl.Map }).__PANORAMA_MAP__ = map;
      }
      // task #39 hardening — WebGL context-loss recovery. A GPU reset / driver
      // hiccup / long-backgrounded tab fires `webglcontextlost` on the canvas;
      // without preventDefault the browser will NOT try to restore and the map is
      // dead pixels forever. We preventDefault (opt into restore), capture the
      // camera (CPU-side transform survives GL loss), and show a recovering
      // overlay; on `webglcontextrestored` we REBUILD the map (epoch bump) so our
      // custom sources/layers/images all come back cleanly and the camera lands
      // where the operator left it.
      const onContextLost = (e: Event) => {
        e.preventDefault();
        captureCameraForReinit(map);
        setGlLost(true);
      };
      const onContextRestored = () => {
        setGlLost(false);
        setMapEpochRef.current((n) => n + 1);
      };
      glLostHandlerRef.current = onContextLost;
      glRestoredHandlerRef.current = onContextRestored;
      map.getCanvas().addEventListener("webglcontextlost", onContextLost, false);
      map.getCanvas().addEventListener("webglcontextrestored", onContextRestored, false);
      // ARCHETYPE A full-bleed: the card height is now viewport-relative, so a
      // window resize (or a rail/controls reflow) changes the canvas size. Keep
      // MapLibre's GL viewport in sync — without this the map stretches/letterboxes
      // until the next zoom gesture. Cheap: fires only on actual size changes.
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        const ro = new ResizeObserver(() => mapRef.current?.resize());
        ro.observe(containerRef.current);
        resizeObsRef.current = ro;
      }
      // v2C: the zoom column lives BOTTOM-RIGHT (the top-right corner belongs
      // to the scope/period/actions cluster). Offset above the floating dock
      // bar via the [data-pano-map] CSS rule in globals.css.
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      // map-QOL read-only controls — a metric distance scale + a fullscreen
      // toggle, both alongside the zoom column (bottom-right). These are pure
      // camera/UI chrome: no scope, no data, no writes to our ViewState. The
      // ScaleControl reads the camera; FullscreenControl fullscreens the map
      // CONTAINER. exportPng captures map.getCanvas() (the GL canvas, unaffected by
      // the container going fullscreen), so PNG export keeps targeting the right
      // element in either mode.
      map.addControl(
        new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
        "bottom-right",
      );
      map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
      // a11y (review round 2): MapLibre stamps its own <canvas> with tabIndex=0,
      // so the map was TWO redundant Tab stops — the role="application" wrapper
      // (which owns the arrow-key pan via handleCanvasKeyDown) AND the inner
      // canvas. Drop the canvas out of the tab order so the widget is a SINGLE
      // Tab stop; the labeled zoom buttons stay tab-reachable on their own.
      try {
        map.getCanvas().setAttribute("tabindex", "-1");
      } catch {
        // Canvas not ready in some headless/test contexts — non-fatal.
      }
      // panorama-ia-v2 §1.1: report the camera zoom after every zoom gesture so
      // the console can derive the aggregation level (province → locality once
      // the camera crosses Z_LOCALITY). Fires once per gesture, not per frame.
      map.on("zoomend", () => {
        const z = map.getZoom();
        onZoomRef.current?.(z);
        // cursor #7: warm the department GeoJSON cache BEFORE the camera crosses
        // Z_DIVISIONS so outlines fade in immediately on drill instead of popping
        // after the ~2.0 MB file resolves post-moveend. Same-origin, cached once.
        if (z >= Z_DIVISIONS - 0.5 && departmentsRawRef.current === null) {
          void fetchGeojsonFeatures(AR_DEPARTMENTS_URL).then((raw) => {
            if (raw !== null && departmentsRawRef.current === null) {
              departmentsRawRef.current = raw;
            }
          });
        }
        // task #36 fix 3/6 — re-paint the division labels for the new zoom: they
        // stay hidden until the camera is close enough to read them, then reveal
        // largest-first. Cheap (marker churn only); no division rebuild.
        if (mlRef.current) paintDivisionLabels(map, mlRef.current);
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
        // task #36 fix 1 — re-evaluate whether CABA is in view after every camera
        // settle (pan or zoom). Flip-gated, so a pan that keeps CABA on the same
        // side of the viewport edge triggers no re-render.
        updateCabaInView(map);
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
          // task #39 hardening — the basemap loaded: clear any prior error state
          // (a retry that succeeded) so the overlay never lingers over a live map.
          setBasemapErrorRef.current(false);
        } catch {
          // task #39 hardening — the country outline never loaded. This is NOT a
          // silent degrade: surface an honest es-AR error overlay with a retry so
          // the operator is never left staring at a blank canvas wondering if the
          // map is empty or broken. The retry rebuilds the map (epoch bump), which
          // re-runs this fetch (the geojson cache evicts rejections, so a transient
          // failure can genuinely recover).
          if (!cancelled) setBasemapErrorRef.current(true);
        }
        if (cancelled) return;
        loadedRef.current = true;
        syncLayers();
        // If a province scope is already active at mount, load its divisions.
        void syncDivisions();
        // Prefer the server-computed jurisdiction bbox (govt) over the
        // data-extent bbox (admin/national). Falls back to the data-extent
        // when no initialBounds was supplied (admin = national view).
        let bbox = initialBoundsRef.current ?? layersBbox(layersRef.current);
        // Widest-jurisdiction default: a jurisdiction-scoped operator whose
        // server bbox is null (no initialBounds AND the active layer draws no
        // data extent — e.g. a choropleth with null geometry) would otherwise
        // leave nationalBboxRef null, so BOTH this initial frame AND any later
        // national-vista (computePresetFrameViewport reads nationalBboxRef) fall
        // back to the whole-country AR_BBOX — yanking a scoped operator out to
        // the national view. Derive the operator's own extent from the loaded
        // province polygon so nationalBboxRef holds THEIR extent, never AR_BBOX.
        if (bbox == null && selectedProvinceRef.current && basemapFeaturesRef.current.length > 0) {
          const vp = computeJurisdictionViewport(
            selectedProvinceRef.current,
            null,
            basemapFeaturesRef.current,
            AR_BBOX,
          );
          if (vp.kind === "fitBounds") bbox = vp.bbox;
        }
        if (bbox) {
          // A1 PR-7: store as the national fallback for subsequent autozoom.
          nationalBboxRef.current = bbox;
        }
        // "Copiar vista": a shared URL that pinned an exact camera wins over the
        // computed frame — reproduce it verbatim with ONE jumpTo so the reloaded
        // view matches the sender's. Otherwise fall through to the computed frame.
        // (The A1 autozoom effect early-returns at mount — it only handles later
        // jurisdiction picks — so it never clobbers this restored camera.)
        // task #39 hardening — a recovery rebuild (WebGL restore / basemap retry)
        // captured the live camera; it WINS over the mount-time shared camera so
        // recovery lands exactly where the operator was, then is consumed once.
        const restoredCamera = cameraBeforeReinitRef.current ?? initialCameraRef.current;
        cameraBeforeReinitRef.current = null;
        if (restoredCamera) {
          map.jumpTo({
            center: [restoredCamera.lng, restoredCamera.lat],
            zoom: restoredCamera.zoom,
          });
        } else {
          // Click-to-drill (task #55): when the operator drilled into a province
          // (explicit `?province`, no server jurisdiction bbox), FRAME that
          // province polygon on load — the drill committed via navigation, so the
          // reloaded map must land fitted to the province, not the national data
          // extent. LOCALITY-AWARE (widest-jurisdiction default, d4ccdb2): when a
          // locality center is ALSO selected, computeJurisdictionViewport below
          // returns a `flyTo` to the locality centroid instead — captured as
          // `localityFly` and applied in preference to this province fitBounds, so
          // an admin `?province&locality` deep-link (or a single-locality govt
          // operator) lands on the named locality, not just the province polygon.
          let frameBbox = bbox;
          // A single-locality scoped operator flies to their locality centroid
          // (computeJurisdictionViewport returns a `flyTo` for a locality center);
          // captured here so it wins over the province fitBounds below.
          let localityFly: { center: [number, number]; zoom: number } | null = null;
          if (
            // H14: an explicit deep-linked province frames its polygon on load even
            // when a server initialBounds was supplied (admin ?province derives a
            // centroid bbox); otherwise keep the original guard (govt jurisdiction
            // bbox wins). Either way, only when the basemap polygons are loaded.
            (frameProvinceOnLoadRef.current || !initialBoundsRef.current) &&
            selectedProvinceRef.current &&
            basemapFeaturesRef.current.length > 0
          ) {
            const vp = computeJurisdictionViewport(
              selectedProvinceRef.current,
              selectedLocalityCenterRef.current,
              basemapFeaturesRef.current,
              bbox ?? AR_BBOX,
            );
            if (vp.kind === "fitBounds") frameBbox = vp.bbox;
            else localityFly = { center: vp.center, zoom: vp.zoom };
          } else if (pendingFrameRef.current != null) {
            // P4c (task_ccc31326): a pre-load preset frame (a `?preset=`
            // deep-link to a national-framed vista) buffered by the [frame]
            // effect — resolve and apply it now that the map can fit. The
            // pinned-camera and province-drill branches above take precedence.
            const vp = computePresetFrameViewport(
              pendingFrameRef.current.framing,
              nationalBboxRef.current,
              AR_BBOX,
            );
            if (vp?.kind === "fitBounds") frameBbox = vp.bbox;
          }
          if (localityFly) {
            map.flyTo({ center: localityFly.center, zoom: localityFly.zoom, animate: false });
          } else if (frameBbox) {
            map.fitBounds(frameBbox, {
              padding: FRAME_PADDING,
              animate: false,
              // Magnetic snap: a first fit that would land right on the flip is
              // clamped just below it so the derived level starts unambiguous.
              maxZoom: framingMaxZoom(map, frameBbox),
            });
          }
        }
        // The buffered pre-load frame is consumed (applied or superseded) once.
        pendingFrameRef.current = null;
        // task #36 fix 1 — seed the CABA-in-view flag from the actual initial
        // frame (a govt jurisdiction that fits away from CABA hides the inset
        // immediately, instead of showing it until the first user gesture).
        updateCabaInView(map);
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
      const canvas = mapRef.current?.getCanvas();
      // task #39 hardening — detach the WebGL context listeners before the canvas
      // is destroyed (belt-and-braces; map.remove() also tears down the canvas).
      if (glLostHandlerRef.current) {
        canvas?.removeEventListener("webglcontextlost", glLostHandlerRef.current);
        glLostHandlerRef.current = null;
      }
      if (glRestoredHandlerRef.current) {
        canvas?.removeEventListener("webglcontextrestored", glRestoredHandlerRef.current);
        glRestoredHandlerRef.current = null;
      }
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      if (typeof window !== "undefined") {
        (window as unknown as { __PANORAMA_MAP__?: maplibregl.Map }).__PANORAMA_MAP__ = undefined;
      }
    };
    // Built once at mount; REBUILT when `mapEpoch` bumps (WebGL-context restore /
    // basemap retry) — the cleanup above fully tears the old map down first.
  }, [mapEpoch]);

  // task #36 fix 1 — recompute whether CABA is inside the current viewport and,
  // when the boolean flips, push it into state so the inset predicate re-renders.
  // Hoisted (declared here, after the construction effect) so that effect can call
  // it without biome flagging a reactive dependency (matches the syncLayers idiom).
  function updateCabaInView(map: maplibregl.Map) {
    const b = map.getBounds();
    const next = cabaInView([
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ]);
    if (next !== cabaInViewRef.current) {
      cabaInViewRef.current = next;
      setCabaViewportInView(next);
    }
  }

  // --- Reconcile layers whenever the prop changes. -------------------------
  // `layers` IS the trigger; syncLayers reads the latest via layersRef, so the
  // ref-read deps are intentionally omitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layers is the intended trigger.
  useEffect(() => {
    if (loadedRef.current) syncLayers();
    // The pinned popup is a frozen HTML snapshot: a layer toggle, level flip,
    // scope drill, or as-of scrub all change `layers` but leave STALE numbers
    // visible. A popup that cannot refresh itself must not survive the change —
    // close it so the operator re-clicks for fresh values (honest over stale).
    pinnedPopupRef.current?.remove();
  }, [layers]);

  // Esc closes the pinned popup even when focus has left the map subtree. The
  // onKeyDown on the map container (handleMapKeyDown) only fires while focus is
  // inside it; after pinning, focus can be anywhere, so mirror the shortcut at
  // the document level. Cheap no-op when nothing is pinned; cleaned up on unmount.
  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && pinnedPopupRef.current?.isOpen()) {
        pinnedPopupRef.current.remove();
      }
    }
    document.addEventListener("keydown", onDocKeyDown);
    return () => document.removeEventListener("keydown", onDocKeyDown);
  }, []);

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
    // The national bbox is only the FALLBACK for a no-selection (return-to-
    // national) frame; a province/locality drill derives its viewport from the
    // basemap polygon / locality centroid and never consults it. It legitimately
    // stays null on an admin national board whose only active layer is a province
    // choropleth: those features carry `geometry: null` (they color the basemap by
    // data-join), so `layersBbox` returns null AND no server `initialBounds` is
    // supplied — the load handler therefore never captures a national bbox. Gating
    // the WHOLE effect on it (`if (!nationalBbox) return`) silently disabled
    // jurisdiction autozoom for the JurisdictionSwitcher / "← Volver" path, so a
    // province committed via the picker updated every projection EXCEPT the camera.
    // (The map-click drill was unaffected — `drillToProvince` fits imperatively via
    // `provinceBboxesRef`.) Fall back to the static AR extent so a province-scope
    // commit always reframes; the national fallback is only reached with no scope.
    //
    // v2C QA fix (2026-07-11): the no-selection (return-to-national) frame now
    // uses the STATIC national extent, never nationalBboxRef — that ref is the
    // DATA-EXTENT snapshot captured at map load, and on a camera-restored
    // session it equals the restored regional view, so «← Volver a Nacional»
    // re-framed to the same regional camera (a visible no-op). The reset
    // promises the national picture; only the static extent delivers it.
    // P4c: the no-scope fallback frame is always the STATIC national extent —
    // the wheel takeover's region camera focus is gone with it.
    const nationalBbox: [[number, number], [number, number]] = AR_BBOX;

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
    if (!loadedRef.current) {
      // P4c (task_ccc31326): the map is still loading — buffer the frame; the
      // load handler applies it (unless a pinned camera / province fit wins).
      pendingFrameRef.current = frame;
      return;
    }
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
      breaks: number[];
      colors: string[];
      suppressed: boolean;
    } | null = null;
    // The sequential province choropleth classed scale(s), keyed by layer id and
    // computed WITH the scrub-locked domain — lifted so the off-canvas province
    // legend paints the SAME breaks/colors the fill does (parity with the
    // division legend), instead of a live-edge recompute that diverges mid-scrub.
    const nextProvinceSeqLegend: ProvinceSeqLegend = {};

    // Add or update active layers.
    for (const layer of active) {
      const data = layer.features as unknown as GeoJSON.FeatureCollection;
      // U5: a province-level choropleth fills the SHARED basemap polygons — it
      // has no own GeoJSON source, so it can't be reconciled via getSource. We
      // recompute its data-driven color expression in place on every sync.
      if (layer.geomType === "choropleth" && layer.level === "province") {
        // Sequential province layers freeze their classed BREAKS across a scrub.
        // Rate layers already render on target-anchored META breaks (frame-stable
        // by construction), so they need no lock.
        // P2: the isMeta predicate now reads the ONE shared registry helper
        // (capabilitiesFor's `encoding.kind` source) instead of a local copy.
        const isMeta = isMetaLayer(layer);
        let seqBreaks: number[] | null = null;
        if (isMeta && typeof layer.complianceTarget === "number") {
          // META'd rate layer: the classed scale's breaks are fixed by the target
          // ([0.5T, 0.75T, T]), so they are frame-stable and need no scrub lock.
          // Lift the SAME scale the fill renders so the off-canvas legend swatch
          // ranges describe the painted class colors (parity with the fill).
          const metaScale = provinceMetaClassScale(layer.features, layer.complianceTarget);
          if (metaScale) {
            nextProvinceSeqLegend[layer.id] = {
              breaks: metaScale.breaks,
              colors: metaScale.colors,
            };
          }
        } else {
          // MAP-1 fix: derive the live-edge QUANTILE breaks from the current frame,
          // then freeze THOSE across a scrub (not a min/max domain), so classing is
          // quantile-balanced AND frame-stable. resolveScrubDomain reuses the frozen
          // breaks while scrubbing and refreshes them at the live edge.
          const liveBreaks = provinceSeqClassScale(layer.features, null)?.breaks ?? null;
          const lock = resolveScrubDomain({
            live: liveBreaks && liveBreaks.length > 0 ? liveBreaks : null,
            scrubbing,
            locked: lockedProvinceBreaksRef.current.get(layer.id) ?? null,
          });
          if (lock.locked) lockedProvinceBreaksRef.current.set(layer.id, lock.locked);
          else lockedProvinceBreaksRef.current.delete(layer.id);
          seqBreaks = lock.domain;
          // Lift the SAME classed scale the fill renders (same values + frozen
          // breaks) so the off-canvas legend swatches match the painted colors.
          const seqScale = provinceSeqClassScale(layer.features, seqBreaks);
          if (seqScale) {
            nextProvinceSeqLegend[layer.id] = { breaks: seqScale.breaks, colors: seqScale.colors };
          }
        }
        if (mountedRef.current.has(layer.id)) {
          updateProvinceChoroplethLayer(map, layer, seqBreaks);
        } else {
          addProvinceChoroplethLayer(map, layer, seqBreaks);
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
        // Lock the division-fill classed BREAKS across a scrub so a division keeps
        // the same color across as-of frames (the legend swatches use the SAME
        // frozen breaks, so swatch and map agree). MAP-1 fix: freeze the live-edge
        // QUANTILE breaks, not a min/max domain — classing stays quantile-balanced
        // on skew AND frame-stable.
        const liveDivBreaks = computeClassScale([...join.values.values()], {
          lockedBreaks: null,
        }).breaks;
        const divLock = resolveScrubDomain({
          live: liveDivBreaks.length > 0 ? liveDivBreaks : null,
          scrubbing,
          locked: lockedDivisionBreaksRef.current.get(layer.id) ?? null,
        });
        if (divLock.locked) lockedDivisionBreaksRef.current.set(layer.id, divLock.locked);
        else lockedDivisionBreaksRef.current.delete(layer.id);
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
        const bounds = divisionValueBounds(join.values);
        const hasSuppressed = join.suppressed.size > 0;
        if (bounds || hasSuppressed) {
          // Theme 3: resolve the SAME classed scale the fill expression renders
          // (same values + frozen breaks) so the legend swatches match the map.
          const divScale = computeClassScale([...join.values.values()], {
            lockedBreaks: divLock.domain ?? null,
          });
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
            breaks: divScale.breaks,
            colors: divScale.colors,
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
          prev.breaks.join(",") === nextDivisionLegend.breaks.join(",") &&
          prev.suppressed === nextDivisionLegend.suppressed);
      return same ? prev : nextDivisionLegend;
    });

    // #6/#7: commit the graduated-symbol scale for the legend, guarded (same
    // reason as divisionLegend) — a stable maxValue must not re-trigger a render.
    setGraduatedScale((prev) => (prev?.maxValue === gradScale.maxValue ? prev : gradScale));

    // Commit the sequential province legend scale(s), guarded — an unchanged set
    // of breaks/colors must not re-trigger a render (syncLayers runs in effects).
    setProvinceSeqLegend((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextProvinceSeqLegend);
      const same =
        prevKeys.length === nextKeys.length &&
        nextKeys.every((id) => {
          const a = prev[id];
          const b = nextProvinceSeqLegend[id];
          return (
            a !== undefined &&
            a.breaks.join(",") === b.breaks.join(",") &&
            a.colors.join(",") === b.colors.join(",")
          );
        });
      return same ? prev : nextProvinceSeqLegend;
    });

    // C4a — z-order: MapLibre draws layers in INSERTION order, so a fill added on
    // a LATER sync (e.g. a base choropleth whose features resolved after the
    // signal points, or a level toggle that re-adds the fill) lands ON TOP of the
    // point marks added earlier — dropping outbreak/signal POINTS below the
    // choropleth. Structural fix: after every sync, raise every point/circle MARK
    // above all fills, in active order (base marks first, overlay/signal marks
    // last → topmost). Order-of-addition no longer decides stacking.
    raiseMarksAboveFills(map, active);

    // cursors #4 + #5: reconcile basemap luminance + border hierarchy after every
    // layer change (a province choropleth toggling on/off flips the basemap dim).
    updateChromeHierarchy(map);
  }

  /**
   * C4a — enforce point-marks-above-fills stacking. Marks are raised in active
   * order (last = overlay/signal marks topmost among marks) but anchored BELOW
   * the division chrome: `moveLayer(id)` with no beforeId would lift a mark to
   * the absolute top, above DIVISION_LINE_ID/DIVISION_HOVER_ID, breaking the
   * crisp outlines + hover highlight. Anchoring to DIVISION_LINE_ID (the lowest
   * chrome layer) keeps fills < marks < outline < hover. Idempotent and cheap;
   * runs at the end of every syncLayers pass so the invariant holds at initial
   * mount AND after any toggle / data resolution.
   */
  function raiseMarksAboveFills(map: maplibregl.Map, active: readonly ActiveLayer[]) {
    const chromeAnchor = map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined;
    for (const layer of active) {
      // Point layers: cluster bubbles (reference/points mode) + the point circles.
      // Choropleth layers only expose a mark when rendered as centroid circles
      // (locality level, no division fill) via choroLayerId; province FILLS
      // (provinceFillLayerId) are NOT marks and stay below by omission.
      const markIds =
        layer.geomType === "point"
          ? [clusterLayerId(layer.id), pointLayerId(layer.id)]
          : [choroLayerId(layer.id)];
      for (const id of markIds) {
        if (map.getLayer(id)) map.moveLayer(id, chromeAnchor);
      }
    }
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

  // Compute + stash the label anchors for a division set, then paint the subset
  // legible at the current zoom (task #36 fix 3/6). Called on each division sync.
  function renderDivisionLabels(
    map: maplibregl.Map,
    ml: typeof maplibregl,
    features: readonly DivisionRawFeature[],
  ) {
    labelAnchorsRef.current = divisionLabelAnchors(features);
    paintDivisionLabels(map, ml);
  }

  // Re-paint the division labels for the CURRENT zoom from the stashed anchors.
  // Cheap (marker create/remove only) so it can run on every zoom settle: labels
  // stay hidden until the camera is close enough to read them, and the largest
  // units surface first (progressive disclosure). Hoisted so the one-time
  // construction effect's zoom handler can call it lint-clean.
  function paintDivisionLabels(map: maplibregl.Map, ml: typeof maplibregl) {
    clearDivisionLabels();
    const anchors = labelAnchorsRef.current;
    if (anchors.length === 0) return;
    for (const a of visibleDivisionLabels(anchors, map.getZoom())) {
      const el = document.createElement("div");
      el.textContent = a.name;
      el.setAttribute("aria-hidden", "true");
      // LIGHT-theme label (dark skin retired 2026-07-11): dark slate ink with a
      // white halo so the name reads over BOTH the light land and the saturated
      // choropleth fills. The old #cbd5e1-on-#0b1020 treatment was a dark-skin
      // leftover, near-invisible on the v2C light canvas.
      el.style.cssText =
        "pointer-events:none;user-select:none;white-space:nowrap;font:600 11px/1 system-ui,sans-serif;color:#0f172a;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,0 1px 2px rgba(255,255,255,0.9);";
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
    // Fix: time-scrub color-scale lock — the frozen live-edge quantile breaks (or
    // null at the live edge, where the expr computes quantiles from `values`).
    lockedBreaks?: readonly number[] | null,
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
            "fill-color": divisionFillColorExpr(values, lockedBreaks),
            "fill-opacity": DATA_FILL_OPACITY,
          },
        },
        map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined,
      );
    } else {
      map.setPaintProperty(fillId, "fill-color", divisionFillColorExpr(values, lockedBreaks));
    }
    wireDivisionInteractions(map, layer);
  }

  function updateDivisionFillLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    values: Map<string, number>,
    lockedBreaks?: readonly number[] | null,
  ) {
    const fillId = divisionFillLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, "fill-color", divisionFillColorExpr(values, lockedBreaks));
    } else {
      addDivisionFillLayer(map, layer, values, lockedBreaks);
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
          // Division-level values of a "rate" layer are raw counts, not rates —
          // see divisionReadoutDataType. Passing l.dataType straight through
          // formatted a count as a percentage.
          dataType: divisionReadoutDataType(l.dataType),
          // ...and a rate's compliance target ("meta 80%") means nothing against
          // a raw count, so it must not ride along either.
          complianceTarget: l.dataType === "rate" ? undefined : l.complianceTarget,
          // ...and the LABEL must say it is a count, or a demoted "72" sits under the
          // SAME name as the scope panel's "64,3%" (QA ronda 2026-07-16, PO fix).
          demotedToCount: l.dataType === "rate",
        }),
      );
    }
    return out;
  }

  // Aggregate the readout across ALL active POINT (graduated) + locality
  // graduated-symbol choropleth layers at ONE clicked unit, matched by its place
  // label — the multi-layer readout for a bubble/circle pin (the point-mode
  // counterpart to provinceReadouts / divisionReadouts). The clicked layer always
  // matches its own feature, so it is always present; sibling point/circle layers
  // join the readout when they carry a feature at the same unit label.
  function pointReadouts(clickedPlace: string): LayerReadout[] {
    const out: LayerReadout[] = [];
    for (const l of layersRef.current) {
      const isGraduatedPoint = l.geomType === "point" && l.renderMode === "graduated";
      const isSymbolChoro = l.geomType === "choropleth" && l.level === "locality";
      if (!isGraduatedPoint && !isSymbolChoro) continue;
      let matched: { value: number | null; suppressed: boolean } | null = null;
      for (const f of l.features.features) {
        const p = f.properties as {
          place?: string;
          locality?: string;
          province?: string;
          count?: number | null;
          value?: number | null;
          suppressed?: boolean;
        };
        const placeLabel = p.place ?? [p.locality, p.province].filter(Boolean).join(", ");
        if (placeLabel && placeLabel === clickedPlace) {
          matched = {
            value: (isGraduatedPoint ? p.count : p.value) ?? null,
            suppressed: p.suppressed === true,
          };
          break;
        }
      }
      if (!matched) continue;
      // A locality-level CHOROPLETH drawn as circles carries the same drilled
      // COUNT as divisionReadouts — the repository's V1 metric swap does not care
      // how the cell is painted. So the same demotion applies, or a count renders
      // as "11.205%" with a "meta 80%" beside it the moment divisions are not in
      // fill mode (or a cell lands in join.unmatched and falls back to a circle).
      //
      // Graduated POINTS are exempt on purpose: `reunificacion` is a point layer
      // whose locality-level value is a REAL ratePct, and demoting it would break
      // the honest case to fix the dishonest one.
      const isDrilledChoropleth = isSymbolChoro;
      out.push(
        buildLayerReadout({
          label: l.label,
          value: matched.value,
          suppressed: matched.suppressed,
          dataType: isDrilledChoropleth ? divisionReadoutDataType(l.dataType) : l.dataType,
          complianceTarget:
            isDrilledChoropleth && l.dataType === "rate" ? undefined : l.complianceTarget,
          // Same demotion as divisionReadouts: a locality-choropleth-as-circles rate
          // value is a raw count, so its label must say "(conteo)" (QA ronda 2026-07-16).
          demotedToCount: isDrilledChoropleth && l.dataType === "rate",
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
    // Pinning supersedes the transient hover preview — dismiss it so the two
    // popups never show simultaneously (a scoped-province click pinned WITHOUT
    // clearing the hover popup, leaving both on screen).
    popupRef.current?.remove();
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
            // Province context for the drawer header. Available when the map is
            // drilled into one province (the barrio/department case); null at
            // national LOD scope, where no single province owns the click.
            province: provinceByCode(selectedProvinceRef.current)?.name ?? null,
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
        // Theme 3: raise the data-fill opacity (was 0.82) so a colored dot reads
        // solid, not translucent; suppressed dots stay clearly lower (was 0.45)
        // but crisp, not a faint smudge.
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.6, 0.92],
        "circle-radius": graduatedRadiusExpr(radiusStops),
        // White halo on a colored fill; mid-slate edge on the light suppressed
        // fill — each keeps a crisp, contrasting outline on the light canvas.
        "circle-stroke-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          POINT_STROKE_SUPPRESSED,
          POINT_STROKE,
        ],
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
        // Theme 3: raise the data-fill opacity (was 0.78) so a centroid dot reads
        // solid against the dark canvas; suppressed dots stay clearly lower (was
        // 0.45) but crisp, not a faint smudge.
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.6, 0.92],
        "circle-radius": [
          "case",
          ["==", ["get", "suppressed"], true],
          5,
          ["interpolate", ["linear"], ["coalesce", ["get", "value"], 0], 0, 6, 50, 16, 250, 26],
        ],
        // White halo on a colored fill; mid-slate edge on the light suppressed
        // fill — each keeps a crisp, contrasting outline on the light canvas.
        "circle-stroke-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          POINT_STROKE_SUPPRESSED,
          POINT_STROKE,
        ],
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
   * Rate layers with a complianceTarget render as the classed-step META scale (the
   * 4 threshold classes anchored on the target); all others keep the sequential
   * classed path. */
  function provinceColorExprForLayer(layer: ActiveLayer, seqBreaks?: readonly number[] | null) {
    // task #63: a bivariate layer paints from its precomputed class matrix (a
    // `match` on the polygon code → the 3×3 palette), not from a single value.
    if (layer.bivariateCells) {
      return bivariateFillColorExpr(layer.bivariateCells);
    }
    // P3: the sequential + META fills resolve through the ONE first-class
    // ChoroplethEncoding value object, so the fill, the off-canvas legend, and the
    // CABA-inset flat fill all read the SAME scale (scale-matches-paint structural).
    // META'd rate layers (cobertura / esterilización / microchip / ppp) render on
    // the target-anchored classed scale [0.5T, 0.75T, T]; sequential layers use the
    // scrub-frozen live-edge quantile breaks (`seqBreaks`). null resolution (no
    // numeric data) paints neutral, exactly as the standalone fill functions did.
    const encoding = resolveChoroplethEncoding(layer, { lockedSeqBreaks: seqBreaks });
    return (
      encoding?.fillColorExpr ?? (COLOR_NO_DATA as unknown as maplibregl.ExpressionSpecification)
    );
  }

  function addProvinceChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    seqBreaks?: readonly number[] | null,
  ) {
    if (!map.getSource("ar-provinces")) return;
    const fillId = provinceFillLayerId(layer.id);
    const lineId = provinceLineLayerId(layer.id);
    // Z-order root cause (fix): anchor the fill + line BELOW the division chrome
    // (DIVISION_LINE_ID, the lowest chrome layer) exactly as addDivisionFillLayer
    // does. Without the anchor, a province choropleth mounted AFTER division chrome
    // already exists lands at the ABSOLUTE top — above the outline/hover chrome AND
    // above the raised outbreak/signal marks (raiseMarksAboveFills anchors marks to
    // the same layer), so "brotes" briefly paints under the province fill. The
    // anchor is undefined (→ top, unchanged) in the common national case where no
    // division chrome is mounted; it only bites when chrome pre-exists.
    const chromeAnchor = map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined;
    if (!map.getLayer(fillId)) {
      map.addLayer(
        {
          id: fillId,
          type: "fill",
          source: "ar-provinces",
          paint: {
            "fill-color": provinceColorExprForLayer(layer, seqBreaks),
            "fill-opacity": DATA_FILL_OPACITY,
          },
        },
        chromeAnchor,
      );
    }
    if (!map.getLayer(lineId)) {
      // cursor #1: admin-neutral stroke (NOT COLOR_CANVAS) so province edges read
      // as boundaries over the fill, never as near-black cracks. Faded by
      // updateChromeHierarchy when divisions are active (cursor #5).
      map.addLayer(
        {
          id: lineId,
          type: "line",
          source: "ar-provinces",
          paint: {
            "line-color": COLOR_ADMIN_STROKE,
            "line-width": PROV_LINE_WIDTH,
            "line-opacity": PROV_LINE_OPACITY,
          },
        },
        chromeAnchor,
      );
    }
    wireProvinceChoroplethInteractions(map, layer);
  }

  // Recompute the color expression in place when the layer's features change
  // (e.g. scope/period refetch). The fill layer + source are reused.
  function updateProvinceChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    seqBreaks?: readonly number[] | null,
  ) {
    const fillId = provinceFillLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, "fill-color", provinceColorExprForLayer(layer, seqBreaks));
    } else {
      // Basemap may have loaded after the first sync attempt — try to add now.
      addProvinceChoroplethLayer(map, layer, seqBreaks);
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
      // Z-order (fix): anchor below the division chrome like the fill/line above,
      // so the hatch never mounts over the outline/hover chrome or the raised
      // marks. It is still added AFTER the province fill this pass, so it lands
      // just above the fill (hatch-over-fill) while both stay under the chrome.
      const chromeAnchor = map.getLayer(DIVISION_LINE_ID) ? DIVISION_LINE_ID : undefined;
      map.addLayer({ id: sid, type: "fill", source: "ar-provinces", paint }, chromeAnchor);
    }
    map.setFilter(sid, bivariateSuppressedFilter(codes));
  }

  function wireProvinceChoroplethInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    // Bind ONCE per layer id — the handlers persist across the fill layer's
    // remove/re-add cycles (see provinceWiredRef / divisionWiredRef), so
    // re-wiring would stack duplicate handlers (multi-fire popups + double
    // hover-state writes).
    if (provinceWiredRef.current.has(layer.id)) return;
    provinceWiredRef.current.add(layer.id);
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
      // Read the label live too (handlers are wired once — a captured label
      // would go stale when e.g. the bivariate encoding renames the layer).
      const label = current?.label ?? layer.label;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(label)}</em></div>`,
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
    // A single click PINS the popup first (multi-layer readout + "Ver detalle →"
    // that opens the DetailDrawer) — the same coherent inspection model the
    // choropleth/division fills already use, instead of jumping straight to the
    // drawer. The drawer is one click further, behind the affordance.
    map.on("click", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = (f.properties ?? {}) as { place?: string };
      const place = props.place ?? "—";
      const geom = f.geometry as GeoJSON.Point | null;
      const lngLat = geom?.type === "Point" ? (geom.coordinates as [number, number]) : e.lngLat;
      openPinnedPopup({
        map,
        lngLat,
        place,
        readouts: pointReadouts(place),
        detail: { layerId: layer.id, properties: (f.properties ?? {}) as Record<string, unknown> },
      });
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
    // Clicking a choropleth cell PINS the popup first (multi-layer readout +
    // "Ver detalle →" that opens the DetailDrawer) — one coherent inspection
    // model with the province/division fills. Suppressed cells still pin — the
    // readout + drawer render "Suprimido", never the real count (k-anon).
    map.on("click", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { locality?: string; province?: string };
      const place = [p.locality, p.province].filter(Boolean).join(", ") || "—";
      const geom = f.geometry as GeoJSON.Point | null;
      const lngLat = geom?.type === "Point" ? (geom.coordinates as [number, number]) : e.lngLat;
      openPinnedPopup({
        map,
        lngLat,
        place,
        readouts: pointReadouts(place),
        detail: { layerId: layer.id, properties: (f.properties ?? {}) as Record<string, unknown> },
      });
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

  // ARCHETYPE A: the map's scale legends (province ramp, division fill, graduated
  // circles, bivariate 3×3) moved OFF the canvas into the "Referencias" rail
  // section (components/panorama/MapLegends.tsx). The render-derived legends are
  // recomputed there from `layers`; the imperatively-computed divisionLegend +
  // graduatedScale are lifted to the console via onDivisionLegendChange /
  // onGraduatedScaleChange. Only the empty-state overlay + on-canvas controls
  // remain here.

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
  //
  // preserveDrawingBuffer is OFF on the map's GL context (memory/perf cost
  // only "Exportar PNG" needed) — capture on-demand instead: trigger one
  // repaint and read the canvas INSIDE the resulting 'render' event callback,
  // which fires synchronously right after that frame paints, before the
  // browser clears the (non-preserved) buffer for the next frame.
  function exportPng() {
    const map = mapRef.current;
    if (!map || !viewMeta) return;
    map.once("render", () => capturePngFromCanvas(map.getCanvas(), viewMeta));
    map.triggerRepaint();
  }

  function capturePngFromCanvas(mapCanvas: HTMLCanvasElement, meta: NonNullable<typeof viewMeta>) {
    const footer = buildExportFooter(meta);
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

  // task #38 v3 rail: hand a STABLE exportPng wrapper up to the console so its
  // "Exportar" rail panel can fire it. exportPng closes over the latest viewMeta;
  // the ref indirection keeps the registered wrapper stable while always calling
  // the freshest closure. Cleared on unmount so the console never holds a dead fn.
  const exportPngRef = useRef(exportPng);
  exportPngRef.current = exportPng;
  useEffect(() => {
    if (!registerExportPng) return;
    registerExportPng(() => exportPngRef.current());
    return () => registerExportPng(null);
  }, [registerExportPng]);

  // Reset view: snap the camera back to the operator's scope — the
  // server-computed jurisdiction bbox (govt) or the NATIONAL frame (admin).
  //
  // v2C QA fix (2026-07-11): this used to fall back to nationalBboxRef — the
  // DATA-EXTENT bbox captured at map load. With a camera-restored session
  // (?z/lat/lng from a saved board) that snapshot is whatever regional extent
  // the restored layers happened to span, so "Vista nacional" fit right back
  // to the current regional view — a visible no-op. The button PROMISES the
  // national frame: use the static AR extent, never a data snapshot.
  function fitToScope() {
    const map = mapRef.current;
    if (!map) return;
    const bbox = initialBoundsRef.current ?? AR_BBOX;
    map.fitBounds(bbox, { padding: 56, animate: true, maxZoom: 11 });
  }
  // Accessible label for the reset-view control (Q12). The pure helper keys the
  // copy on `boundedJurisdiction` (a govt operator with an assigned jurisdiction),
  // NOT on `initialBounds` — a DRILLED admin also has `initialBounds` (the drilled
  // province bbox) but no personal jurisdiction, so it must read "Vista nacional".
  const resetViewLabelText = resetViewLabel(boundedJurisdiction);

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
  // P4a — the CABA inset projects the RESOLVED ENCODING for CABA's scope, per
  // kind, so it never reads "sin datos" when the main map has a CABA value:
  //   1. BIVARIATE  → CABA's own 3×3 risk cell (one cell = one color) fills the
  //      barrios uniformly, using the SAME bivariate palette the main map paints.
  //   2. CHOROPLETH → per-barrio join (locality) or CABA's single class color
  //      (province) — the P3 structural path, unchanged.
  //   3. GRADUATED  → CABA's single aggregated bubble (same color + radius from
  //      the SAME graduated scale the main map bubbles read).
  // Precedence mirrors the main map's own render branch: bivariate replaces the
  // choropleth fill, so it is resolved FIRST; graduated is a disjoint (point)
  // base, resolved only when no choropleth/bivariate base is active.

  // 1. BIVARIATE — the active base carries the 3×3 cells (buildBivariateCells,
  // fed by the SAME provinceDataRef cobertura×zoonosis the main fill uses). CABA
  // (AR-C) has exactly one cell; its palette color IS the inset's flat fill.
  const insetBivariateLayer = layers.find((l) => (l.bivariateCells?.length ?? 0) > 0) ?? null;

  // 2. CHOROPLETH — only when NOT bivariate (a bivariate base is still a
  // province choropleth by geomType, so it would otherwise be mis-caught here).
  const insetLocalityLayer =
    insetBivariateLayer === null
      ? (layers.find((l) => l.geomType === "choropleth" && l.level === "locality") ?? null)
      : null;
  const insetProvinceLayer =
    insetBivariateLayer === null && insetLocalityLayer === null
      ? (layers.find((l) => l.geomType === "choropleth" && l.level === "province") ?? null)
      : null;

  // The flat CABA fill (bivariate cell OR province class color) + its es-AR
  // sublabel. Bivariate and province-choropleth both collapse CABA to ONE color.
  let insetUniformFill: string | null = null;
  let insetScopeLabel: string | null = null;
  if (insetBivariateLayer) {
    // CABA's bivariate cell → the SAME palette color the main map paints for AR-C.
    // A suppressed cell yields null (bivariateCellColor honors k-anon); we then
    // leave the inset uncolored rather than invent a risk color for a hidden cell.
    const cabaCell = insetBivariateLayer.bivariateCells?.find((c) => isCABA(c.provinceCode));
    if (cabaCell) {
      const color = bivariateCellColor(cabaCell);
      if (color !== null) {
        insetUniformFill = color;
        insetScopeLabel = "riesgo";
      }
    }
  } else if (insetProvinceLayer) {
    const cabaFeature = insetProvinceLayer.features.features.find((f) =>
      isCABA(String((f.properties as { provinceCode?: string } | null)?.provinceCode ?? "")),
    );
    const cabaValue = (cabaFeature?.properties as { value?: number } | null)?.value;
    if (typeof cabaValue === "number") {
      // P3: the inset flat fill samples the SAME scale object the main province
      // fill paints (resolveChoroplethEncoding — the identical value object
      // provinceColorExprForLayer resolves). CABA's single province value is
      // painted the class color it lands in, so the inset chip matches CABA's tiny
      // main-map polygon by construction — "inset same color" is now STRUCTURAL,
      // not a parallel rate/seq branch that could drift. The scrub-frozen live-edge
      // quantile breaks (lockedProvinceBreaksRef) feed the sequential path; the META
      // path ignores them (target-anchored breaks are frame-stable).
      const lockedBreaks = lockedProvinceBreaksRef.current.get(insetProvinceLayer.id) ?? null;
      const encoding = resolveChoroplethEncoding(insetProvinceLayer, {
        lockedSeqBreaks: lockedBreaks,
      });
      if (encoding) {
        insetUniformFill = colorForValue(encoding.scale, cabaValue);
        insetScopeLabel = "valor provincial";
      }
    }
  }

  // 3. GRADUATED — a density/signal POINT base aggregated to province bubbles.
  // CABA is one province feature; find it by its centroid landing inside CABA's
  // frame (the aggregated point features carry a province NAME, not an ISO code,
  // and the bbox test uniquely picks AR-C — no other province centroid is inside
  // it) and size its bubble on the SAME graduatedScale.maxValue the main bubbles
  // use. Only when no choropleth/bivariate base owns the fill above.
  let insetBubble: { color: string; radius: number; suppressed: boolean } | null = null;
  if (insetBivariateLayer === null && insetLocalityLayer === null && insetProvinceLayer === null) {
    const insetGraduatedLayer =
      layers.find((l) => l.geomType === "point" && l.renderMode === "graduated") ?? null;
    if (insetGraduatedLayer && graduatedScale && graduatedScale.maxValue > 0) {
      const cabaFeature = insetGraduatedLayer.features.features.find((f) => {
        const g = f.geometry as { type?: string; coordinates?: [number, number] } | null;
        if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) return false;
        const [lng, lat] = g.coordinates;
        return (
          lng >= CABA_INSET_BBOX[0][0] &&
          lng <= CABA_INSET_BBOX[1][0] &&
          lat >= CABA_INSET_BBOX[0][1] &&
          lat <= CABA_INSET_BBOX[1][1]
        );
      });
      const props = cabaFeature?.properties as {
        count?: number | null;
        suppressed?: boolean;
      } | null;
      const suppressed = props?.suppressed === true;
      const count = props?.count;
      if (cabaFeature && (typeof count === "number" || suppressed)) {
        insetBubble = {
          color: insetGraduatedLayer.color,
          // Same area-proportional radius the main map bubbles use; a k-anon
          // suppressed CABA collapses to the floor radius (never leaks a count).
          radius: suppressed ? BUBBLE_R_MIN : bubbleRadius(count ?? 0, graduatedScale.maxValue),
          suppressed,
        };
        insetScopeLabel = "valor provincial";
      }
    }
  }

  // The layer the inset renders: the locality layer if present, else the
  // bivariate/province layer ONLY when a CABA flat fill resolved (avoids an empty
  // panel). The inset's uniform-fill path reads the flat color, not this layer's
  // features, so the bivariate layer here just keeps the panel present + visible.
  const insetLayer =
    insetLocalityLayer ??
    (insetUniformFill !== null ? (insetBivariateLayer ?? insetProvinceLayer) : null);
  // task #36 fix 1 (+ PBA addendum) — key on SCOPE + CABA-in-viewport, not zoom.
  // National scope shows the AMBA magnifier whenever CABA is in the viewport;
  // CABA and PBA drills keep it; any other province hides it.
  const insetVisible = cabaInsetVisible({
    hasInsetLayer: insetLayer !== null || insetBubble !== null,
    scopeProvince: selectedProvinceCode ?? null,
    scopeIsCaba: selectedProvinceCode != null && isCABA(selectedProvinceCode),
    scopeIsPba: selectedProvinceCode === "AR-B",
    cabaInView: cabaViewportInView,
  });

  // Keyboard: Escape dismisses the pinned popup (Esri "documents are closeable").
  // The popup's ✕ + "Ver detalle" are real, tab-reachable buttons; this adds the
  // conventional Esc shortcut. Fires from anywhere in the map subtree (canvas,
  // controls, or the popup itself hold focus after interaction).
  function handleMapKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && pinnedPopupRef.current?.isOpen()) {
      pinnedPopupRef.current.remove();
    }
  }

  // Keyboard PAN (keyboard-minimal): when the focusable map canvas holds focus,
  // the arrow keys pan the camera (map.panBy), so an operator who cannot use a
  // mouse can still move the view. Respects prefers-reduced-motion (no eased
  // glide) and preventDefault so the arrows pan the map instead of scrolling the
  // page. Zoom stays on the tab-reachable NavigationControl buttons.
  function handleCanvasKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const map = mapRef.current;
    if (!map) return;
    const STEP = 80; // px per keypress — a comfortable, deterministic nudge.
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowUp":
        dy = -STEP;
        break;
      case "ArrowDown":
        dy = STEP;
        break;
      case "ArrowLeft":
        dx = -STEP;
        break;
      case "ArrowRight":
        dx = STEP;
        break;
      default:
        return;
    }
    e.preventDefault();
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.panBy([dx, dy], { animate: !reducedMotion });
  }

  // The briefing TOOLBAR (copy view / saved views / export PNG / roadmap
  // report). Rendered either in the legacy top chrome bar or inside the v2C
  // floating top-right cluster (topRightSlot mode) — one JSX, two homes.
  const briefingActions = viewMeta ? (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {copied && (
        <output className="rounded-[var(--radius-sm)] bg-ln-op-ok-bg px-2 py-1 text-[var(--text-sm)] font-medium text-ln-op-ok">
          Vista copiada
        </output>
      )}
      <button
        type="button"
        onClick={copyView}
        className="rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2.5 py-1 text-[var(--text-sm)] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe"
      >
        Copiar vista
      </button>
      {/* task #66b: named bookmarks of the current view URL (localStorage). */}
      <SavedViewsPopover />
      <button
        type="button"
        onClick={exportPng}
        className="rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2.5 py-1 text-[var(--text-sm)] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe"
      >
        Exportar PNG
      </button>
      {/* Roadmap signal (PO obs 1048, re-ratified 2026-07-09): the one-click
          situación report is planned and the PO wants this placeholder VISIBLE
          in production so the affordance reads as "coming". Visibly disabled. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="En desarrollo"
        className="cursor-not-allowed rounded-[var(--radius-sm)] border border-ln-op-line/60 px-2.5 py-1 text-[var(--text-sm)] font-medium text-ln-op-faint"
      >
        Informe de situación (en desarrollo)
      </button>
    </div>
  ) : null;

  // Hardening test seam (task #39 chaos harness): a window flag forces a render
  // throw so the automated suite can prove the MapErrorBoundary degrades the map
  // island to a "Recargar el panorama" card instead of a dead route. Guarded by a
  // global that only the harness ever sets — zero production surface.
  if (
    typeof window !== "undefined" &&
    (window as unknown as { __PANORAMA_FORCE_THROW__?: boolean }).__PANORAMA_FORCE_THROW__ === true
  ) {
    throw new Error("panorama: forced render throw (chaos harness seam)");
  }

  return (
    <div
      data-pano-map
      className={`relative flex w-full flex-col overflow-hidden ${fill ? "h-full" : "rounded-[var(--radius-lg)] border border-ln-op-line"}`}
      style={fill ? undefined : { height }}
      onKeyDown={handleMapKeyDown}
    >
      {/* ARCHETYPE A LEGACY top chrome bar — only without topRightSlot (v2C
          overlay mode moves the toolbar INTO the floating top-right cluster so
          the masthead is the console's only fixed row). */}
      {!overlayChrome && topRightSlot === undefined && (viewMeta || conditionsSlot) && (
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-ln-op-line bg-ln-op-card px-2.5 py-1.5">
          {conditionsSlot ? (
            <div className="min-w-0">{conditionsSlot}</div>
          ) : (
            <span aria-hidden="true" />
          )}
          {briefingActions}
        </div>
      )}
      {/* Canvas region — the geography + its on-canvas overlays. `relative` so the
          absolute controls/legends position against the MAP, not the chrome bars. */}
      <div className="relative min-h-0 flex-1">
        {/* role="application" (a11y fix, WCAG 4.1.2 nested-interactive): the map
            is a genuine keyboard-operated widget — it is focusable (tabIndex) and
            the arrow keys pan the camera (handleCanvasKeyDown). It was formerly
            role="img", which makes assistive tech treat the whole subtree as a
            single atomic image leaf (childrenPresentational) — but the subtree has
            real focusable descendants (MapLibre's canvas region + the Acercar/
            Alejar zoom buttons), so axe flagged nested-interactive. "application"
            is the honest role for a custom keyboard widget: it permits focusable
            children AND routes arrow keys to the pan handler instead of the screen
            reader's virtual cursor. The aria-label still names the view + point
            count; zoom / reset-view / ← Volver / the popup's ✕ + "Ver detalle"
            remain tab-reachable, labeled <button>s. */}
        <div
          ref={containerRef}
          className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ln-op-azul"
          style={{ background: COLOR_CANVAS }}
          role="application"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional — this IS an interactive widget (role="application" + arrow-key pan via onKeyDown); biome doesn't classify "application" as interactive, but the element must be focusable to receive the pan keystrokes.
          tabIndex={0}
          aria-label={`${label}. ${renderableCount} ${renderableCount === 1 ? "punto" : "puntos"} en la vista. Usá las flechas para desplazar el mapa.`}
          onKeyDown={handleCanvasKeyDown}
        />
        {/* cursor Part2: CABA/AMBA inset — a docked barrio-scale mini-map so the
            micro-jurisdiction is legible at national zoom (not an unreadable smear).
            Static camera, non-interactive, shares the choropleth + k-anon system. */}
        <CabaInset
          layer={insetLayer}
          visible={insetVisible}
          uniformFill={insetUniformFill}
          // P4a — the CABA-scoped projection of the resolved encoding: a per-kind
          // sublabel + (graduated only) CABA's single aggregated bubble. Choropleth
          // keeps its polygon fill (uniformFill / per-barrio join); bubble is null.
          scopeLabel={insetScopeLabel}
          bubble={insetBubble}
          // LOW #6 (M1 twin): hand the inset the EFFECTIVE division breaks the
          // main fill renders with (lockedDivisionBreaksRef refreshes to the
          // live-edge breaks on every live sync and freezes them mid-scrub), so
          // the barrio colors classify on the SAME scale as the main map.
          lockedBreaks={
            insetLocalityLayer !== null
              ? (lockedDivisionBreaksRef.current.get(insetLocalityLayer.id) ?? null)
              : null
          }
          // Round-3 QA fix 3: reuse the SAME drill seam a main-map province
          // click uses (onProvinceDrill → commitScopeDrill("AR-C", null)) —
          // undefined when the console has no drill target (mirrors the main
          // map's canDrillProvince gate), so the inset stays inert then.
          onDrill={onProvinceDrill ? () => onProvinceDrill("AR-C") : undefined}
          // Cowork B6: the inset stays visible during a Buenos Aires (AR-B) drill
          // as the AMBA magnifier (CABA sits inside the conurbano), but its bare
          // "CABA" header read as the primary scope. Name it a reference so it
          // never masquerades as "you are viewing CABA". National / CABA scope
          // keep the plain header (there CABA IS the mark on the map).
          referenceNote={selectedProvinceCode === "AR-B" ? "referencia AMBA" : null}
        />
        {/* v2C floating top-right cluster: the console's scope pill + period
            control (slot) over the map-owned briefing actions. Absolute overlay
            — never re-layouts the canvas. */}
        {topRightSlot !== undefined && (
          <div className="absolute right-3.5 top-3.5 z-10 flex max-w-[calc(100%-1.75rem)] flex-col items-end gap-2 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card/95 p-2.5 shadow-md">
            {topRightSlot}
            {briefingActions}
          </div>
        )}
        {/* Top control cluster (#49 item 7): scope drill ("← Volver a
            Nacional") + camera reset (globe) + aggregation-level badge, pinned
            to the TOP strip and anchored just right of the scope-pill/KPI column
            (left-80 clears the w-72 column) so it reads AS a map-control group
            near the scope pill — not floating over the geography. Prev it was
            centered and dropped to top-36 below 2xl, landing over drillable
            provinces at 1366. */}
        {/* pointer-events-none on the GROUP so any gap falls through to the map;
            each interactive button re-enables its own pointer events. */}
        <div className="pointer-events-none absolute left-80 top-3.5 z-10 flex items-center gap-2">
          {/* Click-to-drill (task #55): pop the province scope back to national.
            Rendered only when the operator can return (explicit province pick). */}
          {onReturnNational && (
            <button
              type="button"
              onClick={onReturnNational}
              className="pointer-events-auto rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2.5 py-1 text-xs font-medium text-ln-op-ink-2 shadow-md hover:bg-ln-op-stripe"
            >
              ← Volver a Nacional
            </button>
          )}
          {/* Reset view: a GLOBE/national icon is the honest "return to the whole
            territory" cue (PO #49 item 8 — a house read as "go home/dashboard",
            wrong metaphor for a map that reframes to the national/jurisdiction
            extent). fitToScope re-frames the camera to the operator's scope
            default (national for admin/universal; the jurisdiction frame for
            scoped govt). The accessible label + tooltip name the destination
            honestly per operator type; the visible control is the icon. */}
          <button
            type="button"
            onClick={fitToScope}
            title={resetViewLabelText}
            aria-label={resetViewLabelText}
            className="pointer-events-auto flex items-center justify-center rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-1.5 text-ln-op-ink-2 shadow-md hover:bg-ln-op-stripe"
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
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </button>
          {/* ARCHETYPE A: aggregation-level badge — announces WHAT a map mark
            aggregates now ("Provincias" vs "Departamentos/partidos"/"Comunas"),
            so the reader knows the granularity's meaning changed on drill. */}
          {aggregationLabel && (
            <span
              className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-2 py-1 text-[var(--text-sm)] font-medium text-ln-op-ink-2 shadow-md"
              title="Nivel de agregación del mapa"
            >
              {aggregationLabel}
            </span>
          )}
        </div>
        {renderableCount === 0 && !hasProvChoro && divisionLegend === null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-4 py-2 text-center text-[var(--text-md)] text-ln-op-ink-2 shadow-md">
              {emptyOverlayMessage({
                layerDegraded,
                rateProvinceOnlyEmpty,
                detailKAnonSuppressed,
                emptyStateScope,
              })}
            </p>
          </div>
        )}
        {/* task #39 hardening — basemap fetch failed: an HONEST error state with a
            retry, NEVER a silent blank canvas. Opaque so the operator can't mistake
            it for an empty (but working) map. */}
        {basemapError && (
          <div
            role="alert"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ln-op-card/95 p-6 text-center"
          >
            <p className="text-[var(--text-md)] font-semibold text-ln-op-ink">
              No pudimos cargar el mapa
            </p>
            <p className="max-w-sm text-[var(--text-sm)] text-ln-op-mute">
              No se pudo descargar la geografía base. Revisá la conexión y volvé a intentar.
            </p>
            <button
              type="button"
              onClick={() => {
                if (mapRef.current) captureCameraForReinit(mapRef.current);
                setBasemapError(false);
                setMapEpoch((n) => n + 1);
              }}
              className="rounded-[var(--radius-md)] border border-ln-op-azul bg-ln-op-azul/5 px-3.5 py-1.5 text-[var(--text-sm)] font-semibold text-ln-op-azul hover:bg-ln-op-azul/10"
            >
              Reintentar
            </button>
          </div>
        )}
        {/* task #39 hardening — WebGL context lost: a recovering overlay. The
            browser normally restores the context automatically (→ rebuild); the
            button is a manual fallback if the restore never fires. */}
        {glLost && (
          <div
            role="alert"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ln-op-card/95 p-6 text-center"
          >
            <p className="text-[var(--text-md)] font-semibold text-ln-op-ink">
              Recuperando el mapa…
            </p>
            <p className="max-w-sm text-[var(--text-sm)] text-ln-op-mute">
              El mapa perdió el contexto gráfico y se está recuperando solo. Si no vuelve,
              recargalo.
            </p>
            <button
              type="button"
              onClick={() => {
                setGlLost(false);
                setMapEpoch((n) => n + 1);
              }}
              className="rounded-[var(--radius-md)] border border-ln-op-azul bg-ln-op-azul/5 px-3.5 py-1.5 text-[var(--text-sm)] font-semibold text-ln-op-azul hover:bg-ln-op-azul/10"
            >
              Recargar el mapa
            </button>
          </div>
        )}
      </div>
      {/* ARCHETYPE A: time scrubber DOCKED to the map card's bottom edge — inside
          the map's own chrome, always visible with the geography (not a separate
          block floating below the card). */}
      {bottomDock && (
        <div className="flex-shrink-0 border-t border-ln-op-line bg-ln-op-card">{bottomDock}</div>
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
  if (layer.id === "clinicas") {
    const name = String(props.name ?? "Clínica veterinaria");
    const v = props.verified ? " · verificada" : "";
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
