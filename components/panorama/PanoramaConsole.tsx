"use client";

// PanoramaConsole — the client orchestrator for the situational map.
//
// Owns the per-layer runtime state, fetches /api/panorama/[layer] on toggle
// (threading the active scope/period searchParams so client toggles re-fetch
// with the same filters the server used), and feeds the active layers to the
// (dynamic) SituationalMap. Perdidas is mounted server-side and seeded here as
// the default-on layer, so its features paint on first render without a fetch.
//
// map-QOL fluid state: the whole board (active layers, aggregation level,
// preset, period) is URL-encoded (`?layers=&level=&preset=&period=`) and
// committed via the shallow History API (lib/ui/map-layer-nav.ts) — never a
// document navigation. This SUPERSEDES the interim `window.location.assign`
// cure from commit 0e94f198: preset period commits now stay on the client
// (shallow pushState + client refetch of KPIs and layers), immune to the
// Next 15.5.x router-drop defect because no router transition is involved.
// The URL is the state; localStorage only remembers the last board so a bare
// URL can offer a one-time, subtle restore.

import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type JurisdictionScope,
  JurisdictionSwitcher,
} from "@/components/gob/JurisdictionSwitcher";
import { DetailDrawer, type SelectedFeature } from "@/components/panorama/DetailDrawer";
import { FiltroPanel } from "@/components/panorama/FiltroPanel";
import { KpiChips } from "@/components/panorama/KpiChips";
import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import { LegendPill } from "@/components/panorama/LegendPill";
import {
  MapDataTable,
  type MapTableRow,
  useMapTableCsvHref,
} from "@/components/panorama/MapDataTable";
import { MapErrorBoundary } from "@/components/panorama/MapErrorBoundary";
import { MapLegends } from "@/components/panorama/MapLegends";
import { OverlayDisclosure } from "@/components/panorama/OverlayDisclosure";
import { PanoramaCaption } from "@/components/panorama/PanoramaCaption";
import { PanoramaDataTable } from "@/components/panorama/PanoramaDataTable";
import { PanoramaDock, type PanoramaDockTab } from "@/components/panorama/PanoramaDock";
import { PanoramaKpiFooter } from "@/components/panorama/PanoramaKpiFooter";
import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import { PanoramaRail, type RailItem } from "@/components/panorama/PanoramaRail";
import { PanoramaReading } from "@/components/panorama/PanoramaReading";
import { PanoramaSuppressionNotice } from "@/components/panorama/PanoramaSuppressionNotice";
import { PeriodPanel } from "@/components/panorama/PeriodPanel";
import { PresetPanel } from "@/components/panorama/PresetPanel";
import { RankedUnitsPanel } from "@/components/panorama/RankedUnitsPanel";
import { SavedViewsPopover } from "@/components/panorama/SavedViewsPopover";
import type {
  ActiveLayer,
  DivisionLegendDescriptor,
  PointRenderMode,
  ProvinceSeqLegend,
} from "@/components/panorama/SituationalMap";
import { SituationalMapDynamic } from "@/components/panorama/SituationalMapDynamic";
import { TimeScrubber } from "@/components/panorama/TimeScrubber";
import type { GraduatedScale } from "@/components/panorama/graduated-scale";
import { buildLayerReadout } from "@/components/panorama/map-popup";
import { activeVistaName, countFiltroModifiers } from "@/components/panorama/panorama-labels";
import { binDailyCounts, binTimestamps } from "@/components/panorama/signal-histogram";
import {
  Z_LOCALITY,
  Z_LOCALITY_ENTER,
  Z_LOCALITY_EXIT,
  derivedLevelWithHysteresis,
  pointsEligible,
} from "@/components/panorama/situational-map-utils";
import { useKeyedAbort } from "@/components/panorama/use-keyed-abort";
import { OpButton } from "@/components/ui/dashboard/OpButton";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import type { LocalityCentroids } from "@/lib/infra/ar-localidades";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import {
  type MapCamera,
  encodeAsOfToParams,
  encodeCameraToParams,
  parseAsOfFromParams,
  parseCameraFromParams,
  pushMapStateUrl,
  replaceMapStateUrl,
  stripCameraParams,
} from "@/lib/ui/map-layer-nav";
import { AR_TIME_ZONE } from "@/lib/utils/format";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import {
  BIVARIATE_MIN_UNITS,
  bivariateViable,
  buildBivariateCells,
} from "@/src/modules/panorama/domain/bivariate";
import { checkCompatibility, roleOf } from "@/src/modules/panorama/domain/compatibility";
import {
  AGGREGATED_POINT_IDS,
  AGGREGATED_POINT_LAYERS,
  CHOROPLETH_LAYERS,
  PANORAMA_LAYERS,
  POINTS_LAYER_IDS,
  getLayer,
  isAggregatedPointLayer,
  isPointsLayer,
  isTemporalLayer,
} from "@/src/modules/panorama/domain/layers";
import {
  DEFAULT_PANORAMA_PRESET_ID,
  PANORAMA_PRESETS,
  type PresetFraming,
  type PresetId,
  getPreset,
  presetLayerIds,
} from "@/src/modules/panorama/domain/presets";
import {
  type RankedUnit,
  type RankingKind,
  rankWorstUnits,
} from "@/src/modules/panorama/domain/ranking";
import type { TimeBasis } from "@/src/modules/panorama/domain/time-scrub";
import type {
  AggregationLevel,
  FeatureCollection,
  LayerId,
  PanoramaPeriod,
} from "@/src/modules/panorama/domain/types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// panorama-redesign Fase 1: trailing debounce for the preset-commit layer
// fetch. Rapid preset clicks coalesce into ONE fetch burst (the last click);
// the state flips + shallow URL push stay synchronous for instant feedback.
const PRESET_FETCH_DEBOUNCE_MS = 200;

/** True when the error is a fetch cancellation (superseded request, NOT a
 * failure). Every catch on an abort-wrapped path MUST early-return on this —
 * running the failure branch would deactivate the layer on every superseded
 * fetch (design-mandated correctness rule, panorama-redesign Fase 1). */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

const initialState = (): Record<LayerId, LayerPanelState> => {
  const out = {} as Record<LayerId, LayerPanelState>;
  for (const l of PANORAMA_LAYERS) {
    out[l.id] = {
      active: false,
      loading: false,
      count: 0,
      suppressedCount: 0,
      noLocalityCount: 0,
      truncated: false,
    };
  }
  return out;
};

type ApiResponse = {
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  noLocalityCount: number;
  level?: AggregationLevel;
  // panorama-event-points Slice 1: present only on a server-authorized points
  // response ("points"); undefined/absent on the aggregated path.
  mode?: "points" | "aggregated";
  sinUbicacionCount?: number;
};

// The two choropleth layer ids — the only layers the aggregation level affects.
const CHOROPLETH_IDS = new Set<LayerId>(CHOROPLETH_LAYERS.map((l) => l.id));

/**
 * A layer envelope the SERVER seeded for the first-visit fast path (perf plan
 * commit 1.2). Matches the exact per-layer shape the console stores: the
 * FeatureCollection plus the k-anon disclosure counts. On a truly-first visit
 * the page resolves the role-default preset, fetches ALL its layers (cached),
 * and hands them down here so the console paints on first render with ZERO
 * client fetches — instead of the client clearing caches and re-fetching.
 */
export type SeededLayer = {
  id: LayerId;
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  noLocalityCount: number;
};

/**
 * True when a layer's features at `level` live in the PROVINCE cache
 * (provinceDataRef) rather than the locality cache (dataRef). Mirrors EXACTLY
 * the cache routing `activeLayers` uses to READ features (choropleth OR
 * aggregated-point layer, at province level). Seeding a layer through this same
 * predicate guarantees the seed lands in the SAME cache activeLayers reads it
 * from at `initialLevel` — the C2 level-invariant, enforced by construction.
 */
function seededLayerUsesProvinceCache(id: LayerId, level: AggregationLevel): boolean {
  return (CHOROPLETH_IDS.has(id) || isAggregatedPointLayer(id)) && level === "province";
}

// panorama-event-points: per-layer es-AR copy for the honest points-mode
// disclosure. perdidas/mordeduras plot REAL coordinates; denuncias plots the
// coarse LOCALITY CENTROID (never the exact report coordinate).
function pointsDisclosureLine(
  id: LayerId,
  info: { count: number; truncated: boolean; sinUbicacion: number },
): string {
  const n = info.count.toLocaleString("es-AR");
  const head =
    id === "mordeduras"
      ? `Mordeduras con ubicación real, jurisdicción (${n}).`
      : id === "denuncias"
        ? `Denuncias por localidad, ubicación aproximada (${n}).`
        : `Avistajes con ubicación real (${n}).`;
  const noun = id === "mordeduras" ? "mordeduras" : id === "denuncias" ? "denuncias" : "avistajes";
  const cap = info.truncated ? ` Mostrando los ${n} más recientes.` : "";
  const residual =
    info.sinUbicacion > 0
      ? ` ${info.sinUbicacion.toLocaleString("es-AR")} ${noun} sin ubicación exacta.`
      : "";
  return `${head}${cap}${residual}`;
}

// ---------------------------------------------------------------------------
// map-QOL URL-as-state helpers
// ---------------------------------------------------------------------------

// Params that change WHAT data the server would compute (scope + period).
// The cache-invalidation and KPI-refetch effects key on THIS subset only, so
// the client-only board params (layers/level/preset) written by the shallow
// URL sync never wipe the layer caches or refetch KPIs.
const SCOPE_PERIOD_KEYS = ["period", "from", "to", "province", "locality"] as const;

const BOARD_STORAGE_KEY = "panorama:board:v1";

type SavedBoard = {
  layers: string;
  level: AggregationLevel;
  preset: string | null;
  period: string | null;
  /**
   * panorama-vista-redesign Phase 5 (design Decision 5): CapasBox / TimeScrubber
   * Simple-Detalle prefs. OPTIONAL — folded into the EXISTING `panorama:board:v1`
   * key with NO version bump. A pre-redesign v1 entry lacks these fields
   * entirely; `undefined` reads as Simple (false), never a crash.
   */
  capasDetail?: boolean;
  scrubDetail?: boolean;
};

/** The scope+period subset of a query string, in stable key order. */
function scopePeriodQsOf(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of SCOPE_PERIOD_KEYS) {
    const value = params.get(key);
    if (value !== null) out.set(key, value);
  }
  return out.toString();
}

/**
 * Parses the `layers` URL param into validated layer ids.
 * Returns null when the param is absent (no explicit board in the URL);
 * an empty array is a valid, explicit "all layers off" board.
 */
function parseLayersParam(raw: string | null): LayerId[] | null {
  if (raw === null) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is LayerId => Boolean(getLayer(s as LayerId)));
}

/**
 * Canonical `layers` param value for a set of active ids: registry order,
 * comma-joined. Both onPreset and the URL-sync effect emit this form so the
 * URL is stable regardless of activation order.
 */
function canonicalLayersKey(ids: readonly LayerId[]): string {
  return PANORAMA_LAYERS.filter((l) => ids.includes(l.id))
    .map((l) => l.id)
    .join(",");
}

/**
 * Persists the board (layers/level/preset/period) for the bare-URL restore.
 * `prefs` stamps the CURRENT capasDetail/scrubDetail — they are UI-only state,
 * never URL params, so the caller passes the live values (panorama-vista-
 * redesign Phase 5, design Decision 5).
 */
function saveBoard(
  params: URLSearchParams,
  prefs: { capasDetail: boolean; scrubDetail: boolean },
): void {
  try {
    const board: SavedBoard = {
      layers: params.get("layers") ?? "",
      level: params.get("level") === "locality" ? "locality" : "province",
      preset: params.get("preset"),
      period: params.get("period"),
      capasDetail: prefs.capasDetail,
      scrubDetail: prefs.scrubDetail,
    };
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Storage unavailable (private mode, quota) — the board just isn't remembered.
  }
}

/**
 * perf plan 1.3 — client-safe placeholder for the streaming KPI strip. Shares
 * the degraded payload SHAPE (empty tiles, no denominator/freshness) but a
 * distinct "Cargando indicadores…" caption so the pending state is honest. Kept
 * local (not imported from get-panorama-kpis) so this client bundle never pulls
 * that server module's DB fetcher graph.
 */
function loadingPanoramaKpis(): PanoramaKpis {
  return {
    kpis: [],
    recalculatedFor: "Cargando indicadores…",
    dataAsOf: null,
    coverageDenominator: null,
  };
}

type Props = {
  /** Default-on layer id (perdidas) — its features come pre-resolved from the server. */
  defaultLayerId: LayerId;
  /** Server-rendered features for the default layer. */
  defaultFeatures: FeatureCollection;
  /** Envelope for the default layer (truncated/suppressed). */
  defaultTruncated?: boolean;
  defaultSuppressedCount?: number;
  defaultNoLocalityCount?: number;
  /**
   * Server-rendered headline KPIs (recalculated for the active scope+period).
   * Optional since perf plan 1.3: a streaming page omits this and passes
   * `kpisPromise` instead (the KPI fan-out no longer blocks SSR). Non-streaming
   * callers (tests, awaited paths) still pass the resolved value — when present
   * it seeds the strip on first render exactly as before.
   */
  initialKpis?: PanoramaKpis;
  /**
   * perf plan 1.3 — non-blocking KPIs. The page creates the KPI loader promise
   * and streams it UN-awaited over RSC (React 19 / Next 15) so the shell + map
   * paint while the (cold) ~12-query fan-out is still resolving. The console
   * resolves it in a mount effect into `kpis` state, rendering a "Cargando
   * indicadores…" pending state until it lands. Absent → today's awaited
   * `initialKpis` behavior (backward compatible). The page attaches
   * `.catch(() => degradedPanoramaKpis())` before passing it, so a degraded DB
   * still resolves to an honest empty strip instead of rejecting.
   */
  kpisPromise?: Promise<PanoramaKpis>;
  /**
   * Pre-zoomed bounding box for the map's initial viewport.
   * Govt operators receive their jurisdiction bbox (server-computed); admin
   * leaves this undefined to keep the national/data-extent view.
   */
  initialBounds?: [[number, number], [number, number]];
  /**
   * Centroid map (slug → [lng, lat]) for the selected province's localities.
   * Passed to SituationalMap so it can autozoom when a locality is selected
   * from the JurisdictionSwitcher (A1 PR-7). Keyed by locality slug.
   */
  localityCentroids?: LocalityCentroids;
  /**
   * Aggregation axis the server seeded the default layer at, and the axis the
   * console starts on when the URL doesn't pin one. Scoped views (a province
   * or locality selected) seed at "locality" so the map opens at the finest
   * granularity the data supports (QA 2026-07-03: polygons/points at locality
   * granularity add reference and show the data's real resolution); the
   * national view stays at "province" (fast rollup, readable overview).
   * MUST match the level the page passed to getLayerFeatures for the seed.
   */
  initialLevel?: AggregationLevel;
  /**
   * panorama-redesign Fase 1 (RSC slot): the scope/period filters
   * (JurisdictionSwitcher + PeriodPicker) rendered by the SERVER shell.
   * PanoramaShell keeps ownership of that JSX (server/client boundary
   * intact); the console only decides WHERE it appears — inside the
   * "Alcance y período" disclosure in the side column.
   */
  filtersSlot?: ReactNode;
  /**
   * The ISO 3166-2:AR code of the province the operator is IMPLICITLY scoped to
   * (single-province govt case), when no province is explicitly selected in the
   * JurisdictionSwitcher. A jurisdiction-scoped operator (e.g. CABA) never picks
   * a province in the picker — their scope is inherited from the session — so
   * `?province` stays absent and the always-visible administrative divisions
   * (barrios/departamentos) would never render. This makes the console activate
   * the division rendering for that effective province exactly as an explicit
   * selection would: same lazy fetch, same outline/fill/k-anon semantics.
   * PRESENTATION-ONLY — the data scope is unchanged (already enforced by the
   * scoped loaders server-side). Undefined for multi-province or admin/national
   * scope (those keep today's behavior: provinces basemap until an explicit pick).
   */
  initialDivisionProvince?: string | null;
  /**
   * Preset auto-activated on a TRULY-FIRST visit (bare URL, no saved board, no
   * explicit ?preset/?period). Role-aware default: the server passes the vista
   * that matches the operator's urgent question — a jurisdiction (govt) operator
   * opens on local syndromic surveillance ("sintomas"), an admin keeps the
   * national overview default. Falls back to DEFAULT_PANORAMA_PRESET_ID when the
   * page doesn't specify one. Presentation-only — the URL ?preset contract still
   * wins (this only applies when no explicit board is present).
   */
  defaultPresetId?: PresetId;
  /**
   * perf plan commit 1.2 — first-visit fast path. On a TRULY-first visit the
   * server resolves the role-default preset and seeds ALL its layers (via the
   * cached loader) at the preset's level + period. `seededPresetId` is that
   * preset (equals `defaultPresetId`); `seededLayers` carries the per-layer
   * envelopes. When present the console seeds its caches + states from these,
   * paints on first render, and the mount's preset activation PRESERVES the
   * seeded caches (zero client fetches). Absent → today's behavior (perdidas
   * seed + client-side preset activation that fetches, now cache-warmed).
   */
  seededPresetId?: PresetId;
  seededLayers?: SeededLayer[];
  /**
   * Human scope label for the masthead pill, e.g. "Nacional · todas las
   * provincias" or a jurisdiction name. This is the SERVER default (national /
   * the operator's implicit scope); an embedded client drill re-labels the pill
   * live from the drilled province/locality (see `liveScopeLabel`), so the pill
   * tracks the shallow commit instead of staying stuck on the SSR value. When
   * undefined the console renders no masthead header (tests / embedding callers).
   */
  scopeLabel?: string;
  /**
   * panorama embedded-drill: provinces the viewer may filter to (admin: all;
   * govt: its own). When present, the console renders the JurisdictionSwitcher
   * CLIENT-SIDE and drives an embedded scope drill (shallow History commit +
   * client refetch, no reload). Absent → the console relies on the
   * server-rendered `filtersSlot` switcher (tests / other callers), unchanged.
   */
  allowedProvinces?: Array<{ code: string; name: string }>;
  /**
   * True ONLY for a true universal navigator (admin / no jurisdiction fence).
   * Gates the semantic scroll-nav wheel takeover AND the wheel-driven center
   * scope commit. Adversarial QA 2026-07-11 (HIGH 1): the old heuristic
   * `initialDivisionProvince == null` mis-classified a MULTI-province govt
   * operator as universal — they lost cooperative wheel-zoom and could
   * center-drill (camera-only) into provinces outside their mental model. Only
   * an actor with no jurisdiction fence may own the wheel + free scope commit;
   * a multi-province govt keeps cooperative zoom and click-drills their own
   * provinces (still data-fenced server-side). Default false (tests / embedding
   * callers get no takeover).
   */
  universalNav?: boolean;
  /**
   * Localities of the INITIALLY-selected province (JurisdictionSwitcher
   * dropdown). Seeds the console's live scope-data state; an embedded drill
   * refreshes it from /api/panorama/scope for the newly-drilled province.
   */
  localities?: Array<{ slug: string; name: string }>;
  /**
   * v2C fixed console (RSC slot): the methodology / "acerca de estas métricas"
   * block PanoramaShell used to render BELOW the console. The page no longer
   * scrolls, so it now lives inside the masthead's "Acerca de esta vista"
   * popover. The server shell keeps ownership of the JSX.
   */
  aboutSlot?: ReactNode;
  /**
   * v2C fixed console (RSC slot): the "Datos de demostración" disclosure,
   * relocated from below the console into the masthead's "Acerca" popover
   * (with a compact always-visible pill beside the fresh chip). null/absent →
   * no demo notice (D3 suppression handled by the shell).
   */
  demoNotice?: ReactNode;
};

export function PanoramaConsole({
  defaultLayerId,
  defaultFeatures,
  defaultTruncated = false,
  defaultSuppressedCount = 0,
  defaultNoLocalityCount = 0,
  initialKpis,
  kpisPromise,
  initialBounds,
  localityCentroids = {},
  initialLevel = "province",
  filtersSlot,
  initialDivisionProvince = null,
  defaultPresetId = DEFAULT_PANORAMA_PRESET_ID,
  seededPresetId,
  seededLayers,
  scopeLabel,
  allowedProvinces,
  universalNav = false,
  localities: initialLocalities = [],
  aboutSlot,
  demoNotice,
}: Props) {
  // perf plan 1.2: a first-visit seed is present only when the server handed
  // down BOTH the preset id and at least one layer envelope. Everything below
  // gates on this so a non-seeded (normal) render keeps today's behavior.
  const hasSeed = seededPresetId != null && seededLayers != null && seededLayers.length > 0;
  const searchParams = useSearchParams();
  // panorama-redesign Fase 1: per-key fetch cancellation. Key = layer id for
  // /api/panorama/[layer] fetches, "kpis" for the KPI strip — last click wins
  // per key; superseded fetches abort instead of racing the UI state.
  const { signalFor } = useKeyedAbort();

  // panorama embedded-drill — CLIENT-COMMITTED scope. A province/locality drill
  // (map click, "← Volver", or the JurisdictionSwitcher) commits via a shallow
  // History pushState, which — like the preset/period commits — is NOT observed
  // by useSearchParams() in production (the same router-drop-immune mechanism
  // this whole console uses, engram #621/#622). So the committed scope lives in
  // THIS state, not in searchParams; everything scope-derived reads the
  // EFFECTIVE scope below. `null` = no drill yet → the SSR searchParams win.
  const [scopeOverride, setScopeOverride] = useState<{
    province: string | null;
    locality: string | null;
  } | null>(null);
  // Validate the URL province against the known set (cowork round 2): an invalid
  // `?province=AR-ZZ` used to flow into the scope key + KPI fetch and leave the
  // strip stuck on "Cargando indicadores…" (the incoherent state never resolved).
  // Drop an unknown code → national, so every surface stays coherent.
  const urlProvince = searchParams.get("province");
  const validUrlProvince = urlProvince && provinceByCode(urlProvince) ? urlProvince : null;
  const effectiveScopeProvince = scopeOverride ? scopeOverride.province : validUrlProvince;
  const effectiveScopeLocality = scopeOverride
    ? scopeOverride.locality
    : (searchParams.get("locality") ?? null);
  // Ref mirror of the effective province so the popstate handler (below) can
  // read the CURRENT scope without re-subscribing the listener on every scope
  // change — it decides whether a reverted URL needs a fresh scope bundle.
  const effectiveScopeProvinceRef = useRef(effectiveScopeProvince);
  effectiveScopeProvinceRef.current = effectiveScopeProvince;
  // MAP-2: the popstate handler (declared below, before applyPreset) re-derives the
  // board (preset/layers) from the popped URL through this ref, so it can reach the
  // re-derivation defined AFTER applyPreset without a forward reference. Assigned
  // during render once applyPreset exists (mirrors the onZoomRef idiom).
  const resyncBoardFromUrlRef = useRef<((params: URLSearchParams) => void) | null>(null);

  // The selected province's localities + centroids. Seeded from the server props
  // (the scope the page rendered); an embedded drill refreshes it from
  // /api/panorama/scope so the switcher dropdown + the map's locality autozoom
  // centroids track the drilled province without a reload.
  const [scopeData, setScopeData] = useState<{
    localities: Array<{ slug: string; name: string }>;
    centroids: LocalityCentroids;
  }>({ localities: initialLocalities, centroids: localityCentroids });
  // Feature data per layer (the default is seeded; others fetched on toggle).
  // This is the LIVE cache (asOf=null). The temporal as-of cache is separate.
  // When the server seeded the default layer at locality level (scoped view,
  // initialLevel="locality"), the seed lands here — this IS the locality cache.
  const dataRef = useRef<Map<LayerId, FeatureCollection>>(
    (() => {
      // First-visit fast path (perf plan 1.2): seed every server-seeded layer
      // whose features live in the LOCALITY cache at `initialLevel` (the level
      // the page seeded them at). seededLayerUsesProvinceCache mirrors the
      // activeLayers read-routing, so seed placement == read placement (C2).
      if (hasSeed) {
        const m = new Map<LayerId, FeatureCollection>();
        for (const seed of seededLayers) {
          if (!seededLayerUsesProvinceCache(seed.id, initialLevel)) m.set(seed.id, seed.features);
        }
        return m;
      }
      return initialLevel === "locality" ? new Map([[defaultLayerId, defaultFeatures]]) : new Map();
    })(),
  );
  // As-of feature cache (F4): per (layer, asOf-iso) the features the layer had at
  // that instant. Refreshed when the scrubber moves; cleared when the period/scope
  // changes (a new window invalidates the axis). Live layers stay in dataRef.
  const asOfDataRef = useRef<Map<LayerId, FeatureCollection>>(new Map());
  // U5 PROVINCE-level choropleth cache. `dataRef` holds the LOCALITY (and point)
  // features; this holds the province-aggregated features for the two choropleth
  // layers. Keyed by layer id; populated lazily when the toggle is on "Provincia"
  // and the layer is active. Cleared (with dataRef's choropleth entries) when the
  // scope/period changes so a new window refetches at the active level.
  //
  // C2 fix: seed the default layer (perdidas, an aggregated point layer) into
  // the cache that matches the axis the SERVER resolved the seed at
  // (initialLevel — see app/*/panorama/page.tsx). Seeding into the other cache
  // would leave the active cache empty on first render, causing the
  // activeLayers memo to find EMPTY_FC → blank map.
  const provinceDataRef = useRef<Map<LayerId, FeatureCollection>>(
    (() => {
      // First-visit fast path: the province-cache counterpart of dataRef above —
      // seed every server-seeded layer that reads from provinceDataRef at
      // `initialLevel` (choropleth / aggregated-point at province level).
      if (hasSeed) {
        const m = new Map<LayerId, FeatureCollection>();
        for (const seed of seededLayers) {
          if (seededLayerUsesProvinceCache(seed.id, initialLevel)) m.set(seed.id, seed.features);
        }
        return m;
      }
      return initialLevel === "province" && isAggregatedPointLayer(defaultLayerId)
        ? new Map([[defaultLayerId, defaultFeatures]])
        : new Map();
    })(),
  );

  // U5 aggregation axis — the granularity TOGGLE. Distinct from the scope filter
  // (JurisdictionSwitcher narrows WHAT is shown; this changes HOW the choropleth
  // layers are aggregated + rendered). The national view defaults to PROVINCE
  // (fast rollup, readable overview — and it keeps the default off the slow
  // rabies-coverage locality rollup); scoped views arrive with
  // initialLevel="locality" so the finest granularity is the default there.
  // map-QOL: the URL (`?level=…`) wins on mount so a shared/restored board
  // reproduces the same axis.
  const [level, setLevel] = useState<AggregationLevel>(() => {
    const urlLevel = searchParams.get("level");
    // MAP-5 fix: `level=locality` needs a province in scope to load divisions. A
    // deep-linked/shared national URL with a stale `level=locality` (no ?province
    // and no implicit jurisdiction province) would leave the choropleth on "Sin
    // datos para esta capa en todo el país" until the operator toggles to
    // Provincias — the KPIs load fine, only the map is stuck. Fall back to province
    // when no province is in scope so the map paints on land; the (scope, zoom)
    // hysteresis still flips to locality on an intentional zoom or a drill.
    if (urlLevel === "locality") {
      const hasProvinceInScope =
        searchParams.get("province") !== null || initialDivisionProvince !== null;
      return hasProvinceInScope ? "locality" : "province";
    }
    if (urlLevel === "province") return "province";
    return initialLevel;
  });
  const levelRef = useRef(level);
  levelRef.current = level;

  // task #78 Part 3: the "solo firmado por matrícula" toggle. Data-affecting (it
  // narrows the cobertura numerator to vet-signed doses), so it is URL-encoded
  // like `level` (?verified=1) — a shared/restored board reproduces it. Seeded
  // from the URL on mount. Only the cobertura layer honors it; every other layer
  // and the KPI strip ignore it (the KPI tile already shows BOTH numbers).
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(
    () => searchParams.get("verified") === "1",
  );
  const verifiedRef = useRef(verifiedOnly);
  verifiedRef.current = verifiedOnly;

  // Set/clear the `verified` query param for a layer fetch: ONLY the cobertura
  // layer carries it (the toggle is rabies-specific), and only while the toggle
  // is on. Kept as a ref-read so every fetch site (level change, scope refetch,
  // toggle-on) threads the SAME live value without re-subscribing.
  const applyVerifiedParam = useCallback((params: URLSearchParams, id: LayerId) => {
    if (id === "cobertura" && verifiedRef.current) params.set("verified", "1");
    else params.delete("verified");
  }, []);

  // panorama-ia-v2 §1.1: the aggregation level is no longer a manual control
  // (AggregationToggle was removed). It is DERIVED from (scope, zoom): scope
  // selection or zooming past Z_LOCALITY drills the map to the locality mark,
  // preferring the finer precision whenever it renders (PO decision #1). The
  // live camera zoom flows up from SituationalMap via `onZoom`.
  const [mapZoom, setMapZoom] = useState<number>(Z_LOCALITY - 1);
  const onMapZoom = useCallback((zoom: number) => setMapZoom(zoom), []);

  // panorama-event-points — near-zoom REAL event-location DOTS (design D1/D2).
  //
  // A DEDICATED, additive cache slot (A5): points features live HERE, never in
  // dataRef/provinceDataRef, so there is NO collision with the locality-aggregated
  // cache at the same `level` — toggling points↔aggregated repaints from the
  // correct source with no stale paint. `pointsMode` is a UX gate only; the server
  // independently re-derives it (see the points effect + route). Points-capable
  // layers (POINTS_LAYER_IDS): perdidas (Slice 1, sightings), mordeduras (Slice 2,
  // operator-scoped incidents), denuncias (Slice 3, locality centroids).
  const pointsDataRef = useRef<Map<LayerId, FeatureCollection>>(new Map());
  // Version bump to recompute the activeLayers memo after a points fetch resolves
  // (the cache is a ref). The disclosure meta (cap + "sin ubicación" residual) is
  // kept OUT of `states` (A6: distinct copy) so it never races the aggregated fetch.
  const [pointsVersion, setPointsVersion] = useState(0);
  // Per-layer disclosure meta, keyed by layer id (a layer may go active/inactive
  // independently; a single record avoids one layer's fetch clobbering another's).
  const [pointsInfo, setPointsInfo] = useState<
    Record<string, { count: number; truncated: boolean; sinUbicacion: number }>
  >({});
  // Effective scope for the UX points gate: an explicit picker province wins
  // (embedded-drill: the CLIENT-committed scope, not the stale searchParams);
  // otherwise the govt operator's implicit single-province scope.
  const pointsScopeProvince = effectiveScopeProvince ?? initialDivisionProvince;
  const pointsScopeLocality = effectiveScopeLocality;
  const pointsMode = pointsEligible(
    { country: "AR", province: pointsScopeProvince, locality: pointsScopeLocality },
    mapZoom,
  );

  // Panorama hardening (task #39): a monotonic key that forces a full remount of
  // the map island. Bumped by the MapErrorBoundary's retry when a render throw
  // took the map down — a fresh SituationalMap re-inits MapLibre from scratch.
  const [mapReloadKey, setMapReloadKey] = useState(0);

  const [states, setStates] = useState<Record<LayerId, LayerPanelState>>(() => {
    const s = initialState();
    const urlLayerIds = parseLayersParam(searchParams.get("layers"));
    if (urlLayerIds === null) {
      if (hasSeed) {
        // First-visit fast path (perf plan 1.2): the server seeded the
        // role-default preset's layers. Mark each active + NON-loading with its
        // seeded envelope so the map paints on first render with no client
        // fetch (perdidas is NOT seeded on this path — the preset owns the board).
        for (const seed of seededLayers) {
          s[seed.id] = {
            active: true,
            loading: false,
            count: seed.features.features.length,
            suppressedCount: seed.suppressedCount,
            noLocalityCount: seed.noLocalityCount,
            truncated: seed.truncated,
          };
        }
        return s;
      }
      // No explicit board in the URL — the server-seeded default layer is on.
      s[defaultLayerId] = {
        active: true,
        loading: false,
        count: defaultFeatures.features.length,
        suppressedCount: defaultSuppressedCount,
        noLocalityCount: defaultNoLocalityCount ?? 0,
        truncated: defaultTruncated,
      };
      return s;
    }
    // URL board: the `layers` param defines the active set. The default layer
    // keeps its server seed only at the axis the server seeded it at
    // (initialLevel); everything else starts loading and is resolved by the
    // mount effect below.
    const urlLevelRaw = searchParams.get("level");
    const urlLevel: AggregationLevel =
      urlLevelRaw === "locality" || urlLevelRaw === "province" ? urlLevelRaw : initialLevel;
    for (const id of urlLayerIds) {
      const seeded =
        id === defaultLayerId && urlLevel === initialLevel && isAggregatedPointLayer(id);
      s[id] = seeded
        ? {
            active: true,
            loading: false,
            count: defaultFeatures.features.length,
            suppressedCount: defaultSuppressedCount,
            noLocalityCount: defaultNoLocalityCount,
            truncated: defaultTruncated,
          }
        : {
            active: true,
            loading: true,
            count: 0,
            suppressedCount: 0,
            noLocalityCount: 0,
            truncated: false,
          };
    }
    return s;
  });
  // Mirror of `states` for effects that must read the latest active set without
  // re-subscribing (the as-of refetch keys on asOf, not on every layer toggle).
  const statesRef = useRef(states);
  statesRef.current = states;

  // Headline KPIs: seeded server-side, re-fetched when the scope/period
  // searchParams change so the strip stays IDENTICAL to the dashboards for the
  // active alcance. The API mirrors the [layer] route's auth + scope rules.
  const [kpis, setKpis] = useState<PanoramaKpis>(() => initialKpis ?? loadingPanoramaKpis());
  // perf plan 1.3: while the streamed KPI promise is unresolved the strip shows
  // a "Cargando indicadores…" pending state. True only on the streaming path (a
  // promise but no resolved seed); the awaited `initialKpis` path starts settled.
  const [kpisPending, setKpisPending] = useState<boolean>(
    initialKpis == null && kpisPromise != null,
  );
  // last-set-wins guard (perf plan 1.3): once a client refetch (a changed
  // scope/period) has taken over the KPI strip, the late-resolving streamed seed
  // — computed for the ORIGINAL scope — must not clobber the fresher client
  // numbers. Set when the refetch effect below actually issues a request.
  const clientKpiTookOverRef = useRef(false);
  // error-path audit 2026-07-04 finding E5: a failed KPI refetch used to be
  // silently swallowed, leaving stale numbers on screen with no signal that
  // they no longer reflect the active scope/period. kpisStale surfaces that
  // without touching the no-flash behavior (the last-known kpis stay put).
  const [kpisStale, setKpisStale] = useState(false);
  const qs = searchParams.toString();
  // map-QOL: KPI refetches key on the SCOPE+PERIOD subset only — the shallow
  // board params (layers/level/preset) don't change what the KPIs measure.
  // Embedded-drill: fold the CLIENT-committed scope (effectiveScope*) over the
  // searchParams scope so a shallow drill recomputes this key — which is exactly
  // what re-triggers the generic KPI-refetch + layer-invalidation effects below
  // (they already read window.location.search, updated by the pushState).
  const scopePeriodQs = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (effectiveScopeProvince) params.set("province", effectiveScopeProvince);
    else params.delete("province");
    if (effectiveScopeLocality) params.set("locality", effectiveScopeLocality);
    else params.delete("locality");
    return scopePeriodQsOf(params);
  }, [searchParams, effectiveScopeProvince, effectiveScopeLocality]);
  // "Copiar vista" fidelity: a restored scrub position decoded ONCE from the mount
  // URL. Declared here (ahead of the KPI refetch, which folds asOf into its key) so
  // a deep-linked ?asOf frame reconciles the strip on mount. Client-only.
  const [initialAsOf] = useState<Date | null>(() =>
    typeof window === "undefined"
      ? null
      : parseAsOfFromParams(new URLSearchParams(window.location.search)),
  );
  // Current as-of upper bound. null = live (parked at "ahora"). Lazy-init from a
  // restored scrub day so the console fetches the as-of features immediately on
  // load (the scrubber independently seeks its slider to the same day).
  const [asOf, setAsOf] = useState<Date | null>(() => initialAsOf);

  // Coherence hybrid (cowork QA H1): the temporal-scrub cutoff as a stable ISO
  // string (a new Date identity per render must not thrash the as-of KPI effect
  // below). Null = parked at live.
  const asOfKpiIso = asOf ? asOf.toISOString() : null;
  // Build the KPI query string for the CURRENT scope/period + an optional as-of
  // cutoff. Shared by the as-of KPI effect below (the scope/period effect uses the
  // plain scopePeriodQs — no as-of, unchanged from before the hybrid).
  const kpiFetchQs = useMemo(() => {
    const params = new URLSearchParams(scopePeriodQs);
    if (asOfKpiIso) params.set("asOf", asOfKpiIso);
    return params.toString();
  }, [scopePeriodQs, asOfKpiIso]);
  // Skip the refetch for the very first render (the server already seeded the
  // KPIs for the initial searchParams); only refetch when the filters change.
  const seededQsRef = useRef<string | null>(scopePeriodQs);
  useEffect(() => {
    if (seededQsRef.current === scopePeriodQs) {
      seededQsRef.current = null;
      return;
    }
    // perf plan 1.3: the scope/period changed → this client refetch owns the KPI
    // strip from here on. Mark the takeover so a late-resolving streamed seed
    // (computed for the previous scope) can no longer clobber these fresher
    // numbers when it settles.
    clientKpiTookOverRef.current = true;
    let cancelled = false;
    fetch(`/api/panorama/kpis${scopePeriodQs ? `?${scopePeriodQs}` : ""}`, {
      headers: { accept: "application/json" },
      signal: signalFor("kpis"),
    })
      .then((r) => (r.ok ? (r.json() as Promise<PanoramaKpis>) : null))
      .then((body) => {
        if (cancelled) return;
        if (body) {
          setKpis(body);
          setKpisStale(false);
        } else {
          setKpisStale(true);
        }
        // The client refetch settled → drop the initial streaming pending state
        // (a no-op once the seed already resolved).
        setKpisPending(false);
      })
      .catch((err) => {
        // Superseded fetch (keyed abort) — a newer KPI request is in flight:
        // not a failure, the fresher response will land instead.
        if (isAbortError(err)) return;
        // Leave the last-known KPIs in place on a transient failure (no
        // flash) but surface it — this used to be a silent no-op.
        if (cancelled) return;
        console.error("[PanoramaConsole] KPI refresh failed", err);
        setKpisStale(true);
        setKpisPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopePeriodQs, signalFor]);

  // Coherence hybrid (cowork QA H1) — a DEDICATED as-of KPI refetch, kept SEPARATE
  // from the scope/period effect above so the scrubber's rapid asOf changes never
  // re-run the scope-takeover bookkeeping (seededQsRef/clientKpiTookOverRef). When
  // the operator scrubs, the temporal KPIs (mordeduras/zoonosis/denuncias-in-period)
  // must recompute as-of the cutoff so the big numbers track the map + Registros the
  // scrubber already moves. Fires on every asOf transition — including back to live
  // (asOf→null, which the scope/period effect does NOT observe since scopePeriodQs is
  // unchanged) — so returning to "ahora" restores the live strip. `signalFor("kpis")`
  // shares the KPI abort key, so a rapid scrub supersedes in-flight requests.
  const asOfKpiSeededRef = useRef<boolean>(initialAsOf === null);
  const kpiFetchQsRef = useRef(kpiFetchQs);
  kpiFetchQsRef.current = kpiFetchQs;
  // biome-ignore lint/correctness/useExhaustiveDependencies: asOfKpiIso is the sole intended trigger — scope/period changes are handled by the effect above; kpiFetchQs is read live via a ref and signalFor is stable.
  useEffect(() => {
    // Mount pass: skip when seeded at LIVE (server strip already matches). A deep
    // link that mounts WITH an ?asOf starts unseeded so the strip reconciles to the
    // restored scrub frame on mount.
    if (asOfKpiSeededRef.current) {
      asOfKpiSeededRef.current = false;
      return;
    }
    // Round-2 review #3: the map moves on THIS tick but the strip won't update
    // until the debounce + fetch land — showing the previous frame's numbers over
    // an as-of map is a transient invariant violation. Flip to the pending state
    // the MOMENT asOf changes so the strip reads "actualizando", never a stale
    // temporal number, until the fresh figure arrives.
    setKpisPending(true);
    // DEBOUNCE the as-of refetch: a scrub-DRAG emits a burst of asOf values, and a
    // KPI fetch per tick both hammers the endpoint and contends with the per-tick
    // temporal-LAYER refetch (which owns the map). Coalesce to the settled cutoff
    // (~250ms) so the strip catches up once the operator lands on a date — the map
    // still moves live via its own effect. (This also keeps the KPI fetch from
    // racing a layer toggle mid-scrub — cowork QA H1 regression.)
    let cancelled = false;
    const timer = setTimeout(() => {
      const qs = kpiFetchQsRef.current;
      clientKpiTookOverRef.current = true;
      fetch(`/api/panorama/kpis${qs ? `?${qs}` : ""}`, {
        headers: { accept: "application/json" },
        signal: signalFor("kpis"),
      })
        .then((r) => (r.ok ? (r.json() as Promise<PanoramaKpis>) : null))
        .then((body) => {
          if (cancelled) return;
          if (body) {
            setKpis(body);
            setKpisStale(false);
          } else {
            setKpisStale(true);
          }
          setKpisPending(false);
        })
        .catch((err) => {
          if (isAbortError(err) || cancelled) return;
          console.error("[PanoramaConsole] as-of KPI refresh failed", err);
          setKpisStale(true);
          // Never leave the strip stuck on the pending state after a real failure.
          setKpisPending(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // asOfKpiIso is the sole trigger (scope/period changes are handled by the effect
    // above); kpiFetchQs/signalFor are read live via refs/stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfKpiIso]);

  // perf plan 1.3 — resolve the streamed KPI promise into state. The page creates
  // the loader promise and passes it un-awaited over RSC so SSR never blocks on
  // the (cold) KPI fan-out; here we await it on the client and drop the pending
  // state. The last-set-wins guard skips the assignment when a client refetch has
  // already superseded the seed (its scope/period differs), so a slow seed can't
  // overwrite fresher numbers. The page attaches `.catch(() =>
  // degradedPanoramaKpis())`, so this promise RESOLVES (never rejects) to either
  // the real strip or an honest degraded one; the `.catch` here is defensive.
  useEffect(() => {
    if (kpisPromise == null) return;
    let cancelled = false;
    // Promise.resolve() is load-bearing: an RSC-streamed promise arrives on the
    // client as a React thenable whose .then() returns undefined (not chainable),
    // so calling .catch() on the .then() result throws and the ErrorBoundary
    // takes down the whole console. Wrapping normalizes it to a real Promise.
    Promise.resolve(kpisPromise)
      .then((resolved) => {
        if (cancelled) return;
        if (!clientKpiTookOverRef.current) setKpis(resolved);
        setKpisPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Never leave the strip stuck pending on an unexpected rejection.
        setKpisPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kpisPromise]);

  // W2 fix: the COMMITTED period preset. A preset commit / board restore writes
  // `period=` via a SHALLOW History replace that `useSearchParams()` can't observe,
  // so keying the period chrome (scrubber axis + PeriodPicker) off searchParams
  // alone left it stuck on the 3y default while the data showed the preset window.
  // This state carries the truth; both chrome consumers prefer it (searchParams
  // fallback). Lazy-init on the seeded first-visit so the chrome agrees with the
  // seeded data from FIRST paint (SSR + hydration compute the same initializer, so
  // no hydration mismatch); null on the normal path → searchParams wins as before.
  const [committedPeriod, setCommittedPeriod] = useState<string | null>(() => {
    if (hasSeed && seededPresetId != null) return getPreset(seededPresetId)?.periodPreset ?? null;
    return null;
  });

  // --- F4 temporal reproduction -------------------------------------------
  // The active period window [since, until] drives the scrubber axis. Resolved
  // from the committed period (a shallow preset commit) when present, else the
  // SAME searchParams the server used (parity). `until` is "ahora".
  //
  // Memo keys are the PARAM STRINGS, not the searchParams object identity:
  // `until` is minted from Date.now() on every recompute, so an identity-only
  // searchParams refresh (e.g. an ?asOf= camera/scrub write that never touches
  // period/from/to) would re-mint a drifted `until`, which the TimeScrubber
  // reads as a WINDOW CHANGE and parks the scrub back at live — silently
  // cancelling an active scrub (v2C dock QA, 2026-07-11). String keys make the
  // window stable until the period actually changes.
  const periodParam = committedPeriod ?? searchParams.get("period") ?? PANORAMA_DEFAULT_PRESET;
  const fromParam = searchParams.get("from") ?? undefined;
  const toParam = searchParams.get("to") ?? undefined;
  const { since, until } = useMemo(
    () =>
      resolveAnalyticsPeriod({
        // Panorama defaults to a multi-year window so the scrubber spans the
        // seeded history; the detail dashboards keep their own short defaults.
        period: periodParam,
        from: fromParam,
        to: toParam,
      }),
    [periodParam, fromParam, toParam],
  );

  // "Copiar vista" fidelity: decode the shared camera + scrub position ONCE from
  // the mount URL (client-only — the map + scrubber consume these only in mount
  // effects, never in SSR render, so a server/client value difference is inert).
  // The camera is reproduced by SituationalMap's load handler; the scrub day
  // seeks the TimeScrubber post-mount so the reproduced view matches the sender.
  const [initialCamera] = useState<MapCamera | null>(() =>
    typeof window === "undefined"
      ? null
      : parseCameraFromParams(new URLSearchParams(window.location.search)),
  );
  // H14 (cowork QA): a deep link with an explicit ?province but NO ?z/lat/lng
  // (camera) used to stay framed on the NATIONAL view — the drill-by-select/click
  // frames, but the URL entry did not. Signal SituationalMap to frame the province
  // polygon ONCE on load, but ONLY when: (a) the URL pins a province, (b) no exact
  // camera is being restored (that wins), and (c) the operator is not
  // jurisdiction-pinned (a scoped govt keeps their own server bbox). Mount-once,
  // client-only — like initialCamera, it drives an imperative post-load map action
  // so an SSR/client difference is inert.
  const [frameProvinceOnLoad] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    const province = p.get("province");
    return (
      province != null &&
      province !== "" &&
      provinceByCode(province) != null &&
      parseCameraFromParams(p) == null &&
      initialDivisionProvince == null
    );
  });
  const scrubbing = asOf !== null;
  // panorama-vista-redesign QA fix: bumped whenever THIS console forces asOf
  // back to null OUTSIDE a since/until (period) change — a scope-only change
  // (see the invalidation effect below) or temporal availability flipping
  // off (see the temporalAvailable effect near the end). Threaded into
  // TimeScrubber as `resetToken` so its internal slider index resets even
  // when `since`/`until` stay identical (its own win-change reset never
  // fires in that case) — otherwise the scrubber immediately re-emits its
  // stale non-live asOf and undoes this console's own reset.
  const [scrubResetToken, setScrubResetToken] = useState(0);

  // v2C floating dock — collapsed by default (PO re-ratified 2026-07-11: "MÁS
  // MAPA, la lista es opcional"). A deep link that pins a scrub position
  // (?asOf=) opens on the timeline tab so the restored scrubber is visible —
  // otherwise the park-at-live guard (below, near temporalAvailable) would
  // clobber the shared position the moment the hidden scrubber unmounted.
  const [dockOpen, setDockOpen] = useState<boolean>(() => initialAsOf !== null);
  const [dockTab, setDockTab] = useState<PanoramaDockTab>(() =>
    initialAsOf !== null ? "timeline" : "registros",
  );

  // task #77 bitemporal — the replay basis. "valid" (occurred_at, default) replays
  // "what happened when"; "transaction" (recorded_at) replays "what the State KNEW
  // when". Threaded into the as-of layer fetch as `?basis=`; only matters while
  // scrubbing (the live view is current-state, basis-agnostic). Client-only view
  // state — intentionally NOT URL-encoded (a replay basis is a viewing lens, not a
  // data-scope filter like level/verified).
  const [timeBasis, setTimeBasis] = useState<TimeBasis>("valid");
  const timeBasisRef = useRef(timeBasis);
  timeBasisRef.current = timeBasis;

  // A new period/scope window invalidates the as-of cache and parks at live. It
  // also invalidates the province-level cache and the LOCALITY-level entries in
  // dataRef for choropleth layers AND aggregated point layers (their counts are
  // period-sensitive). Reference layers keep their cache — they refetch on toggle.
  //
  // W2 fix: after clearing the caches, refetch any CURRENTLY ACTIVE layers that
  // are period-sensitive (aggregated point + choropleth). This still applies to
  // period/scope changes that stay within a client-router transition (e.g. the
  // aggregation-level toggle); the preset button now commits its period via a
  // full navigation (see onPreset below), which remounts the console instead of
  // relying on this effect.
  // The fetch uses the NEW searchParams via the effect closure.
  // Mount guard for the cache-invalidation effect below: the server already
  // seeded the default layer at the initial params (C2), so skip the first run.
  const layerSeededQsRef = useRef<string | null>(scopePeriodQs);
  // map-QOL: a preset commit (or board restore) pushes a new period AND fetches
  // its own layers in the same tick — this ref carries the scope+period qs that
  // commit already handled, so the invalidation effect skips one run instead of
  // double-fetching / wiping the just-seeded caches.
  const presetCommittedQsRef = useRef<string | null>(null);
  useEffect(() => {
    // Skip the FIRST run (mount): clearing + refetching here would wipe the C2
    // seed in provinceDataRef and flash a redundant load. Only react to ACTUAL
    // scope/period changes (board params layers/level/preset are excluded).
    if (layerSeededQsRef.current === scopePeriodQs) {
      layerSeededQsRef.current = null;
      return;
    }
    if (presetCommittedQsRef.current === scopePeriodQs) {
      presetCommittedQsRef.current = null;
      return;
    }
    asOfDataRef.current.clear();
    provinceDataRef.current.clear();
    for (const id of CHOROPLETH_IDS) dataRef.current.delete(id);
    for (const l of AGGREGATED_POINT_LAYERS) dataRef.current.delete(l.id);
    setAsOf(null);
    // QA fix (finding 3): a scope-only change (province/locality, period
    // unchanged) leaves `since`/`until` identical — TimeScrubber's win-change
    // reset never fires for it, so force its internal position back to live too.
    setScrubResetToken((v) => v + 1);

    // Refetch active period-sensitive layers at the new params.
    const activePeriodSensitive = [...CHOROPLETH_LAYERS, ...AGGREGATED_POINT_LAYERS].filter(
      (l) => statesRef.current[l.id]?.active,
    );
    if (activePeriodSensitive.length === 0) return;

    // Mark them loading before the async fetch.
    setStates((s) => {
      const next = { ...s };
      for (const l of activePeriodSensitive) {
        next[l.id] = { ...s[l.id], loading: true };
      }
      return next;
    });

    const currentQs = new URLSearchParams(window.location.search).toString();
    const currentLevel = levelRef.current;

    void Promise.all(
      activePeriodSensitive.map(async (l) => {
        const params = new URLSearchParams(currentQs);
        if (currentLevel === "province") params.set("level", "province");
        else if (isAggregatedPointLayer(l.id)) params.set("level", "locality");
        applyVerifiedParam(params, l.id);
        try {
          const res = await fetch(
            `/api/panorama/${l.id}${params.toString() ? `?${params.toString()}` : ""}`,
            { headers: { accept: "application/json" }, signal: signalFor(l.id) },
          );
          if (!res.ok) return;
          const body = (await res.json()) as ApiResponse;
          if (currentLevel === "province") {
            provinceDataRef.current.set(l.id, body.features);
          } else {
            dataRef.current.set(l.id, body.features);
          }
          setStates((s) => ({
            ...s,
            [l.id]: {
              ...s[l.id],
              loading: false,
              count: body.features.features.length,
              suppressedCount: body.suppressedCount,
              noLocalityCount: body.noLocalityCount ?? 0,
              truncated: body.truncated,
            },
          }));
        } catch (err) {
          // Superseded fetch — the newer request owns the layer state now.
          if (isAbortError(err)) return;
          setStates((s) => ({
            ...s,
            [l.id]: { ...s[l.id], loading: false },
          }));
        }
      }),
    ).then(() => setLevelVersion((v) => v + 1));
  }, [scopePeriodQs, signalFor, applyVerifiedParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the as-of moves, refetch the ACTIVE TEMPORAL layers at that instant and
  // repaint. Non-temporal layers are not refetched (they are dimmed instead).
  // A version counter forces the activeLayers memo to recompute after fetches
  // resolve (the caches are refs, so we bump state to re-render).
  const [asOfVersion, setAsOfVersion] = useState(0);
  useEffect(() => {
    if (asOf === null) {
      // Back to live — repaint from the live cache.
      setAsOfVersion((v) => v + 1);
      return;
    }
    const iso = asOf.toISOString();
    const baseQs = searchParams.toString();
    // The as-of frame must be fetched at the SAME aggregation axis it will render
    // at, or the province-framed map reads locality features (or vice-versa) and
    // the scrubber silently paints nothing. Mirror the province-cache fetch's
    // level logic. `level` (the state, in the deps) is read directly so a mid-scrub
    // level flip refetches the active temporal layers at the new axis.
    const currentLevel = level;
    const activeTemporal = PANORAMA_LAYERS.filter(
      (l) => statesRef.current[l.id]?.active && isTemporalLayer(l.id),
    );
    if (activeTemporal.length === 0) {
      setAsOfVersion((v) => v + 1);
      return;
    }
    let cancelled = false;
    Promise.all(
      activeTemporal.map(async (l) => {
        const params = new URLSearchParams(baseQs);
        params.set("asOf", iso);
        if (currentLevel === "province") params.set("level", "province");
        else if (isAggregatedPointLayer(l.id)) params.set("level", "locality");
        // task #77: replay by recorded_at when the operator picked transaction time.
        if (timeBasis === "transaction") params.set("basis", "transaction");
        try {
          // QA fix (finding 4): keyed abort, mirroring the KPI/toggle fetches
          // — a rapid scrub or basis flip supersedes the prior in-flight
          // as-of request for this layer instead of racing it into
          // asOfDataRef out of order.
          const res = await fetch(`/api/panorama/${l.id}?${params.toString()}`, {
            headers: { accept: "application/json" },
            signal: signalFor(`${l.id}:asOf`),
          });
          if (!res.ok) return;
          const body = (await res.json()) as ApiResponse;
          asOfDataRef.current.set(l.id, body.features);
        } catch (err) {
          // Superseded fetch — the newer as-of request owns this layer now.
          if (isAbortError(err)) return;
          // Leave the last-known as-of features in place on a transient failure.
        }
      }),
    ).then(() => {
      if (!cancelled) setAsOfVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [asOf, searchParams, timeBasis, signalFor, level]);

  // Selected map feature → DetailDrawer. Null when the drawer is closed.
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const onFeatureClick = useCallback(
    (layerId: string, properties: Record<string, unknown>) => {
      const reg = getLayer(layerId as LayerId);
      if (!reg) return;
      // Thread the active period/scope query string so the DetailDrawer's
      // unit-history fetch uses the SAME window as the map (F4).
      setSelected({ layerId: reg.id, layerLabel: reg.label, properties, periodQs: qs });
    },
    [qs],
  );
  const closeDrawer = useCallback(() => setSelected(null), []);

  // panorama embedded-drill — commit a province/locality scope change WITHOUT a
  // reload. Supersedes the interim `window.location.assign` cure (task #55): the
  // scope commit is now a shallow History pushState (immune to the Next
  // router-drop defect, engram #621/#622, exactly like the preset/period
  // commits) + a client refetch. Ordering:
  //   1. Build + push the new `?province=/?locality=` URL (dropping the stale
  //      camera — a frame is only valid for the scope it was captured in).
  //   2. setScopeOverride → recomputes the EFFECTIVE scope, which (a) re-frames
  //      the map via the existing A1 autozoom effect (province bbox from the
  //      in-map polygons — NO server bounds needed), (b) re-derives the level
  //      (scope-wins → locality), and (c) recomputes scopePeriodQs so the
  //      generic KPI-refetch + layer-invalidation effects refetch in place.
  //   3. Fetch the scope bundle (localities + centroids) so the switcher
  //      dropdown + the map's locality autozoom track the drilled province.
  // GRACEFUL FALLBACK: if the scope-bundle fetch fails (network/500), fall back
  // to a full document navigation so a broken drill degrades to today's behavior
  // (the server re-renders the drilled scope), never a half-updated dead map.
  // Shared scope-bundle fetch — refreshes the switcher localities + the map's
  // locality-autozoom centroids for `province`, using the caller-supplied abort
  // signal (so both the drill path and the popstate path get last-write-wins
  // cancellation via the same "scope" key). A non-abort failure degrades to a
  // full document navigation to `fallbackUrl` (the server re-renders the scope),
  // never a half-updated dead map.
  const fetchScopeBundle = useCallback(
    (province: string, signal: AbortSignal, fallbackUrl: string) => {
      const sp = new URLSearchParams({ province });
      fetch(`/api/panorama/scope?${sp.toString()}`, {
        headers: { accept: "application/json" },
        signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{
            localities: Array<{ slug: string; name: string }>;
            localityCentroids: LocalityCentroids;
          }>;
        })
        .then((body) => {
          setScopeData({
            localities: body.localities ?? [],
            centroids: body.localityCentroids ?? {},
          });
        })
        .catch((err) => {
          // Superseded fetch (a newer drill supersedes this one) — not a failure.
          if (isAbortError(err)) return;
          window.location.assign(fallbackUrl);
        });
    },
    [],
  );
  const commitScopeDrill = useCallback(
    (province: string | null, locality: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (province) params.set("province", province);
      else params.delete("province");
      if (locality) params.set("locality", locality);
      else params.delete("locality");
      stripCameraParams(params);
      const qsStr = params.toString();
      const targetUrl = `${window.location.pathname}${qsStr ? `?${qsStr}` : ""}`;
      const provinceChanged = province !== effectiveScopeProvince;
      // Finding 3: abort any in-flight scope bundle UNCONDITIONALLY — a
      // return-to-national (or a locality-only pick) must not let a slow province
      // bundle resolve LATER and clobber scopeData back to the abandoned province.
      const scopeSignal = signalFor("scope");
      pushMapStateUrl(targetUrl);
      setScopeOverride({ province, locality });

      // National scope (return-to-national) needs no bundle — reset in place.
      if (!province) {
        setScopeData({ localities: [], centroids: {} });
        // Live-QA regression (2026-07-11): a drill flips the derived level to
        // "locality" (scope-wins) and the autozoom leaves the camera at the
        // drilled-in zoom. Returning to national must NOT leave the level stuck
        // in "Localidades" (a national locality choropleth reads "sin datos").
        // Reset the camera baseline to the national default so the (scope, zoom)
        // hysteresis re-derives "province" immediately, instead of holding
        // "locality" off the stale drilled-in zoom until the fit animation ends.
        setMapZoom(Z_LOCALITY - 1);
        return;
      }
      // Only the PROVINCE change needs a fresh localities/centroids bundle; a
      // locality-only pick keeps the already-loaded province bundle.
      if (!provinceChanged) return;
      fetchScopeBundle(province, scopeSignal, targetUrl);
    },
    [signalFor, effectiveScopeProvince, fetchScopeBundle],
  );

  // Click-to-drill (task #55): a clicked province → embedded scope commit.
  const onProvinceDrill = useCallback(
    (provinceCode: string) => commitScopeDrill(provinceCode, null),
    [commitScopeDrill],
  );
  // In-map "← Volver": pop the province drill back to the national view.
  const onReturnNational = useCallback(() => commitScopeDrill(null, null), [commitScopeDrill]);
  // JurisdictionSwitcher (embedded): a province/locality pick → embedded commit.
  const onSwitcherScopeCommit = useCallback(
    (scope: JurisdictionScope) => commitScopeDrill(scope.province, scope.locality),
    [commitScopeDrill],
  );

  // panorama embedded-drill — browser Back/Forward. A drill commits scope via a
  // NATIVE history.pushState (immune to the router-drop defect, engram
  // #621/#622) and mirrors it in `scopeOverride`, which SHADOWS useSearchParams.
  // But useSearchParams does NOT observe a native popstate in this Next version
  // either — so without this, Back would pop the URL while the map/KPIs/switcher
  // stayed drilled (URL ⇄ view diverge). On popstate we read the POPPED URL
  // straight off window.location and drive the SAME state the drill path does —
  // state-driven, so it is correct whether or not the router re-syncs. The
  // reverted scope's bundle is refreshed for a ?province= URL, aborting any
  // in-flight bundle via the shared "scope" key.
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const province = params.get("province");
      const locality = params.get("locality");
      const prevProvince = effectiveScopeProvinceRef.current;
      setScopeOverride({ province, locality });
      // MAP-2: also re-derive the board (preset/layers) from the popped URL — the
      // scope resync alone left the tab/legend/bubbles/KPIs on the previous preset.
      resyncBoardFromUrlRef.current?.(params);
      if (!province) {
        // Return-to-national: abort any in-flight province bundle, reset in place.
        signalFor("scope");
        setScopeData({ localities: [], centroids: {} });
        // Same reset as commitScopeDrill's national branch: the popped URL implies
        // the national province axis (no ?level), so drop the camera baseline to
        // the national default and let the (scope, zoom) hysteresis flip the level
        // back to "province" — otherwise Back leaves the choropleth stuck in
        // "Localidades" off the stale drilled-in zoom (live-QA regression).
        setMapZoom(Z_LOCALITY - 1);
        return;
      }
      // Same province popped (locality-only change) — the loaded bundle still holds.
      if (province === prevProvince) return;
      fetchScopeBundle(province, signalFor("scope"), window.location.href);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [signalFor, fetchScopeBundle]);

  // Province-fetch version counter — bumped after a province-level choropleth
  // fetch resolves so the activeLayers memo recomputes (the cache is a ref).
  const [levelVersion, setLevelVersion] = useState(0);

  // map-QOL: per-layer opacity multiplier (Personalizar slider). Client-only
  // presentation state — intentionally NOT URL-encoded (the board shares WHAT
  // is shown; how translucent a layer looks is a local viewing preference).
  const [opacities, setOpacities] = useState<Partial<Record<LayerId, number>>>({});
  const onOpacity = useCallback((id: LayerId, value: number) => {
    setOpacities((prev) => ({ ...prev, [id]: value }));
  }, []);

  // panorama-vista-redesign Phase 2: CapasBox Simple/Detalle. Client-only UI
  // pref — persisted (tolerantly) in the board key by Phase 5, never a URL
  // param. Defaults to Simple (false) so a fresh load stays additive-looking.
  const [capasDetail, setCapasDetail] = useState(false);
  // panorama-vista-redesign Phase 4: TimeScrubber Simple/Detalle. Same
  // treatment as capasDetail — client-only, persisted tolerantly (Phase 5).
  const [scrubDetail, setScrubDetail] = useState(false);
  // panorama-vista-redesign Phase 5: ref mirrors so saveBoard's callers (which
  // don't want to depend on — and re-create their identity around — every
  // Simple/Detalle flip) always read the LIVE values, matching the existing
  // verifiedRef/levelRef/timeBasisRef pattern.
  const capasDetailRef = useRef(capasDetail);
  capasDetailRef.current = capasDetail;
  const scrubDetailRef = useRef(scrubDetail);
  scrubDetailRef.current = scrubDetail;

  // task #38 v3 rail — the open rail panel id (null = closed). Controlled here so
  // a KPI card's "Ver metodología" can open the Acerca panel and only one panel
  // is ever open. The Filtro panel reuses `capasDetail`; the others own a local
  // Simple/Detalle flag.
  const [railOpen, setRailOpen] = useState<string | null>(null);
  const [vistaDetail, setVistaDetail] = useState(false);
  const [periodoDetail, setPeriodoDetail] = useState(false);
  const [exportDetail, setExportDetail] = useState(false);
  const [acercaDetail, setAcercaDetail] = useState(false);
  // task #38 v3 — the map's exportPng, bridged up from SituationalMap (map-ref
  // coupled) so the "Exportar" rail panel can fire it.
  const exportPngFnRef = useRef<(() => void) | null>(null);
  const registerExportPng = useCallback((fn: (() => void) | null) => {
    exportPngFnRef.current = fn;
  }, []);
  // "Copiar vista" — a deep link to the current board (was map-owned; lifted to
  // the Exportar rail panel — it only needs window.location + the clipboard).
  const [copied, setCopied] = useState(false);
  const copyView = useCallback(() => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => {
        /* clipboard denied — the URL is still shareable from the address bar. */
      },
    );
  }, []);

  // task #63: the bivariate "riesgo-brotes" map encoding. Client-only view state
  // (like opacities) — never URL-encoded. Offered ONLY for the "Brotes activos"
  // preset at province framing (where cobertura × zoonosis both land in the
  // province cache); default OFF so nothing changes until the operator opts in.
  const [bivariateMode, setBivariateMode] = useState(false);

  // ARCHETYPE A: the map's scale legends render OFF-canvas in the "Referencias"
  // rail section (MapLegends). The province ramp + bivariate legends are derived
  // there from mapLayers; these two descriptors are computed imperatively inside
  // SituationalMap's syncLayers (from the rendered data) and lifted here.
  const [divisionLegend, setDivisionLegend] = useState<DivisionLegendDescriptor | null>(null);
  const [graduatedScale, setGraduatedScale] = useState<GraduatedScale | null>(null);
  // Sequential province choropleth classed scale(s), lifted so MapLegends paints
  // the SAME breaks/colors the fill renders (parity with divisionLegend) — never
  // a live-edge recompute that diverges from the locked fill mid-scrub.
  const [provinceSeqLegend, setProvinceSeqLegend] = useState<ProvinceSeqLegend>({});

  // Build the active-layers array for the map from current state + cached data.
  // Under a scrub (asOf !== null): temporal layers paint their AS-OF features;
  // non-temporal layers are DIMMED (current-state data shown muted, never as if
  // it were as-of-t). asOfVersion forces a recompute after as-of fetches resolve.
  const activeLayers = useMemo<ActiveLayer[]>(() => {
    // The as-of features live in a ref (not React state), so `asOfVersion` is the
    // explicit recompute trigger bumped after each as-of fetch resolves. Reading
    // it here keeps the dependency honest (no unused-dep lint). levelVersion does
    // the same for the province cache.
    void asOfVersion;
    void levelVersion;
    void pointsVersion;
    const out: ActiveLayer[] = [];
    for (const l of PANORAMA_LAYERS) {
      if (!states[l.id]?.active) continue;
      const temporal = isTemporalLayer(l.id);
      const isAggregatedPoint = AGGREGATED_POINT_IDS.has(l.id);
      // panorama-event-points Slice 1: near-zoom REAL sighting dots override the
      // aggregated mark for a points-capable layer (perdidas) ONCE its dedicated
      // points cache has resolved. Until then it falls back to the aggregated
      // features below, so the map never blanks while the points fetch is inflight.
      const usesPoints = pointsMode && isPointsLayer(l.id) && pointsDataRef.current.has(l.id);
      // Choropleth layers in province mode fill basemap polygons (province cache).
      // Aggregated point layers (F1 density+signal) in province mode also read the
      // province cache — the server returned province-grouped AggregatedPointCells.
      const usesProvinceCache =
        !usesPoints && (CHOROPLETH_IDS.has(l.id) || isAggregatedPoint) && level === "province";
      // Order matters: a SCRUB on a temporal layer reads the as-of frame FIRST,
      // even at province framing — the as-of effect now fetches that frame at the
      // active level (province/locality), so it is the correct axis. Before this
      // reorder, `usesProvinceCache` short-circuited ahead of the scrub branch and
      // province-framed temporal layers always painted the LIVE province cache
      // (the scrubber moved, the bubbles never did).
      const features = usesPoints
        ? (pointsDataRef.current.get(l.id) ?? EMPTY_FC)
        : scrubbing && temporal
          ? (asOfDataRef.current.get(l.id) ?? EMPTY_FC)
          : usesProvinceCache
            ? (provinceDataRef.current.get(l.id) ?? EMPTY_FC)
            : (dataRef.current.get(l.id) ?? EMPTY_FC);

      // Resolve the point render mode:
      //   - points (perdidas real dots) → "points" (clustered pins, DetailDrawer)
      //   - density+signal → "graduated" (per-unit circles, no clustering)
      //   - reference (refugios/decomisos) → "reference" (discrete pins + clustering)
      //   - choropleth layers → renderMode omitted (handled by geomType path)
      const renderMode: PointRenderMode | undefined =
        l.geomType === "point"
          ? usesPoints
            ? "points"
            : isAggregatedPoint
              ? "graduated"
              : "reference"
          : undefined;

      out.push({
        id: l.id,
        color: l.color,
        label: l.label,
        geomType: l.geomType,
        renderMode,
        features,
        // Choropleth layers + aggregated point layers carry the active aggregation
        // level so the map can use it for popup labeling (e.g. "province" means
        // the feature represents a whole province). Points-mode + reference layers
        // omit it (individual dots are not an aggregation unit).
        level:
          !usesPoints && (l.geomType === "choropleth" || isAggregatedPoint) ? level : undefined,
        // Non-temporal layers can't be reproduced in time — mute them while scrubbing.
        dimmed: scrubbing && !temporal,
        // F5: thread data-type taxonomy + compliance target from the registry so
        // the map can choose divergent vs sequential choropleth rendering.
        dataType: l.dataType,
        complianceTarget: l.complianceTarget,
        // map-QOL: per-layer opacity multiplier from the Personalizar slider.
        opacity: opacities[l.id] ?? 1,
      });
    }
    return out;
    // asOfVersion + scrubbing + level + levelVersion + pointsMode/pointsVersion
    // are intentional triggers (the caches are refs).
  }, [states, scrubbing, asOfVersion, level, levelVersion, pointsMode, pointsVersion, opacities]);

  // panorama-event-points — resolve the REAL event-location dots for every ACTIVE
  // points-capable layer (perdidas / mordeduras / denuncias).
  //
  // Additive + orthogonal to the level/aggregation plumbing: this effect ONLY
  // populates the dedicated pointsDataRef + disclosure, it never touches the
  // aggregated caches. Runs when the UX gate opens (pointsMode, i.e. zoom ≥
  // Z_POINTS with a province in scope). Keyed on the scope+period subset AND the
  // active points-layer set so a province/period/toggle change refetches. The
  // SERVER is authoritative: it echoes `mode:"points"` only when it actually
  // returned dots; an aggregated/declined response clears that layer's overlay
  // (fall back to bubbles).
  const activePointsLayerIds = [...POINTS_LAYER_IDS]
    .filter((id) => states[id]?.active)
    .sort()
    .join(",");
  useEffect(() => {
    const activeIds = (activePointsLayerIds ? activePointsLayerIds.split(",") : []) as LayerId[];
    // Gate closed → clear every points overlay + disclosure and fall back to bubbles.
    if (!pointsMode || activeIds.length === 0) {
      if (pointsDataRef.current.size > 0) {
        pointsDataRef.current.clear();
        setPointsInfo({});
        setPointsVersion((v) => v + 1);
      }
      return;
    }
    // Drop cached points for any layer no longer active.
    for (const id of [...pointsDataRef.current.keys()]) {
      if (!activeIds.includes(id)) pointsDataRef.current.delete(id);
    }
    let cancelled = false;
    void Promise.all(
      activeIds.map(async (id) => {
        const params = new URLSearchParams(scopePeriodQs);
        params.set("mode", "points");
        try {
          const r = await fetch(`/api/panorama/${id}?${params.toString()}`, {
            headers: { accept: "application/json" },
            signal: signalFor(`${id}:points`),
          });
          if (!r.ok) return null;
          const body = (await r.json()) as ApiResponse;
          if (cancelled) return null;
          // Honor only a genuine server-authorized points response.
          if (body.mode !== "points") {
            pointsDataRef.current.delete(id);
            return null;
          }
          pointsDataRef.current.set(id, body.features);
          return [
            id,
            {
              count: body.features.features.length,
              truncated: body.truncated,
              sinUbicacion: body.sinUbicacionCount ?? 0,
            },
          ] as const;
        } catch (err) {
          // Superseded fetch (keyed abort) — a newer points request will land.
          if (isAbortError(err)) return null;
          // Transient failure: leave the aggregated bubbles showing (no flash).
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, { count: number; truncated: boolean; sinUbicacion: number }> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setPointsInfo(next);
      setPointsVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pointsMode, activePointsLayerIds, scopePeriodQs, signalFor]);

  // Fetch a temporal layer's AS-OF features into the as-of cache (used when a
  // layer is toggled on mid-scrub, so it paints at the current instant, not live).
  const fetchAsOfFor = useCallback(
    async (id: LayerId, at: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("asOf", at.toISOString());
      // task #77: honor the active replay basis (recorded_at when transaction).
      if (timeBasisRef.current === "transaction") params.set("basis", "transaction");
      try {
        // QA fix (finding 4): keyed abort — same `:asOf` key as the as-of
        // effect above, so a rapid re-toggle mid-scrub supersedes its own
        // prior in-flight request instead of racing it into asOfDataRef.
        const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
          headers: { accept: "application/json" },
          signal: signalFor(`${id}:asOf`),
        });
        if (!res.ok) return;
        const body = (await res.json()) as ApiResponse;
        asOfDataRef.current.set(id, body.features);
        setAsOfVersion((v) => v + 1);
      } catch (err) {
        // Superseded fetch — the newer as-of request owns this layer now.
        if (isAbortError(err)) return;
        // Leave the live features showing on a transient failure (no flash).
      }
    },
    [searchParams, signalFor],
  );

  // U5: fetch a choropleth layer at a given aggregation level into the right
  // cache (province → provinceDataRef; locality → dataRef). Returns the count so
  // the LayerPanel state can be refreshed. Threads the active scope/period qs.
  const fetchChoroplethAt = useCallback(
    async (id: LayerId, lvl: AggregationLevel, signalKey?: string): Promise<ApiResponse | null> => {
      const params = new URLSearchParams(searchParams.toString());
      if (lvl === "province") params.set("level", "province");
      applyVerifiedParam(params, id);
      try {
        // `signalKey` lets a caller (e.g. the boundary-prefetch warm fetch) use a
        // DISTINCT abort key so it never supersedes an active same-layer fetch.
        const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
          headers: { accept: "application/json" },
          signal: signalFor(signalKey ?? id),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as ApiResponse;
        if (lvl === "province") provinceDataRef.current.set(id, body.features);
        else dataRef.current.set(id, body.features);
        return body;
      } catch (err) {
        // RETHROW aborts: `null` means "failed" to callers (they run the
        // failure branch, deactivating the layer) — a superseded fetch must
        // never look like a failure. Callers early-return on AbortError.
        if (isAbortError(err)) throw err;
        return null;
      }
    },
    [searchParams, signalFor, applyVerifiedParam],
  );

  // map-QOL: fetch a set of layers into the right caches at a given aggregation
  // level, updating each layer's panel state as it resolves. Used by the fluid
  // preset commit (onPreset) and the mount/board-restore effect — both mark the
  // layers active+loading BEFORE calling this. `baseParams` carries the target
  // scope/period (the client-only board params are stripped from the API URL).
  const fetchLayersInto = useCallback(
    async (
      ids: LayerId[],
      lvl: AggregationLevel,
      baseParams: URLSearchParams,
      opts?: { preserveOnError?: boolean },
    ) => {
      await Promise.all(
        ids.map(async (id) => {
          const params = new URLSearchParams(baseParams);
          params.delete("layers");
          params.delete("preset");
          params.delete("level");
          const levelSensitive = CHOROPLETH_IDS.has(id) || isAggregatedPointLayer(id);
          if (levelSensitive && lvl === "province") params.set("level", "province");
          else if (isAggregatedPointLayer(id)) params.set("level", "locality");
          applyVerifiedParam(params, id);
          try {
            const qsStr = params.toString();
            const res = await fetch(`/api/panorama/${id}${qsStr ? `?${qsStr}` : ""}`, {
              headers: { accept: "application/json" },
              signal: signalFor(id),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as ApiResponse;
            if (levelSensitive && lvl === "province") {
              provinceDataRef.current.set(id, body.features);
            } else {
              dataRef.current.set(id, body.features);
            }
            setStates((s) => ({
              ...s,
              [id]: {
                active: true,
                loading: false,
                count: body.features.features.length,
                suppressedCount: body.suppressedCount,
                noLocalityCount: body.noLocalityCount ?? 0,
                truncated: body.truncated,
              },
            }));
          } catch (err) {
            // Superseded fetch (keyed abort): the NEWER request owns this
            // layer's state — running the failure branch here would
            // deactivate the layer on every superseded fetch.
            if (isAbortError(err)) return;
            // REFRESH path (opts.preserveOnError, staging QA 2026-07-08 #2): the
            // layer is ALREADY active with last-known data — a failed REFETCH
            // must NOT deactivate it. Deactivating would shrink `activeLayersKey`,
            // and the URL-sync effect would then write `layers=` (empty) and lose
            // the operator's selection — exactly the "Actualizar drops the layers"
            // symptom under load. Keep it active, drop the loading flag, retain
            // the last-known count/envelope.
            if (opts?.preserveOnError) {
              setStates((s) => ({ ...s, [id]: { ...s[id], loading: false } }));
              return;
            }
            // Initial activation path: the layer had no data — leave it off and
            // clear loading; no silent half-state.
            setStates((s) => ({
              ...s,
              [id]: {
                active: false,
                loading: false,
                count: 0,
                suppressedCount: 0,
                truncated: false,
              },
            }));
          }
        }),
      );
      setLevelVersion((v) => v + 1);
    },
    [signalFor, applyVerifiedParam],
  );

  // Switch the aggregation axis. Refetch the ACTIVE choropleth layers AND the
  // active density+signal point layers (F1 Panorama v2) at the new level if not
  // already cached, then repaint. Reference layers are not affected.
  // Cheap re-toggle: a cached level repaints instantly without a network round-trip.
  const onLevelChange = useCallback(
    (next: AggregationLevel) => {
      if (next === levelRef.current) return;
      setLevel(next);

      // Layers affected by the axis change: choropleth + aggregated point layers.
      const affectedLayers = [...CHOROPLETH_LAYERS, ...AGGREGATED_POINT_LAYERS].filter(
        (l) => statesRef.current[l.id]?.active,
      );

      const needFetch = affectedLayers.filter((l) =>
        next === "province" ? !provinceDataRef.current.has(l.id) : !dataRef.current.has(l.id),
      );
      if (needFetch.length === 0) {
        // All cached — bump so the memo repaints at the new level.
        setLevelVersion((v) => v + 1);
        return;
      }
      // Mark the layers loading while their level features resolve.
      setStates((s) => {
        const out = { ...s };
        for (const l of needFetch) out[l.id] = { ...s[l.id], loading: true };
        return out;
      });
      Promise.all(
        needFetch.map(async (l) => {
          let body: ApiResponse | null;
          try {
            body = await fetchChoroplethAt(l.id, next);
          } catch (err) {
            // Superseded fetch — the newer request owns this layer's state.
            if (isAbortError(err)) return;
            body = null;
          }
          setStates((s) => ({
            ...s,
            [l.id]: {
              ...s[l.id],
              loading: false,
              count: body?.features.features.length ?? s[l.id].count,
              suppressedCount: body?.suppressedCount ?? 0,
              noLocalityCount: body?.noLocalityCount ?? 0,
              truncated: body?.truncated ?? false,
            },
          }));
        }),
      ).then(() => setLevelVersion((v) => v + 1));
    },
    [fetchChoroplethAt],
  );

  // task #78 Part 3: flip the "solo firmado por matrícula" toggle. ONLY the
  // cobertura layer is affected — the vet-signed numerator differs from the
  // all-doses one, so every cached cobertura feature set is stale. Drop them and
  // refetch the active cobertura at the current level with the new definition.
  // The URL-sync effect encodes ?verified into the board; the KPI strip is NOT
  // refetched (its cobertura tile already shows BOTH total and firmado numbers).
  const onToggleVerified = useCallback(() => {
    const next = !verifiedRef.current;
    verifiedRef.current = next;
    setVerifiedOnly(next);

    dataRef.current.delete("cobertura");
    provinceDataRef.current.delete("cobertura");
    asOfDataRef.current.delete("cobertura");

    if (!statesRef.current.cobertura?.active) return;

    const lvl = levelRef.current;
    setStates((s) => ({ ...s, cobertura: { ...s.cobertura, loading: true } }));
    void (async () => {
      let body: ApiResponse | null;
      try {
        body = await fetchChoroplethAt("cobertura", lvl);
      } catch (err) {
        // Superseded fetch — the newer request owns the layer state now.
        if (isAbortError(err)) return;
        body = null;
      }
      setStates((s) => ({
        ...s,
        cobertura: {
          ...s.cobertura,
          loading: false,
          count: body?.features.features.length ?? s.cobertura.count,
          suppressedCount: body?.suppressedCount ?? 0,
          noLocalityCount: body?.noLocalityCount ?? 0,
          truncated: body?.truncated ?? false,
        },
      }));
      setLevelVersion((v) => v + 1);
    })();
  }, [fetchChoroplethAt]);

  /**
   * F2: Recompute compatibility hints for all INACTIVE layers given the
   * provided `activeIds` set. Returns a partial state patch so the caller can
   * merge it in a single `setStates` call.
   *
   * Inactive layers that are blocked get a `compatibilityHint`; those that
   * are no longer blocked have their hint cleared (set to undefined).
   * Active layers are never patched here — a hint on an active layer makes
   * no sense and would be confusing.
   */
  const computeHints = useCallback(
    (activeIds: LayerId[]): Partial<Record<LayerId, Partial<LayerPanelState>>> => {
      const patch: Partial<Record<LayerId, Partial<LayerPanelState>>> = {};
      for (const layer of PANORAMA_LAYERS) {
        if (activeIds.includes(layer.id)) continue; // active — skip
        const result = checkCompatibility(activeIds, layer.id, PANORAMA_LAYERS);
        patch[layer.id] = { compatibilityHint: result.allowed ? undefined : result.hint };
      }
      return patch;
    },
    [],
  );

  const onToggle = useCallback(
    async (id: LayerId) => {
      // A manual toggle exits preset mode.
      setActivePresetId(null);
      // Read the LIVE active flag from the ref, not the closure `states`: a rapid
      // burst of unrelated re-renders (e.g. the coherence-hybrid KPI refetch firing
      // on an asOf scrub) can leave this async callback bound to a stale `states`
      // snapshot, so a closure read could misclassify an active layer as inactive
      // and re-activate it instead of turning it off (cowork QA H1 regression).
      const wasActive = statesRef.current[id]?.active ?? false;
      if (wasActive) {
        // Turn off — keep cached data so a re-toggle is instant.
        // Recompute hints: removing this layer may unblock others.
        setStates((s) => {
          const nextActiveIds = PANORAMA_LAYERS.filter(
            (l) => l.id !== id && (s[l.id]?.active ?? false),
          ).map((l) => l.id);
          const hints = computeHints(nextActiveIds);
          const next = { ...s, [id]: { ...s[id], active: false, compatibilityHint: undefined } };
          for (const [lid, patch] of Object.entries(hints) as [
            LayerId,
            Partial<LayerPanelState>,
          ][]) {
            next[lid] = { ...next[lid], ...patch };
          }
          return next;
        });
        return;
      }

      // F2: check compatibility BEFORE activating the layer.
      const activeIds = PANORAMA_LAYERS.filter((l) => states[l.id]?.active ?? false).map(
        (l) => l.id,
      );
      // map-QOL: BASE layers are radio-exclusive. Activating a base while
      // another base is on SWAPS it (deactivates the current base in the same
      // update) instead of blocking with a hint — the slot rule stays enforced
      // by checkCompatibility below, run against the post-swap active set.
      const proposedLayer = getLayer(id);
      const swapOutIds =
        proposedLayer && roleOf(proposedLayer) === "base"
          ? activeIds.filter((aid) => {
              const al = getLayer(aid);
              return al !== undefined && roleOf(al) === "base";
            })
          : [];
      const remainingActiveIds = activeIds.filter((aid) => !swapOutIds.includes(aid));
      // Applies the base-swap to a state object: swapped-out layers go inactive.
      const withSwapOut = (s: Record<LayerId, LayerPanelState>) => {
        if (swapOutIds.length === 0) return s;
        const next = { ...s };
        for (const out of swapOutIds) {
          next[out] = { ...next[out], active: false, compatibilityHint: undefined };
        }
        return next;
      };
      const compat = checkCompatibility(remainingActiveIds, id, PANORAMA_LAYERS);
      if (!compat.allowed) {
        // Block the toggle — set the hint on this layer so the panel can explain why.
        setStates((s) => ({
          ...s,
          [id]: { ...s[id], compatibilityHint: compat.hint },
        }));
        return;
      }

      // Helper: apply F2 hint recomputation after `id` becomes active.
      // `nextActiveIds` is the new active set (including `id`).
      // Returns a function compatible with `setStates` updater so it can
      // be composed inside a single state update or called immediately after.
      const applyHintsAfterActivate = (
        s: Record<LayerId, LayerPanelState>,
        nextActiveIds: LayerId[],
      ): Record<LayerId, LayerPanelState> => {
        const hints = computeHints(nextActiveIds);
        const next = { ...s };
        for (const [lid, patch] of Object.entries(hints) as [LayerId, Partial<LayerPanelState>][]) {
          if (lid !== id) next[lid] = { ...next[lid], ...patch };
        }
        // The newly activated layer never carries a compatibility hint.
        next[id] = { ...next[id], compatibilityHint: undefined };
        return next;
      };

      // Choropleth or aggregated-point layer toggled on while the axis is
      // "Provincia": resolve at province level, reading/writing the province cache.
      // Locality mode falls through to the standard fetch path below.
      const useProvinceCache =
        (CHOROPLETH_IDS.has(id) || isAggregatedPointLayer(id)) && levelRef.current === "province";
      if (useProvinceCache) {
        if (provinceDataRef.current.has(id)) {
          const fc = provinceDataRef.current.get(id) ?? EMPTY_FC;
          setStates((s) => {
            const nextActive = remainingActiveIds.concat(id);
            const base = {
              ...withSwapOut(s),
              [id]: { ...s[id], active: true, loading: false, count: fc.features.length },
            };
            return applyHintsAfterActivate(base, nextActive);
          });
          setLevelVersion((v) => v + 1);
          return;
        }
        setStates((s) => ({ ...s, [id]: { ...s[id], active: true, loading: true } }));
        let body: ApiResponse | null;
        try {
          body = await fetchChoroplethAt(id, "province");
        } catch (err) {
          // Superseded fetch — the newer request owns this layer's state:
          // never run the failure branch (it would deactivate the layer).
          if (isAbortError(err)) return;
          body = null;
        }
        setStates((s) => {
          const nextActive = remainingActiveIds.concat(id);
          const layerState: LayerPanelState = body
            ? {
                active: true,
                loading: false,
                count: body.features.features.length,
                suppressedCount: body.suppressedCount,
                noLocalityCount: body.noLocalityCount ?? 0,
                truncated: body.truncated,
              }
            : { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false };
          // The swap only lands when the activation succeeded — a failed fetch
          // leaves the current base on instead of clearing both.
          const base = { ...(body ? withSwapOut(s) : s), [id]: layerState };
          return applyHintsAfterActivate(base, body ? nextActive : activeIds);
        });
        setLevelVersion((v) => v + 1);
        return;
      }

      // If we already have data cached (e.g. the default layer), just re-activate.
      if (dataRef.current.has(id)) {
        const fc = dataRef.current.get(id) ?? EMPTY_FC;
        setStates((s) => {
          const nextActive = remainingActiveIds.concat(id);
          const base = {
            ...withSwapOut(s),
            [id]: { ...s[id], active: true, loading: false, count: fc.features.length },
          };
          return applyHintsAfterActivate(base, nextActive);
        });
        // Mid-scrub: also resolve this temporal layer's as-of view if missing.
        if (asOf !== null && isTemporalLayer(id) && !asOfDataRef.current.has(id)) {
          void fetchAsOfFor(id, asOf);
        }
        return;
      }

      // Fetch the layer, threading the active scope/period searchParams so the
      // server scopes it identically to the page-load render. For aggregated
      // point layers (density+signal), also pass the current level so the server
      // groups at the right granularity (province or locality).
      setStates((s) => ({ ...s, [id]: { ...s[id], active: true, loading: true } }));
      try {
        const params = new URLSearchParams(searchParams.toString());
        if (isAggregatedPointLayer(id)) params.set("level", levelRef.current);
        applyVerifiedParam(params, id);
        const qs = params.toString();
        const res = await fetch(`/api/panorama/${id}${qs ? `?${qs}` : ""}`, {
          headers: { accept: "application/json" },
          signal: signalFor(id),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        dataRef.current.set(id, body.features);
        setStates((s) => {
          const nextActive = remainingActiveIds.concat(id);
          const base = {
            ...withSwapOut(s),
            [id]: {
              active: true,
              loading: false,
              count: body.features.features.length,
              suppressedCount: body.suppressedCount,
              noLocalityCount: body.noLocalityCount ?? 0,
              truncated: body.truncated,
            },
          };
          return applyHintsAfterActivate(base, nextActive);
        });
        // Mid-scrub: also resolve this temporal layer's as-of view.
        if (asOf !== null && isTemporalLayer(id)) {
          void fetchAsOfFor(id, asOf);
        }
      } catch (err) {
        // Superseded fetch — the newer request owns this layer's state now.
        if (isAbortError(err)) return;
        // On failure, leave the layer off and clear loading; no silent half-state.
        dataRef.current.delete(id);
        setStates((s) => ({
          ...s,
          [id]: { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false },
        }));
      }
    },
    [
      searchParams,
      states,
      asOf,
      fetchAsOfFor,
      fetchChoroplethAt,
      computeHints,
      signalFor,
      applyVerifiedParam,
    ],
  );

  // F3: active preset — null when the operator is in manual "modo avanzado".
  // map-QOL: the URL (`?preset=`) wins on mount so a shared board reproduces it.
  const [activePresetId, setActivePresetId] = useState<PresetId | null>(() => {
    const raw = searchParams.get("preset");
    if (raw !== null) {
      if (getPreset(raw as PresetId)) return raw as PresetId;
      // Present but INVALID (`?preset=notreal`): default to the canonical preset
      // instead of dropping into manual mode — that read as an incoherent
      // "Pérdidas-ish" view with no coherent vista (cowork round 2).
      return DEFAULT_PANORAMA_PRESET_ID;
    }
    // First-visit fast path: adopt the server-seeded preset on mount so (a) the
    // preset row + metrics column read active on first paint, and (b) the
    // derived-level effect sees the preset's level — WITHOUT this, that effect
    // (which runs before the mount preset-activation) would compute a
    // province-level target for a national scope and fire onLevelChange, drilling
    // AWAY from the seeded locality caches and blanking the map (C2 class).
    if (hasSeed) return seededPresetId;
    return null;
  });
  // Ref mirror so the popstate board re-derivation can compare against the CURRENT
  // preset without re-running on every preset change (MAP-2).
  const activePresetIdRef = useRef(activePresetId);
  activePresetIdRef.current = activePresetId;

  // task #63: the bivariate "riesgo-brotes" encoding is OFFERED only for the
  // "Brotes activos" preset at province framing with both inputs active — the
  // gate for the toggle UI + the caption override under the map.
  const bivariateEligible =
    activePresetId === "brotes-activos" &&
    level === "province" &&
    (states.cobertura?.active ?? false) &&
    (states.zoonosis?.active ?? false);
  // The bivariate join reads the LIVE province cache for both axes. cobertura is
  // non-temporal (it can't be replayed), so during a scrub it stays frozen at the
  // live edge while zoonosis has an as-of frame — mixing two time bases into one
  // cell would be dishonest. So the encoding is offered ONLY at the live edge; a
  // scrub disables it (with an honest note by the toggle). CRITICAL-2 fix.
  // task #63 / WARNING 7: with a tiny scope (1–3 comparable units) the tercile
  // cut-points degenerate and a 95%-coverage lone province would still be labelled
  // "baja cobertura / riesgo medio". Detect that from the LIVE province caches and
  // disable the encoding (with an honest note by the toggle) instead of emitting a
  // false risk band. levelVersion/asOfVersion are the recompute triggers (refs).
  const bivariateDegenerate = useMemo(() => {
    void levelVersion;
    void asOfVersion;
    if (!bivariateEligible) return false;
    const cov = provinceDataRef.current.get("cobertura");
    const sig = provinceDataRef.current.get("zoonosis");
    if (!cov || !sig || cov.features.length === 0) return false;
    return !bivariateViable(cov, sig, BIVARIATE_MIN_UNITS);
  }, [bivariateEligible, levelVersion, asOfVersion]);
  const bivariateActive = bivariateMode && bivariateEligible && !scrubbing && !bivariateDegenerate;

  // Reset the encoding toggle when its eligibility drops (preset/level/layer
  // change) — otherwise bivariateMode stays "on" invisibly and silently re-engages
  // the moment eligibility returns, surprising the operator. The toggle only
  // exists while eligible, so this keeps its state honest to what's on screen.
  useEffect(() => {
    if (!bivariateEligible && bivariateMode) setBivariateMode(false);
  }, [bivariateEligible, bivariateMode]);

  // Scale-lock honesty (WARNING 6): opening via a shared ?asOf link mounts the map
  // mid-scrub, so the color/size scale locks to THAT day's domain — it never saw
  // the live edge to anchor against. Disclose that anchor until the operator
  // visits the live edge once (returning to live refreshes the lock correctly).
  const [scaleAnchoredToAsOf, setScaleAnchoredToAsOf] = useState(initialAsOf !== null);
  useEffect(() => {
    if (asOf === null) setScaleAnchoredToAsOf(false);
  }, [asOf]);

  // task #63: the layer list actually painted by the map. When the bivariate
  // encoding is active, REPLACE the two stacked layers visually — drop the
  // zoonosis bubbles and repaint the cobertura province fill as the 3×3 matrix,
  // computed client-side from the two ALREADY-fetched province results (reuse,
  // no refetch). Otherwise it is `activeLayers` unchanged.
  const mapLayers = useMemo<ActiveLayer[]>(() => {
    // levelVersion/asOfVersion are the explicit recompute triggers for the
    // province caches (refs), mirroring the activeLayers memo's `void` idiom.
    void levelVersion;
    void asOfVersion;
    if (!bivariateActive) return activeLayers;
    const cov = provinceDataRef.current.get("cobertura");
    const sig = provinceDataRef.current.get("zoonosis");
    if (!cov || !sig || cov.features.length === 0) return activeLayers;
    const cells = buildBivariateCells(cov, sig);
    return activeLayers
      .filter((l) => l.id !== "zoonosis")
      .map((l) =>
        l.id === "cobertura"
          ? { ...l, label: "Riesgo de brotes (cobertura × señales)", bivariateCells: cells }
          : l,
      );
    // levelVersion/asOfVersion bump when the province caches (refs) change.
  }, [activeLayers, bivariateActive, levelVersion, asOfVersion]);

  // H12 (cowork QA): on a direct-URL entry the map paints its bubbles 2-4s late,
  // so the operator stares at a blank canvas wondering if it is empty or broken.
  // Show a loading skeleton over the map WHILE an active layer is still fetching
  // AND nothing is painted yet. It clears the instant features arrive; if the
  // fetch resolves to a legitimately empty scope the skeleton clears too and the
  // honest empty-state takes over (we gate on `loading`, never on emptiness).
  const mapIsPainting = useMemo(
    () => mapLayers.some((l) => l.features.features.length > 0),
    [mapLayers],
  );
  const mapDataLoading = activeLayers.some((l) => states[l.id as LayerId]?.loading);
  const showMapSkeleton = !mapIsPainting && mapDataLoading;

  // task #65: the signal histogram bins for the TimeScrubber. Built ONLY from
  // per-event timestamps ALREADY on the client — the real-event dots (points mode)
  // carry `occurredAt`/`lastSeenAt`; the aggregated overview features carry only a
  // count, so this stays null there (honest: no fabricated distribution). The bins
  // are SCOPE-AGGREGATE totals, never per-unit, so they reveal no suppressed cell.
  const signalHistogramBins = useMemo<number[] | undefined>(() => {
    const times: number[] = [];
    for (const l of activeLayers) {
      if (!isTemporalLayer(l.id as LayerId)) continue;
      for (const f of l.features.features) {
        const p = f.properties as { occurredAt?: unknown; lastSeenAt?: unknown };
        const raw =
          typeof p.occurredAt === "string"
            ? p.occurredAt
            : typeof p.lastSeenAt === "string"
              ? p.lastSeenAt
              : null;
        if (raw === null) continue;
        const v = Date.parse(raw);
        if (Number.isFinite(v)) times.push(v);
      }
    }
    if (times.length === 0) return undefined;
    return binTimestamps(times, since.getTime(), until.getTime(), 48);
  }, [activeLayers, since, until]);

  // NIGHT-3 item #3: at AGGREGATE level the temporal layers carry only a count
  // per unit — no per-event timestamps — so `signalHistogramBins` above is empty
  // and the scrubber histogram was blind. Fetch SCOPE-TOTAL per-day counts from
  // the layer endpoint (?histogram=1), sum across the active temporal layers, and
  // bin them into the same 48-bucket track. Runs ONLY when the client has no
  // timestamps (points mode already feeds the histogram above). The counts are
  // scope totals, never per-unit, so they reveal no k-anon-suppressed cell.
  const activeTemporalKey = useMemo(
    () =>
      activeLayers
        .filter((l) => isTemporalLayer(l.id as LayerId))
        .map((l) => l.id)
        .join(","),
    [activeLayers],
  );
  const [aggregateHistogramBins, setAggregateHistogramBins] = useState<number[] | undefined>(
    undefined,
  );
  useEffect(() => {
    // M2: effectiveScopeProvince/Locality are recompute TRIGGERS — the effect reads
    // the drilled scope off window.location.search (fresher than useSearchParams),
    // so it must re-run when the effective scope changes. `void` marks them used
    // (the codebase idiom for trigger-only deps — cf. `void levelVersion`).
    void effectiveScopeProvince;
    void effectiveScopeLocality;
    // Points-mode timestamps already feed the histogram — don't double-count.
    if (signalHistogramBins !== undefined || activeTemporalKey === "") {
      setAggregateHistogramBins(undefined);
      return;
    }
    const ids = activeTemporalKey.split(",") as LayerId[];
    // M2 fix: read the LIVE URL, not the (stale) useSearchParams. A scope drill
    // commits ?province/?locality via a shallow History pushState that
    // useSearchParams does not observe (engram #621/#622) — so `searchParams`
    // still reads the national scope and the aggregate histogram showed NATIONAL
    // activity under a drilled province. window.location.search carries the
    // drilled scope; effectiveScopeProvince/Locality are the effect triggers.
    const baseQs = window.location.search;
    const currentLevel = level;
    let cancelled = false;
    Promise.all(
      ids.map(async (id) => {
        const params = new URLSearchParams(baseQs);
        // No asOf: the histogram shows the FULL-period activity distribution the
        // scrub cursor navigates within — it must not shrink as the operator
        // scrubs back. Strip any asOf the scrub wrote into the URL (baseQs).
        params.delete("asOf");
        params.set("histogram", "1");
        if (currentLevel === "province") params.set("level", "province");
        else if (isAggregatedPointLayer(id)) params.set("level", "locality");
        // Basis still matters (valid vs transaction time).
        if (timeBasis === "transaction") params.set("basis", "transaction");
        try {
          const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
            headers: { accept: "application/json" },
            signal: signalFor(`${id}:histogram`),
          });
          if (!res.ok) return [] as Array<{ date: string; count: number }>;
          const body = (await res.json()) as {
            histogram?: Array<{ date: string; count: number }>;
          };
          return body.histogram ?? [];
        } catch (err) {
          if (isAbortError(err)) return null; // superseded — bail on merge
          return [] as Array<{ date: string; count: number }>;
        }
      }),
    ).then((results) => {
      if (cancelled || results.some((r) => r === null)) return;
      // Sum per-day counts across all active temporal layers, then bin.
      const byDay = new Map<string, number>();
      for (const days of results) {
        for (const d of days ?? []) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.count);
      }
      const merged = Array.from(byDay, ([date, count]) => ({ date, count }));
      const bins = binDailyCounts(merged, since.getTime(), until.getTime(), 48);
      setAggregateHistogramBins(bins.some((b) => b > 0) ? bins : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [
    signalHistogramBins,
    activeTemporalKey,
    effectiveScopeProvince,
    effectiveScopeLocality,
    level,
    timeBasis,
    signalFor,
    since,
    until,
  ]);

  // panorama-redesign Fase 1: preset map framing (camera-only). Set on preset
  // activation from the preset's optional `framing` field; the token is a
  // monotonic counter so re-clicking the same preset re-frames (new object
  // identity re-fires the map's frame effect). null = no framing (framing-less
  // presets keep today's map behavior).
  const frameTokenRef = useRef(0);
  const [presetFrame, setPresetFrame] = useState<{
    framing: PresetFraming;
    token: number;
  } | null>(null);

  // panorama-redesign Fase 1: trailing debounce handle for the preset-commit
  // layer fetch (see onPreset). Cleared on unmount so a pending burst never
  // fires into an unmounted console.
  const presetFetchTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (presetFetchTimerRef.current !== null) {
        window.clearTimeout(presetFetchTimerRef.current);
      }
    },
    [],
  );

  /**
   * F3: Activate a preset — FLUID (map-QOL).
   *
   * Supersedes the interim router-drop cure from commit 0e94f198 (a full
   * `window.location.assign` navigation on period commit). The router-drop
   * defect only affects Next router transitions (`router.push/replace`); this
   * path never touches the router: the period/board commit is a shallow
   * History API pushState (lib/ui/map-layer-nav.ts) and the data refetch is a
   * plain client fetch — nothing for the router to drop, no reload, the map
   * stays mounted and the layers cross-fade in place.
   *
   * Ordering:
   * 1. Clear all caches + park the scrubber (a new period invalidates both).
   * 2. Set level + mark the preset's layers active (loading=true).
   * 3. Commit the board URL (period/layers/level/preset) via shallow History
   *    API; flag the new scope+period as handled so the invalidation effect
   *    skips. `commit` picks the primitive: "push" for an explicit operator
   *    click (back-button undoable); "replace" for the first-visit default
   *    activation below (the operator didn't navigate — no history entry).
   * 4. Fetch the preset's layers directly against the NEW params (no closure
   *    over stale searchParams) + persist the board for the bare-URL restore.
   */
  // Which of `ids` are NOT yet cached for `lvl` — the layers a preset activation
  // must actually fetch. Routes each id to the same cache activeLayers reads it
  // from (seededLayerUsesProvinceCache). With server-seeded caches (first-visit
  // fast path) this is normally EMPTY, so the preset commit fires zero fetches.
  const missingFromCache = useCallback((ids: LayerId[], lvl: AggregationLevel) => {
    return ids.filter((lid) => {
      const cache = seededLayerUsesProvinceCache(lid, lvl)
        ? provinceDataRef.current
        : dataRef.current;
      return !cache.has(lid);
    });
  }, []);

  const applyPreset = useCallback(
    (id: PresetId, commit: "push" | "replace", opts?: { preserveSeededCaches?: boolean }) => {
      const preset = getPreset(id);
      if (!preset) return;
      // perf plan 1.2: preserve mode keeps the SERVER-seeded caches (first-visit
      // fast path). The scrubber is already parked at live (asOf init null), so
      // the only work is fetching layers MISSING from the seed (normally none).
      const preserve = opts?.preserveSeededCaches === true;

      if (!preserve) {
        // Clear all caches — an explicit preset commit always starts fresh.
        dataRef.current.clear();
        provinceDataRef.current.clear();
        asOfDataRef.current.clear();
        setAsOf(null);
      }

      // PO-ratified 2026-07-09: a preset no longer PINS the aggregation level —
      // `level: "locality"` is an initial preference realized by the server seed
      // + the live camera, not a force. Activating a preset keeps whatever level
      // the scope+zoom hysteresis currently dictates (`levelRef.current`), so a
      // preset chosen in national framing stays at province and only drills to
      // locality on an intentional zoom or a jurisdiction selection. The layers
      // are fetched at — and the URL reflects — that current level.
      const lvl = levelRef.current;

      const presetIds = presetLayerIds(preset);
      // preserve → only the layers missing from the seeded caches; else all.
      const toFetch = preserve ? missingFromCache(presetIds, lvl) : presetIds;
      const toFetchSet = new Set(toFetch);

      // Flip all layers: deactivate current ones; mark preset layers active+loading.
      // A seeded-and-preserved layer is marked active + NON-loading (its envelope
      // stays from the initializer) — flipping it to loading:true would spin
      // forever, since no fetch is issued to clear it.
      setStates((s) => {
        const next = { ...s };
        for (const l of PANORAMA_LAYERS) {
          if (presetIds.includes(l.id)) {
            if (preserve && !toFetchSet.has(l.id)) {
              next[l.id] = { ...s[l.id], active: true, loading: false };
            } else {
              next[l.id] = {
                active: true,
                loading: true,
                count: 0,
                suppressedCount: 0,
                truncated: false,
              };
            }
          } else if (s[l.id]?.active) {
            next[l.id] = { ...s[l.id], active: false, compatibilityHint: undefined };
          }
        }
        return next;
      });

      setActivePresetId(id);
      // W2 fix: this commit writes `period=<preset>` via a shallow History replace
      // that useSearchParams() can't see — record the committed period so the
      // scrubber axis + PeriodPicker highlight track the loaded window, not the
      // stale bare-URL default.
      setCommittedPeriod(preset.periodPreset);

      // panorama-redesign Fase 1: apply the preset's optional map framing
      // (camera-only — data scope untouched). Framing-less presets clear it.
      if (preset.framing) {
        frameTokenRef.current += 1;
        setPresetFrame({ framing: preset.framing, token: frameTokenRef.current });
      } else {
        setPresetFrame(null);
      }

      // Commit the board URL shallowly (back-button undoable — an explicit
      // user action) and fetch the preset layers against the NEW params.
      // Read the LIVE URL (not stale useSearchParams): a scope drill commits
      // ?province/?locality via a shallow pushState useSearchParams can't see, so
      // window.location.search is the freshest scope — and it makes applyPreset
      // safe to reuse from the popstate re-derivation below (MAP-2).
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("period", preset.periodPreset);
      nextParams.set("layers", canonicalLayersKey(presetIds));
      if (lvl === "locality") nextParams.set("level", "locality");
      else nextParams.delete("level");
      nextParams.set("preset", id);
      presetCommittedQsRef.current = scopePeriodQsOf(nextParams);
      // perf plan 1.2: on the first-visit fast path the SERVER already seeded the
      // KPIs at this preset's window — pre-arm seededQsRef with the committed
      // scope+period qs so this commit's URL change can't trigger a redundant
      // /api/panorama/kpis refetch (the KPI effect skips a matching qs). Only for
      // preserve mode; an explicit preset click still refetches KPIs at its period.
      if (preserve) seededQsRef.current = scopePeriodQsOf(nextParams);
      const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
      if (commit === "push") pushMapStateUrl(nextUrl);
      else replaceMapStateUrl(nextUrl);
      // panorama-vista-redesign Phase 5: stamp the LIVE capasDetail/scrubDetail
      // via the ref mirrors (applyPreset's identity should not churn on every
      // Simple/Detalle flip — matches the verifiedRef/levelRef pattern).
      saveBoard(nextParams, {
        capasDetail: capasDetailRef.current,
        scrubDetail: scrubDetailRef.current,
      });
      // perf plan 1.2: nothing to fetch (every preset layer was seeded) → the
      // commit is state + URL only, ZERO network. This is the whole win.
      if (toFetch.length === 0) return;
      // panorama-redesign Fase 1: TRAILING debounce on the layer-fetch burst
      // ONLY — the state flips + shallow URL push above stay synchronous
      // (instant feedback). Rapid preset clicks coalesce into one burst for
      // the LAST selection; in-flight fetches are superseded via keyed abort.
      if (presetFetchTimerRef.current !== null) {
        window.clearTimeout(presetFetchTimerRef.current);
      }
      presetFetchTimerRef.current = window.setTimeout(() => {
        presetFetchTimerRef.current = null;
        void fetchLayersInto(toFetch, lvl, nextParams);
      }, PRESET_FETCH_DEBOUNCE_MS);
    },
    [fetchLayersInto, missingFromCache],
  );

  /** F3: explicit preset click — a back-button-undoable board commit. */
  const onPreset = useCallback((id: PresetId) => applyPreset(id, "push"), [applyPreset]);

  // MAP-2: re-derive the board from a popped URL. useSearchParams does not
  // observe popstate (engram #621/#622), so browser Back reverted
  // ?preset/?layers/?period in the URL while the active tab, legend, bubbles and
  // KPIs stayed on the previous preset. Assigned to a ref during render (the
  // popstate listener is declared above, before this closure's dependencies).
  //
  // Adversarial-review fix (2026-07-11, MED #1): this used to reuse the
  // click-path applyPreset(preset, "replace"), which FORCES the period back to
  // preset.periodPreset, clears every cache, and re-applies the preset's camera
  // framing. Repro: preset A → change period to 12m (URL keeps period=12m) →
  // preset B → Back: the popped URL still says period=12m but the view rewrote
  // it to A's default (and jumped the camera). A popped URL is a HISTORICAL
  // board — restore its fields (preset, layers, period) verbatim:
  //   - period: from ?period (committedPeriod), never the preset default;
  //   - layers: from ?layers, falling back to the preset's canonical set;
  //   - caches: kept (Back is instant) unless the period actually changed —
  //     a different window makes every period-sensitive cache stale;
  //   - framing: NEVER re-applied (no camera jump on Back);
  //   - URL: never rewritten (it is already the popped one).
  resyncBoardFromUrlRef.current = (params: URLSearchParams) => {
    const rawPreset = params.get("preset");
    const poppedPreset =
      rawPreset !== null && getPreset(rawPreset as PresetId) ? (rawPreset as PresetId) : null;
    const poppedPeriod = params.get("period");

    // Resolve the loaded vs popped period through the SAME fallback chain the
    // since/until memo uses, so "changed" means the WINDOW actually changes.
    const fallbackPeriod = searchParams.get("period") ?? PANORAMA_DEFAULT_PRESET;
    const loadedPeriod = committedPeriod ?? fallbackPeriod;
    const nextPeriod = poppedPeriod ?? fallbackPeriod;
    const periodChanged = nextPeriod !== loadedPeriod;

    // Popped layer set: explicit ?layers wins; a preset URL without ?layers
    // falls back to the preset's canonical set; a bare manual URL is all-off.
    const poppedPresetObj = poppedPreset !== null ? getPreset(poppedPreset) : null;
    const ids =
      parseLayersParam(params.get("layers")) ??
      (poppedPresetObj ? presetLayerIds(poppedPresetObj) : []);
    const idSet = new Set<LayerId>(ids);
    const currentKey = canonicalLayersKey(
      PANORAMA_LAYERS.filter((l) => statesRef.current[l.id]?.active).map((l) => l.id),
    );
    const layersChanged = canonicalLayersKey(ids) !== currentKey;

    // No change vs the current board — nothing to re-derive.
    if (poppedPreset === activePresetIdRef.current && !periodChanged && !layersChanged) return;

    setActivePresetId(poppedPreset);
    // The popped URL's period is the truth (null → the bare-URL default).
    setCommittedPeriod(poppedPeriod);

    if (periodChanged) {
      // The loaded caches belong to the previous window — stale for the popped
      // one. Same invalidation set as the scope/period effect: as-of frames,
      // province rollups, and the period-sensitive locality entries.
      asOfDataRef.current.clear();
      provinceDataRef.current.clear();
      for (const id of CHOROPLETH_IDS) dataRef.current.delete(id);
      for (const l of AGGREGATED_POINT_LAYERS) dataRef.current.delete(l.id);
      setAsOf(null);
      setScrubResetToken((v) => v + 1);
      // If the searchParams-keyed invalidation effect DOES observe this pop
      // (dev/router-version variance), skip its redundant clear+refetch run.
      presetCommittedQsRef.current = scopePeriodQsOf(params);
      // KPIs are keyed on scopePeriodQs (useSearchParams), which popstate does
      // not update — refetch them explicitly at the popped window. The shared
      // "kpis" abort key dedupes against any concurrent refetch (last wins).
      clientKpiTookOverRef.current = true;
      const kpiQs = scopePeriodQsOf(params);
      fetch(`/api/panorama/kpis${kpiQs ? `?${kpiQs}` : ""}`, {
        headers: { accept: "application/json" },
        signal: signalFor("kpis"),
      })
        .then((r) => (r.ok ? (r.json() as Promise<PanoramaKpis>) : null))
        .then((body) => {
          if (body) {
            setKpis(body);
            setKpisStale(false);
          } else {
            setKpisStale(true);
          }
        })
        .catch((err) => {
          if (isAbortError(err)) return;
          console.error("[PanoramaConsole] popstate KPI refetch failed", err);
          setKpisStale(true);
        });
    }

    // Flip the layer states to the popped set. Layers that need a fetch (period
    // changed, or missing from cache) flip to loading; already-cached layers
    // activate in place (Back stays instant — no cache wipe, no spinner).
    const toFetch = periodChanged ? ids : missingFromCache(ids, levelRef.current);
    const toFetchSet = new Set(toFetch);
    setStates((s) => {
      const next = { ...s };
      for (const l of PANORAMA_LAYERS) {
        const shouldActive = idSet.has(l.id);
        const isActive = s[l.id]?.active ?? false;
        if (shouldActive && toFetchSet.has(l.id)) {
          next[l.id] = {
            active: true,
            loading: true,
            count: 0,
            suppressedCount: 0,
            truncated: false,
          };
        } else if (shouldActive && !isActive) {
          next[l.id] = { ...s[l.id], active: true, loading: false };
        } else if (!shouldActive && isActive) {
          next[l.id] = { ...s[l.id], active: false, compatibilityHint: undefined };
        }
      }
      return next;
    });
    if (toFetch.length > 0) void fetchLayersInto(toFetch, levelRef.current, params);
  };

  // panorama magnetic-zoom Phase 2: DERIVE the aggregation level from (scope,
  // zoom) with HYSTERESIS. The scope-wins rule is unchanged — a jurisdiction
  // drill (explicit ?province/?locality, or the implicit single-province scope
  // of a jurisdiction-scoped operator) is always locality. For national scope
  // the flip is a Schmitt trigger (Z_LOCALITY_ENTER / _EXIT) so a camera that
  // settles near the boundary produces ZERO oscillation. `levelRef.current` is
  // threaded as `prev` so the dead-band holds the current level.
  //
  // PO-ratified 2026-07-09: a preset's `level: "locality"` is now an INITIAL
  // PREFERENCE (the server seed / the current camera), NOT a force — in national
  // framing every preset starts at province and locality arrives only on an
  // intentional zoom past the boundary or a jurisdiction drill. So this effect
  // NO LONGER pins the level to the active preset's level.
  const derivedProvince = effectiveScopeProvince ?? initialDivisionProvince;
  const derivedLocality = effectiveScopeLocality;
  useEffect(() => {
    const desired = derivedLevelWithHysteresis(
      levelRef.current,
      { country: "AR", province: derivedProvince, locality: derivedLocality },
      mapZoom,
    );
    if (desired !== levelRef.current) onLevelChange(desired);
  }, [mapZoom, derivedProvince, derivedLocality, onLevelChange]);

  // panorama magnetic-zoom Phase 2 — BOUNDARY PREFETCH. While national scope is
  // still at PROVINCE but the camera is APPROACHING the locality boundary (inside
  // the dead-band, below the ENTER edge), warm the LOCALITY cache for the active
  // level-sensitive layers so the eventual flip repaints for free. Uses a
  // dedicated `:warm` abort key so it NEVER cancels an in-flight province fetch,
  // and only fetches layers still missing from the locality cache. It does NOT
  // flip the level or bump levelVersion — purely cache-warming.
  useEffect(() => {
    if (levelRef.current !== "province") return;
    // Approach band only: from just below the EXIT edge up to (not past) ENTER.
    // Past ENTER the level effect above flips outright and owns the fetch.
    if (mapZoom < Z_LOCALITY_EXIT - 0.4 || mapZoom >= Z_LOCALITY_ENTER) return;
    const toWarm = [...CHOROPLETH_LAYERS, ...AGGREGATED_POINT_LAYERS].filter(
      (l) => statesRef.current[l.id]?.active && !dataRef.current.has(l.id),
    );
    if (toWarm.length === 0) return;
    for (const l of toWarm) {
      void (async () => {
        try {
          await fetchChoroplethAt(l.id, "locality", `${l.id}:warm`);
        } catch {
          // Superseded warm fetch (keyed abort) or a transient failure — the
          // flip will fetch on demand. Warming is best-effort, never fatal.
        }
      })();
    }
  }, [mapZoom, fetchChoroplethAt]);

  // map-QOL URL sync: mirror the board (active layers / level / preset) into
  // the URL via shallow replaceState whenever it changes — toggles are silent
  // normalizations (replace), presets push (see onPreset). Skips the first run
  // (the mount URL already reflects the initial board or intentionally lacks
  // one). Also persists the board for the bare-URL restore.
  const activeLayersKey = useMemo(
    () =>
      PANORAMA_LAYERS.filter((l) => states[l.id]?.active)
        .map((l) => l.id)
        .join(","),
    [states],
  );
  const urlSyncReadyRef = useRef(false);
  useEffect(() => {
    if (!urlSyncReadyRef.current) {
      urlSyncReadyRef.current = true;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const before = params.toString();
    params.set("layers", activeLayersKey);
    if (level === "locality") params.set("level", "locality");
    else params.delete("level");
    if (activePresetId !== null) params.set("preset", activePresetId);
    else params.delete("preset");
    // task #78 Part 3: encode the vet-signed toggle so a shared board reproduces it.
    if (verifiedOnly) params.set("verified", "1");
    else params.delete("verified");
    if (params.toString() !== before) {
      const qsStr = params.toString();
      replaceMapStateUrl(`${window.location.pathname}${qsStr ? `?${qsStr}` : ""}`);
    }
    // panorama-vista-redesign Phase 5: stamp capasDetail/scrubDetail on every
    // run of this effect — including a Simple/Detalle-only flip, which never
    // changes the URL params above — so the UI pref is never lost.
    saveBoard(params, { capasDetail, scrubDetail });
  }, [activeLayersKey, level, activePresetId, verifiedOnly, capasDetail, scrubDetail]);

  // map-QOL mount effect (runs once): resolve the initial board.
  // (a) URL carries `layers` → fetch whatever the server didn't seed.
  // (b) Bare URL + a saved board in localStorage → subtle one-time restore via
  //     shallow replaceState + client fetch (no redirect, no reload). The URL
  //     stays the source of truth; localStorage is only the memory of it.
  // (c) TRULY-FIRST visit (bare URL, no saved board) → default-activate the
  //     flagship compliance preset (design-QA 2026-07-04 highest-leverage nit):
  //     the first screen must answer "¿dónde estamos mal?" — question-framed
  //     preset + national frame + matching auto-reading — instead of an orphan
  //     perdidas layer with a generic fallback sentence. Committed via
  //     replaceState (the operator didn't navigate; no history entry).
  const mountInitDoneRef = useRef(false);
  useEffect(() => {
    if (mountInitDoneRef.current) return;
    mountInitDoneRef.current = true;
    const current = new URLSearchParams(window.location.search);
    const urlLayerIds = parseLayersParam(current.get("layers"));

    // panorama-vista-redesign Phase 5 (design Decision 5): capasDetail/
    // scrubDetail are UI-only prefs (never URL params) — read the saved board
    // ONCE here and seed both toggles regardless of which restore branch below
    // runs. A pre-redesign v1 entry (or unreadable storage) tolerantly reads
    // as Simple (false) for both — no crash, no JSON.parse failure surfaced.
    let saved: SavedBoard | null = null;
    try {
      const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
      saved = raw !== null ? (JSON.parse(raw) as SavedBoard) : null;
    } catch {
      // Storage unreadable — treat as a first visit: default-activate below.
      saved = null;
    }
    if (saved !== null) {
      // QA fix: coerce STRICTLY — a corrupt or pre-redesign non-boolean value
      // (e.g. a stray string) must read as Simple (false), not as any
      // truthy value. `?? false` only guards `undefined`; `=== true` also
      // guards against a corrupt stored value passing through.
      setCapasDetail(saved.capasDetail === true);
      setScrubDetail(saved.scrubDetail === true);
    }

    if (urlLayerIds !== null) {
      const missing = missingFromCache(urlLayerIds, levelRef.current);
      if (missing.length > 0) void fetchLayersInto(missing, levelRef.current, current);
      return;
    }

    // Bare URL — offer the saved board, if any. Explicit period/preset params
    // mean the operator navigated here on purpose: don't override.
    if (current.get("period") !== null || current.get("preset") !== null) return;
    if (saved === null) {
      // (c) No explicit board, no saved board — first visit: land on the
      // role-aware question-framed preset (govt → local surveillance, admin →
      // national default) instead of the orphan default layer. When the SERVER
      // seeded that preset's layers + KPIs (perf plan 1.2), PRESERVE the seeded
      // caches so this commit fires zero fetches; otherwise (no seed) fall back
      // to the fetch-on-mount path (the client re-fetches, now cache-warmed).
      const preserve = hasSeed && seededPresetId === defaultPresetId;
      applyPreset(
        defaultPresetId,
        "replace",
        preserve ? { preserveSeededCaches: true } : undefined,
      );
      return;
    }
    const savedIds = parseLayersParam(saved.layers || null);
    // A saved board with an explicit empty layer set is a deliberate
    // "all off" board — respect it; only the truly-absent case defaults.
    if (savedIds === null || savedIds.length === 0) return;

    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("layers", canonicalLayersKey(savedIds));
    const savedLevel: AggregationLevel = saved.level === "locality" ? "locality" : "province";
    if (savedLevel === "locality") nextParams.set("level", "locality");
    if (saved.preset !== null && getPreset(saved.preset as PresetId)) {
      nextParams.set("preset", saved.preset);
    }
    if (saved.period !== null) nextParams.set("period", saved.period);

    // The restored period differs from the server-rendered one → the seeded
    // default features are stale for the new window: drop every cache and
    // refetch the whole board. Same-period restores only fill the gaps.
    const periodChanged = saved.period !== null && saved.period !== current.get("period");
    if (periodChanged) {
      dataRef.current.clear();
      provinceDataRef.current.clear();
      asOfDataRef.current.clear();
    }
    presetCommittedQsRef.current = scopePeriodQsOf(nextParams);
    replaceMapStateUrl(`${window.location.pathname}?${nextParams.toString()}`);
    // W2 fix: mirror the restored period into committedPeriod so the chrome tracks
    // the shallow-committed window (useSearchParams stays on the bare URL).
    if (saved.period !== null) setCommittedPeriod(saved.period);
    setLevel(savedLevel);
    levelRef.current = savedLevel;
    setActivePresetId(
      saved.preset !== null && getPreset(saved.preset as PresetId)
        ? (saved.preset as PresetId)
        : null,
    );
    setStates((s) => {
      const next = { ...s };
      for (const l of PANORAMA_LAYERS) {
        if (savedIds.includes(l.id)) {
          if (!next[l.id].active) {
            next[l.id] = {
              active: true,
              loading: true,
              count: 0,
              suppressedCount: 0,
              truncated: false,
            };
          }
        } else if (next[l.id].active) {
          next[l.id] = { ...next[l.id], active: false, compatibilityHint: undefined };
        }
      }
      return next;
    });
    const toFetch = periodChanged ? savedIds : missingFromCache(savedIds, savedLevel);
    if (toFetch.length > 0) void fetchLayersInto(toFetch, savedLevel, nextParams);
    // hasSeed/seededPresetId are mount-stable props; the effect is mount-only
    // (mountInitDoneRef guard), so their inclusion never re-runs it.
  }, [fetchLayersInto, applyPreset, defaultPresetId, missingFromCache, hasSeed, seededPresetId]);

  const mapLabel = useMemo(() => {
    const names = activeLayers.map((l) => l.label);
    return names.length > 0 ? `Mapa: ${names.join(", ")}` : "Mapa situacional";
  }, [activeLayers]);

  // panorama-ia-v2 §2.4: the plain-language caption re-states what a map mark
  // means at the current VISTA + level. Caption the PRIMARY (base) layer of the
  // active board: the preset's base when a preset is active, else the first
  // active non-reference layer (rate/density/signal — the ones the caption verb
  // "Relleno/Tamaño" describes). Reference pins carry no per-view narrative.
  const captionLayer = useMemo(() => {
    if (activePresetId !== null) {
      const base = getPreset(activePresetId)?.base;
      if (base) return getLayer(base) ?? null;
    }
    for (const l of PANORAMA_LAYERS) {
      if (states[l.id]?.active && l.dataType !== "reference") return l;
    }
    return null;
  }, [activePresetId, states]);

  // The active period as a PanoramaPeriod (ISO dates) for the caption's
  // "últimos N días" phrase. since/until already resolve the active window.
  const captionPeriod = useMemo<PanoramaPeriod>(
    () => ({ from: since.toISOString().slice(0, 10), to: until.toISOString().slice(0, 10) }),
    [since, until],
  );

  // panorama-ia-v2 §3.3 — Worst-N ranking of the PRIMARY (base) layer: the same
  // projection the map draws, re-expressed as a ranked list + accessible table.
  // Rate layers rank by gap vs meta; density/signal by count. Suppressed cells
  // never enter the ranking (privacy invariant §5.1 — rankWorstUnits drops them).
  const rankingKind = useMemo<RankingKind | null>(() => {
    if (!captionLayer || captionLayer.dataType === "reference") return null;
    return captionLayer.dataType === "rate" ? "rate" : "density";
  }, [captionLayer]);

  // H2 (cowork QA, round-2 corrected): rate coverage (cobertura/esterilización/
  // microchip) is computed ONLY at province grain (repository "V1 LIMITATION").
  // BELOW province (department/locality framing) it paints nothing, so show the
  // honest "la cobertura se calcula solo a nivel provincia" empty state. Gate on
  // being BELOW province grain (`level !== "province"`), NOT on a province being
  // selected — round-1 fired even AT province grain (selecting a province in the
  // scope pill wrongly told the operator to "volvé a nivel provincia" when they
  // ALREADY were there, and stamped it over a fence-empty govt scope). A real
  // fence-empty is at province level, so this predicate now yields it the map's
  // generic/"—" path instead of the wrong rate-only copy.
  const rateProvinceOnlyEmpty = rankingKind === "rate" && level !== "province";

  const rankedActiveLayer = useMemo(
    () => (captionLayer ? activeLayers.find((l) => l.id === captionLayer.id) : undefined),
    [captionLayer, activeLayers],
  );

  const rankedRows = useMemo<RankedUnit[]>(() => {
    if (!captionLayer || rankingKind === null || !rankedActiveLayer) return [];
    return rankWorstUnits(rankedActiveLayer.features, {
      kind: rankingKind,
      target: captionLayer.complianceTarget,
      limit: 10,
    });
  }, [captionLayer, rankingKind, rankedActiveLayer]);

  // Hover sync map↔row: the highlighted unit key mirrors between the panel and
  // the map (feature-state highlight). Row click opens the DetailDrawer.
  const [highlightedUnitKey, setHighlightedUnitKey] = useState<string | null>(null);
  const [showDataTable, setShowDataTable] = useState(false);

  const onRankedSelect = useCallback(
    (key: string) => {
      if (!captionLayer || !rankedActiveLayer) return;
      const feature = rankedActiveLayer.features.features.find((f) => {
        const p = f.properties as Record<string, unknown>;
        // Mirror rankWorstUnits' identify() key precedence — the choropleth
        // features key off provinceCode/locality/province, not place/name, so
        // matching only place/name left every ranked-row click a no-op for the
        // cobertura (rate) layer (2026-07-10 fix).
        return (
          p.provinceCode === key ||
          p.place === key ||
          p.name === key ||
          p.locality === key ||
          p.province === key
        );
      });
      if (feature) {
        onFeatureClick(captionLayer.id, feature.properties as Record<string, unknown>);
      }
    },
    [captionLayer, rankedActiveLayer, onFeatureClick],
  );

  // panorama-ia-v2 §3.6: metadata for the map's "Exportar PNG" footer
  // (auditable provenance). Scope + period in plain es-AR; suppressed-cell
  // count summed across the active layers (audit trail).
  const viewMeta = useMemo(() => {
    const province = effectiveScopeProvince;
    const locality = effectiveScopeLocality;
    const scopeLabel = locality
      ? "Localidad seleccionada"
      : province
        ? "Provincia seleccionada"
        : "Nacional";
    const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86_400_000));
    const periodLabel = `últimos ${days} días`;
    const suppressedCount = PANORAMA_LAYERS.reduce(
      (sum, l) => sum + (states[l.id]?.active ? (states[l.id]?.suppressedCount ?? 0) : 0),
      0,
    );
    return { asOf, scopeLabel, periodLabel, suppressedCount };
  }, [effectiveScopeProvince, effectiveScopeLocality, since, until, states, asOf]);

  // Registros (dock) — the accessible table of what the map paints: the map is
  // the least accessible surface, so mirror it into a real table. Flatten every
  // ACTIVE AGGREGATE layer (choropleth fills + graduated per-unit circles —
  // reference/points layers are individual entities, not per-unit values) into
  // rows, reusing the pinned popup's buildLayerReadout so the value/unit/
  // protected formatting is identical. A k-anon-suppressed cell reads
  // "Protegido (k<5)", never a number.
  const mapTableRows = useMemo<MapTableRow[]>(() => {
    const rows: MapTableRow[] = [];
    for (const layer of activeLayers) {
      const isAggregate = layer.geomType === "choropleth" || layer.renderMode === "graduated";
      if (!isAggregate) continue;
      for (const f of layer.features.features) {
        const p = f.properties as Record<string, unknown>;
        // Mirror ranking.identify(): a detail-tier cell's own unit label
        // (locality/place/departmentName) BEFORE the province, so N departments of
        // one province don't all render as rows named after the province (WARNING 5).
        const unit = String(
          p.name ??
            p.localityName ??
            p.locality ??
            p.place ??
            p.departmentName ??
            p.province ??
            p.provinceName ??
            p.department ??
            p.provinceCode ??
            p.code ??
            "—",
        );
        const suppressed = p.suppressed === true;
        const rawValue =
          typeof p.value === "number" ? p.value : typeof p.count === "number" ? p.count : null;
        const readout = buildLayerReadout({
          label: layer.label,
          value: rawValue,
          suppressed,
          dataType: layer.dataType,
          complianceTarget: layer.complianceTarget,
        });
        const value =
          readout.state === "suppressed"
            ? "Protegido (k<5)"
            : readout.state === "nodata"
              ? "Sin dato"
              : (readout.valueText ?? "Sin dato");
        rows.push({ layer: layer.label, unit, value });
      }
    }
    rows.sort((a, b) => a.layer.localeCompare(b.layer, "es") || a.unit.localeCompare(b.unit, "es"));
    return rows;
  }, [activeLayers]);

  // Round-2 review #4: the dock badge used to show mapTableRows.length (the number
  // of UNITS with a row — e.g. 24 provinces), which read as a mismatch against a
  // KPI that counts EVENTS (denuncias 3.026, zoonosis señales). Compute Σ(cell
  // counts) across the aggregate COUNT layers (density/signal — NOT rate, whose
  // cells are percentages that don't sum) so the dock total equals the primary KPI
  // population. k-anon-suppressed cells hide their VALUE (only their existence), so
  // Σ(visible) ≤ KPI at detail grain — surfaced as "(+N protegidas)" so the gap is
  // honest, not silent. At province grain nothing is suppressed → Σ == KPI exactly.
  const dockRecordSummary = useMemo(() => {
    let total = 0;
    let suppressed = 0;
    let hasCountLayer = false;
    for (const layer of activeLayers) {
      const isAggregate = layer.geomType === "choropleth" || layer.renderMode === "graduated";
      if (!isAggregate || layer.dataType === "rate" || layer.dataType === "reference") continue;
      hasCountLayer = true;
      for (const f of layer.features.features) {
        const p = f.properties as Record<string, unknown>;
        if (p.suppressed === true) {
          suppressed += 1;
          continue;
        }
        const v = typeof p.value === "number" ? p.value : typeof p.count === "number" ? p.count : 0;
        total += v;
      }
    }
    return { hasCountLayer, total, suppressed };
  }, [activeLayers]);
  // The dock badge: the event total for count layers (== the primary KPI), else the
  // unit-row count for rate-only presets (coverage has no summable population).
  const dockBadgeCount = dockRecordSummary.hasCountLayer
    ? dockRecordSummary.total
    : mapTableRows.length;
  const mapTableCaption = `Datos del mapa por unidad — ${viewMeta.scopeLabel}, ${viewMeta.periodLabel}.`;
  // v2C dock bar "Exportar CSV": the SAME in-memory CSV artifact the Registros
  // pane's download link builds (one builder, two affordances).
  const dockCsvHref = useMapTableCsvHref(mapTableRows);

  // v2C: the old FilterChips row (Alcance/Período/Al) is retired — the scope
  // pill + period segmented in the floating top-right cluster ARE the visible
  // conditions now, and the masthead fresh chip carries the data cutoff.

  const onScrub = useCallback((next: Date | null) => setAsOf(next), []);

  // "Copiar vista" fidelity: mirror the map camera (zoom + center) into the URL
  // on every settle via a shallow History replace — the SAME machinery the
  // layer/period/scope params ride — so a copied link reproduces the exact
  // frame. Skips the write when the rounded value is unchanged (a pure re-render
  // or a settle that lands on the same rounded camera never churns the URL).
  const onCameraChange = useCallback((camera: MapCamera) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const before = params.toString();
    encodeCameraToParams(params, camera);
    const after = params.toString();
    if (after !== before) replaceMapStateUrl(`${window.location.pathname}?${after}`);
  }, []);

  // "Copiar vista" fidelity: mirror the scrub position into the URL at day
  // precision (live edge → drop the param). The first run is guarded so a
  // restored `asOf` is not clobbered before the scrubber has seeked to it (the
  // scrubber briefly emits null at the live edge on mount, then seeks).
  const asOfUrlSyncReadyRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!asOfUrlSyncReadyRef.current) {
      asOfUrlSyncReadyRef.current = true;
      // Do not delete a URL-restored asOf on the mount pass; only start syncing
      // once the console actually holds a scrub position.
      if (asOf === null) return;
    }
    const params = new URLSearchParams(window.location.search);
    const before = params.toString();
    encodeAsOfToParams(params, asOf);
    const after = params.toString();
    if (after !== before) {
      replaceMapStateUrl(`${window.location.pathname}${after ? `?${after}` : ""}`);
    }
  }, [asOf]);

  // task #77: flip the replay basis (valid ↔ transaction). The as-of feature cache
  // holds features resolved under the PREVIOUS basis, so clear it; the as-of effect
  // (which now depends on timeBasis) refetches the active temporal layers under the
  // new basis when a scrub is active. No-op visually while parked at live.
  const onBasisChange = useCallback((next: TimeBasis) => {
    if (next === timeBasisRef.current) return;
    timeBasisRef.current = next;
    asOfDataRef.current.clear();
    setTimeBasis(next);
  }, []);

  // map-QOL selective refresh (freshness chip's "Actualizar"): refetch the
  // KPIs + every ACTIVE layer with plain client fetches. No reload, no router,
  // the map stays mounted — caches are simply overwritten with fresh data.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    const params = new URLSearchParams(window.location.search);
    const activeIds = PANORAMA_LAYERS.filter((l) => statesRef.current[l.id]?.active).map(
      (l) => l.id,
    );
    setStates((s) => {
      const next = { ...s };
      for (const id of activeIds) next[id] = { ...next[id], loading: true };
      return next;
    });
    // Round-2 review #3: include the ACTIVE as-of cutoff (kpiFetchQsRef carries it)
    // so "Actualizar" during a scrub refetches the AS-OF strip, not a live one over
    // a historical map. Falls back to the plain scope key when parked at live.
    const kpiRefreshQs = kpiFetchQsRef.current;
    const kpiFetch = fetch(`/api/panorama/kpis${kpiRefreshQs ? `?${kpiRefreshQs}` : ""}`, {
      headers: { accept: "application/json" },
      signal: signalFor("kpis"),
    })
      .then((r) => (r.ok ? (r.json() as Promise<PanoramaKpis>) : null))
      .then((body) => {
        if (body) {
          setKpis(body);
          setKpisStale(false);
        } else {
          setKpisStale(true);
        }
      })
      .catch((err) => {
        // Superseded fetch (keyed abort) — a newer KPI request replaces this one.
        if (isAbortError(err)) return;
        // Keep the last-known KPIs on a transient failure, but surface it —
        // this used to be a silent no-op (error-path audit 2026-07-04, E5).
        console.error("[PanoramaConsole] selective KPI refresh failed", err);
        setKpisStale(true);
      });
    void Promise.all([
      kpiFetch,
      // preserveOnError: a REFRESH must never deactivate an already-active layer
      // just because its refetch failed under load — that would empty `layers=`
      // in the URL and lose the operator's selection (staging QA 2026-07-08 #2).
      fetchLayersInto(activeIds, levelRef.current, params, { preserveOnError: true }),
    ]).finally(() => setRefreshing(false));
  }, [refreshing, scopePeriodQs, fetchLayersInto, signalFor]);

  // A1 PR-7: autozoom — derive the current jurisdiction selection from
  // searchParams (set by JurisdictionSwitcher via a full document navigation).
  // The province code is an ISO 3166-2:AR string (e.g. "AR-X"); the locality
  // is identified by its slug. The locality centroid comes from the server-
  // preloaded localityCentroids map (keyed by slug), so no client-side DB
  // call is needed.
  // Effective division province: an explicit picker selection wins; otherwise
  // fall back to the operator's implicit single-province scope so their
  // administrative divisions (barrios/departamentos) load + render on mount
  // (PO validation 2026-07-07: a jurisdiction-scoped govt operator never picks
  // a province, so this stayed null and no outlines ever appeared). The map's
  // autozoom is UNAFFECTED — the A1 autozoom effect early-returns at mount
  // (the map is not yet loaded) and never re-fires for a constant value, so the
  // server-computed jurisdiction bbox (initialBounds) keeps the initial frame.
  // Embedded-drill: the map's scope reads the CLIENT-committed effective scope
  // (a shallow drill isn't visible to useSearchParams in production), falling
  // back to the operator's implicit single-province scope.
  const selectedProvinceCode = effectiveScopeProvince ?? initialDivisionProvince ?? null;
  const selectedLocalitySlug = effectiveScopeLocality;
  // Click-to-drill (task #55) gating:
  //  - a province drill is offered only to operators NOT pinned to a jurisdiction
  //    (admin/universal, initialDivisionProvince null) — a scoped govt operator
  //    cannot cross into another province;
  //  - "← Volver" is offered only when the province came from an EXPLICIT pick
  //    (an effective `province` scope), never for the implicit jurisdiction scope.
  const canDrillProvince = initialDivisionProvince == null;
  const canReturnNational = effectiveScopeProvince != null;
  // Adversarial QA 2026-07-11 (HIGH 1): the semantic scroll-nav wheel takeover
  // and the wheel-driven center scope commit are gated on TRUE universal reach
  // (admin / no jurisdiction fence), NOT the `initialDivisionProvince == null`
  // heuristic. A multi-province govt operator satisfies that heuristic yet must
  // keep cooperative wheel-zoom and may only click-drill (data-fenced) their own
  // provinces — never own the wheel or free-commit a scope by centering. Click
  // drill / "← Volver" stay on canDrillProvince (multi-province govt keeps them).
  const scrollNavEligible = universalNav;
  // Locality centroid for autozoom — from the live scope-data (refreshed on an
  // embedded drill), so a locality picked after a province drill flies correctly.
  const selectedLocalityCenter: [number, number] | null =
    selectedLocalitySlug !== null ? (scopeData.centroids[selectedLocalitySlug] ?? null) : null;

  // ARCHETYPE A: on-canvas aggregation-level badge copy. Announces what a map
  // mark aggregates NOW — "Provincias" at the national rollup, the division noun
  // ("Departamentos/partidos", "Comunas" for CABA) when drilled into a province,
  // or "Localidades" at locality level without a province scope.
  const aggregationLabel =
    level === "province"
      ? "Provincias"
      : selectedProvinceCode
        ? selectedProvinceCode === "AR-C"
          ? "Comunas"
          : "Departamentos/partidos"
        : "Localidades";

  // Live-QA regression (2026-07-11): the masthead scope pill read the SERVER
  // `scopeLabel` prop, so a shallow client drill (which never re-renders the
  // server shell) left it stuck on "Nacional · todas las provincias". Derive the
  // pill label from the SAME client scope state the KPIs/map read: an explicit
  // province/locality drill names the drilled jurisdiction; no drill falls back
  // to the server default (national, or the operator's implicit jurisdiction).
  const liveScopeLabel = useMemo(() => {
    if (!effectiveScopeProvince && !effectiveScopeLocality) return scopeLabel ?? "";
    // QA fix (2026-07-11 adversarial cowork, §3): `allowedProvinces` only lists
    // provinces the OPERATOR is scoped to — an out-of-scope drill (forced via
    // ?province=, e.g. a govt-local operator probing AR-V/AR-Y) never appears
    // in it, so the lookup fell through to the raw ISO code ("AR-V") instead
    // of a name. provinceByCode is the full 24-province reference table (not
    // scope-gated), so it always resolves a real name for any valid code —
    // the fence itself (which data loads) is unaffected, this is display-only.
    const provinceName =
      (effectiveScopeProvince
        ? allowedProvinces?.find((p) => p.code === effectiveScopeProvince)?.name
        : undefined) ??
      (effectiveScopeProvince ? provinceByCode(effectiveScopeProvince)?.name : undefined) ??
      effectiveScopeProvince ??
      "";
    if (effectiveScopeLocality) {
      const localityName =
        scopeData.localities.find((l) => l.slug === effectiveScopeLocality)?.name ??
        effectiveScopeLocality;
      return provinceName ? `${provinceName} · ${localityName}` : localityName;
    }
    return provinceName;
  }, [
    effectiveScopeProvince,
    effectiveScopeLocality,
    allowedProvinces,
    scopeData.localities,
    scopeLabel,
  ]);

  // panorama-vista-redesign Phase 1 (design Decision 1): Vista panel (VISTA
  // label + active question line + PresetPanel row tabs) → 2-col body
  // (map column: map + honesty lines + scrubber | metrics column: ~342px
  // right rail). Supersedes the Fase 1 flat reflow.
  const activePreset = activePresetId !== null ? getPreset(activePresetId) : null;

  // panorama-vista-redesign Phase 3 (design Decision 3): the active preset's
  // curated metric ids, in display order. Null (manual/advanced mode, no
  // active preset) → PanoramaMetricsColumn shows every KPI, nothing hidden.
  const metricIds = activePreset?.metrics ?? null;

  // QA fix (finding 5): feed PanoramaReading the SAME preset-subset the
  // metrics column shows — previously the reading headlined off the FULL
  // kpis.kpis array while the column right below it only showed the active
  // preset's curated metrics, so the one-line sentence could reference a KPI
  // the operator can't see anywhere on screen. selectMetricKpis is the exact
  // filter PanoramaMetricsColumn uses; buildPanoramaReading only looks at
  // known ids + deltas (reading.ts qualify()), so narrowing the input array
  // just narrows which deltas are eligible to headline — it never breaks the
  // sentence construction.
  const readingKpis = useMemo(() => selectMetricKpis(kpis, metricIds), [kpis, metricIds]);

  // trust/safety invariant (2026-07-10): the KPI fan-out resolved to the honest
  // degraded payload (no real numbers). Every CONCLUSION surface fed by the KPI
  // strip (reading, metrics column) must REPLACE its reassuring copy with an
  // explicit "no pudimos calcular" state — a degraded view must never read as
  // "all good". Pending (still streaming) is a separate, non-degraded state.
  //
  // Belt-and-suspenders (PO instrumented-review finding #1, 2026-07-10): treat
  // an EMPTY strip as degraded even when the `degraded` flag is absent. The real
  // fan-out returns 8 tiles on success and throws (→ degradedPanoramaKpis, flag
  // set) on failure, so `kpis: []` while NOT pending only ever means "no real
  // numbers". Without this, any empty strip that slipped through without the
  // flag (an older payload, a 503 body, a fixture) would fall through to
  // buildPanoramaReading([]) → "Sin variación destacable…" — a reassuring
  // all-clear on a failed load, the single most dangerous defect in a
  // surveillance tool (empty ≠ all-clear).
  const kpisDegraded = (kpis.degraded === true || kpis.kpis.length === 0) && !kpisPending;

  // The ranking is layer-driven (the base layer's own fetch), NOT the KPI strip.
  // Scoped to RATE layers (cobertura): an EMPTY rate feature collection means we
  // have no jurisdictions to compare against meta, so the panel must NOT claim
  // "sin jurisdicciones bajo meta" (a reassuring all-clear) — that all-clear may
  // only show for a POPULATED layer where no unit is below meta. Density layers
  // keep their already-honest "Sin datos suficientes en este alcance." copy.
  const rankingDataUnavailable =
    rankingKind === "rate" && (rankedActiveLayer?.features.features.length ?? 0) === 0;

  // panorama-vista-redesign Phase 4 (design Decision 4): temporal gating is
  // sourced EXCLUSIVELY from isTemporalLayer() over the ACTIVE layer set —
  // no scrubber-local temporal set (the regression the design flags). Adding
  // a temporal layer flips this true and self-enables the scrubber.
  const temporalAvailable = PANORAMA_LAYERS.some(
    (l) => states[l.id]?.active && isTemporalLayer(l.id),
  );

  // trust/safety (2026-07-10): the scrubber reproduces only TEMPORAL layers;
  // current-state layers are dimmed (never reconstructed as-of-t). When the
  // PRIMARY/base (caption) layer is current-state — e.g. cobertura in the
  // brotes-activos vista, whose caption reads "estado actual" — the scrubber's
  // dated "Situación al …" framing overreaches: the headline metric cannot vary
  // with the fecha de corte. Surface the base measure so the scrubber can state
  // that honestly instead of fabricating a dated situation over it. Undefined
  // when the base is temporal (no disclaimer needed) or absent.
  const currentStateBaseLabel =
    captionLayer != null && !isTemporalLayer(captionLayer.id)
      ? captionLayer.caption.measure
      : undefined;

  // QA fix (finding 1): the active layer set losing its last temporal layer
  // must park the scrubber back at live — otherwise `scrubbing` stays true
  // (asOf non-null) and the map keeps every non-temporal layer DIMMED while
  // the scrubber itself already shows "No disponible en esta vista". The
  // scrubber's own onChange never re-fires here (its derived `asOf` value
  // hasn't changed), so this console must clear its own state directly.
  useEffect(() => {
    if (!temporalAvailable && asOf !== null) {
      setAsOf(null);
      setScrubResetToken((v) => v + 1);
    }
  }, [temporalAvailable, asOf]);

  // v2C dock: the TimeScrubber lives in the dock's "Línea de tiempo" pane. If
  // it unmounts while a scrub is active (dock collapsed, or another tab), the
  // map would keep showing a HISTORICAL frame with no visible control
  // announcing it — a silent stale view (trust/safety). Park back at live
  // whenever the scrubber pane is hidden mid-scrub.
  useEffect(() => {
    if ((!dockOpen || dockTab !== "timeline") && asOf !== null) {
      setAsOf(null);
      setScrubResetToken((v) => v + 1);
    }
  }, [dockOpen, dockTab, asOf]);

  // Round-2 review #3 follow-up: the scrubber's DISPLAY axis clamps to the live
  // last-event watermark (kpis.dataAsOf). But an AS-OF KPI refetch returns an
  // EARLIER dataAsOf (the scrubbed frame's last event), which would shrink the axis
  // mid-scrub and snap the thumb back to live — silently cancelling the scrub. Hold
  // the LIVE watermark (captured only while parked at live) and feed THAT to the
  // scrubber during a scrub, so the axis stays anchored and the scrub sticks.
  const liveWatermarkRef = useRef<string | null>(null);
  if (asOf === null && !kpisPending && !kpisStale) {
    liveWatermarkRef.current = kpis.dataAsOf ?? null;
  }
  const scrubberWatermark = scrubbing
    ? liveWatermarkRef.current
      ? new Date(liveWatermarkRef.current)
      : null
    : kpisPending || kpisStale
      ? null
      : kpis.dataAsOf
        ? new Date(kpis.dataAsOf)
        : null;

  // ARCHETYPE A: the time scrubber is DOCKED to the map card's bottom edge (see
  // SituationalMap `bottomDock`) instead of floating as a separate block below
  // the map. Its logic/props are UNCHANGED — this is a layout move only.
  const scrubberDock = (
    <TimeScrubber
      since={since}
      until={until}
      onChange={onScrub}
      basis={timeBasis}
      onBasisChange={onBasisChange}
      temporalAvailable={temporalAvailable}
      currentStateBaseLabel={currentStateBaseLabel}
      scrubDetail={scrubDetail}
      onScrubDetailChange={setScrubDetail}
      resetToken={scrubResetToken}
      initialAsOf={initialAsOf}
      // SUGGESTION 9: while a scope/period refetch is in flight the last-known
      // kpis.dataAsOf belongs to the PREVIOUS scope — showing its time would
      // print a stale watermark. Drop to null (scrubber falls back to the
      // generic "Al último evento") until the new cutoff lands.
      watermark={scrubberWatermark}
      histogramBins={signalHistogramBins ?? aggregateHistogramBins}
    />
  );

  // --- v2C floating dock panes ----------------------------------------------
  // Registros: the accessible per-unit projection of what the map paints (the
  // MapDataTable "Ver como tabla" surface, promoted from a rail toggle into the
  // dock's primary records tab — its k-anon "Protegido (k<5)" cells unchanged).
  const dockMeta = `${liveScopeLabel || viewMeta.scopeLabel} · ${viewMeta.periodLabel} · ${
    activeLayers.length
  } ${activeLayers.length === 1 ? "capa" : "capas"}`;
  // H5 (cowork QA): REFERENCE layers (decomisos, refugios) are drawn on the map
  // but are NOT tabulated in Registros (they carry no per-unit aggregate row). An
  // operator auditing "qué venimos haciendo" saw the bubbles on the map but zero
  // rows in the list with no explanation. Name the map-only reference layers in a
  // one-line disclosure above the table so the absence is honest, not a bug.
  const referenceLayerLabels = activeLayers
    .filter((l) => l.dataType === "reference")
    .map((l) => l.label);
  const dockRegistros = (
    <div className="space-y-2">
      {/* Round-2 review #4: the total that EQUALS the primary KPI — Σ(cell counts)
          across the active count layers, with the k-anon gap disclosed so the
          operator reads the same population the strip claims. */}
      {dockRecordSummary.hasCountLayer && (
        <p className="rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card/60 px-3 py-1.5 text-[var(--text-xs)] tabular-nums text-ln-op-ink-2">
          Total: {dockRecordSummary.total.toLocaleString("es-AR")}{" "}
          {dockRecordSummary.total === 1 ? "registro" : "registros"} en {mapTableRows.length}{" "}
          {mapTableRows.length === 1 ? "unidad" : "unidades"}
          {dockRecordSummary.suppressed > 0 &&
            ` (+${dockRecordSummary.suppressed.toLocaleString("es-AR")} ${
              dockRecordSummary.suppressed === 1 ? "protegida" : "protegidas"
            } por k-anonimato)`}
        </p>
      )}
      {referenceLayerLabels.length > 0 && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card/60 px-3 py-1.5 text-[var(--text-xs)] text-ln-op-mute">
          {referenceLayerLabels.length === 1
            ? `${referenceLayerLabels[0]} se muestra solo en el mapa (capa de referencia); no se tabula en Registros.`
            : `${referenceLayerLabels.join(" y ")} se muestran solo en el mapa (capas de referencia); no se tabulan en Registros.`}
        </p>
      )}
      <MapDataTable rows={mapTableRows} caption={mapTableCaption} filename="panorama-mapa" />
    </div>
  );
  // Estadísticas: the Worst-N=10 ranking (PO-ratified depth — ia-v2 §3.3, NOT
  // the prototype's top-7), hover-synced with the map and click-through to the
  // detail drawer. Ranking FOLLOWS THE SCOPE (the base layer's features are
  // already scope-resolved: drilled = the scope's localities/departments —
  // plan note: never the prototype's provinces-while-drilled). The k-anon
  // suppressed count renders as an explicit last row (privacy visible).
  const dockSuppressedCount =
    captionLayer !== null ? (states[captionLayer.id]?.suppressedCount ?? 0) : 0;
  const dockStats =
    rankingKind !== null && captionLayer !== null ? (
      <div className="space-y-2">
        <RankedUnitsPanel
          rows={rankedRows}
          kind={rankingKind}
          measureLabel={captionLayer.caption.measure}
          highlightedKey={highlightedUnitKey}
          onHover={setHighlightedUnitKey}
          onSelect={onRankedSelect}
          dataUnavailable={rankingDataUnavailable}
        />
        {dockSuppressedCount > 0 && (
          <p className="flex items-center gap-2 text-xs text-ln-op-mute">
            <span className="rounded-full border border-ln-op-line px-2 py-0.5 font-medium">
              Protegido (k&lt;5)
            </span>
            {dockSuppressedCount}{" "}
            {dockSuppressedCount === 1 ? "unidad suprimida" : "unidades suprimidas"} por k-anonimato
          </p>
        )}
        <p className="text-xs leading-snug text-ln-op-faint">
          Pasá el mouse por una fila para ubicarla en el mapa · click para ver el detalle.
        </p>
        {rankedRows.length > 0 && (
          <button
            type="button"
            aria-expanded={showDataTable}
            onClick={() => setShowDataTable((v) => !v)}
            className="text-xs font-medium text-ln-op-azul hover:underline"
          >
            {showDataTable ? "Ocultar tabla" : "Ver tabla completa"}
          </button>
        )}
        {showDataTable && (
          <PanoramaDataTable
            rows={rankedRows}
            kind={rankingKind}
            measureLabel={captionLayer.caption.measure}
            onSelect={onRankedSelect}
            dataUnavailable={rankingDataUnavailable}
          />
        )}
      </div>
    ) : (
      <p className="text-xs leading-snug text-ln-op-mute">
        Sin ranking para las capas activas en este alcance.
      </p>
    );

  // v2C legend pill — the compact strip's data. The ramp mirrors what the map
  // ACTUALLY paints: the lifted province classed scale for the caption layer
  // when present (scrub-locked parity), else the division-fill classed colors;
  // no classed fill → no ramp cells (label + dots + k-anon pill only). One dot
  // per active POINT layer, in its registry color.
  const legendRampColors = useMemo<readonly string[] | null>(() => {
    // H10 (cowork QA): in bivariate mode the map paints a 3×3 matrix, NOT a
    // sequential ramp — but the collapsed pill still had a caption/division ramp
    // to show and rendered it, mislabeling the encoding. Suppress the ramp here so
    // the pill shows the honest bivariate hint (LegendPill `bivariate`) instead.
    if (bivariateActive) return null;
    if (captionLayer && provinceSeqLegend[captionLayer.id]) {
      return provinceSeqLegend[captionLayer.id].colors;
    }
    if (divisionLegend && divisionLegend.colors.length > 0) return divisionLegend.colors;
    return null;
  }, [captionLayer, provinceSeqLegend, divisionLegend, bivariateActive]);
  const legendLayerDots = useMemo(
    () =>
      activeLayers
        .filter((l) => l.geomType === "point")
        .map((l) => ({ color: l.color, label: l.label })),
    [activeLayers],
  );

  // task #63: bivariate encoding toggle — offered ONLY on "Brotes activos" at
  // province framing (both inputs active). A map ENCODING switch (how the two
  // layers are drawn), not a data toggle. ARCHETYPE A: relocated from above the
  // map into the monitoring rail so the geography leads the fold.
  const bivariateControl = bivariateEligible ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2">
      <div className="flex flex-col">
        <span className="text-[var(--text-sm)] font-semibold text-ln-op-ink-2">
          Ver riesgo combinado
        </span>
        <span className="text-[var(--text-xs)] text-ln-op-mute">
          Cobertura baja × señales altas — el rincón de riesgo del mapa bivariado
        </span>
      </div>
      <fieldset className="m-0 inline-flex overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line p-0">
        <legend className="sr-only">Codificación del mapa de brotes</legend>
        <button
          type="button"
          aria-pressed={!bivariateMode}
          onClick={() => setBivariateMode(false)}
          className={`px-2.5 py-1 text-[var(--text-sm)] font-medium transition-colors ${
            !bivariateMode
              ? "bg-ln-op-azul/10 text-ln-op-azul"
              : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
          }`}
        >
          Capas
        </button>
        <button
          type="button"
          aria-pressed={bivariateActive}
          // The bivariate join can't mix a frozen (non-temporal) cobertura
          // with an as-of zoonosis frame — offered only at the live edge; and
          // it needs enough comparable units to classify (WARNING 7).
          disabled={scrubbing || bivariateDegenerate}
          title={
            scrubbing
              ? "Riesgo bivariado — solo al último evento"
              : bivariateDegenerate
                ? `Riesgo bivariado requiere al menos ${BIVARIATE_MIN_UNITS} unidades comparables`
                : undefined
          }
          onClick={() => setBivariateMode(true)}
          className={`px-2.5 py-1 text-[var(--text-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            bivariateActive
              ? "bg-ln-op-azul/10 text-ln-op-azul"
              : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
          }`}
        >
          Riesgo (bivariado)
        </button>
      </fieldset>
      {scrubbing && (
        <p className="w-full text-[var(--text-xs)] text-ln-op-mute" aria-live="polite">
          Riesgo bivariado — solo al último evento (la cobertura no se reconstruye en el tiempo).
        </p>
      )}
      {!scrubbing && bivariateDegenerate && (
        <p className="w-full text-[var(--text-xs)] text-ln-op-mute" aria-live="polite">
          Riesgo bivariado requiere al menos {BIVARIATE_MIN_UNITS} unidades comparables en la vista.
        </p>
      )}
    </div>
  ) : null;

  // task #38 v3 rail — the active vista name (shown once) + the Filtro badge.
  const vistaName = activeVistaName(activePresetId);
  const activeLayerIds = PANORAMA_LAYERS.filter((l) => states[l.id]?.active).map((l) => l.id);
  const filtroBadge = countFiltroModifiers({
    activeLayerIds,
    presetId: activePresetId,
    baseLayerId: captionLayer?.id ?? null,
    activePeriod: periodParam,
    verifiedOnly,
  });
  const timelineActive = dockOpen && dockTab === "timeline";

  // The 7 rail items, top-to-bottom (spec item 1). Panels open the ONE uniform
  // RailPanel; actions fire immediately.
  const railItems: RailItem[] = [
    {
      id: "vista",
      icon: "vista",
      label: "Vista",
      kind: "panel",
      detail: vistaDetail,
      onDetailChange: setVistaDetail,
      render: (detail) => (
        <div className="space-y-2">
          <PresetPanel
            presets={PANORAMA_PRESETS}
            activePresetId={activePresetId}
            onPreset={(id) => {
              onPreset(id);
              setRailOpen(null);
            }}
            layout="list"
            labelledBy="panorama-vista-label"
          />
          <p id="panorama-vista-label" className="sr-only">
            Vista
          </p>
          {detail && activePreset?.description && (
            <p className="border-t border-ln-op-line-2 pt-2 text-[var(--text-xs)] leading-snug text-ln-op-mute">
              {activePreset.description}
            </p>
          )}
        </div>
      ),
    },
    {
      // H11 (cowork QA): this funnel opened a LAYER selector (capas on/off, opacity,
      // verified-only) — NOT attribute filters. The "Filtro" name + funnel icon
      // promised severity/status filtering that does not exist (deferred to #44), so
      // rename to the honest "Capas" with a layers icon. `filtro` id/state names are
      // internal (English) and unchanged.
      id: "filtro",
      icon: "capas",
      label: "Capas del mapa",
      kind: "panel",
      badge: filtroBadge,
      detail: capasDetail,
      onDetailChange: setCapasDetail,
      render: (detail) => (
        <FiltroPanel
          states={states}
          onToggle={onToggle}
          detail={detail}
          presetId={activePresetId}
          scrubbing={scrubbing}
          opacities={opacities}
          onOpacity={onOpacity}
          verifiedOnly={verifiedOnly}
          onToggleVerified={onToggleVerified}
        />
      ),
    },
    {
      id: "periodo",
      icon: "periodo",
      label: "Período",
      kind: "panel",
      detail: periodoDetail,
      onDetailChange: setPeriodoDetail,
      render: (detail) => (
        <PeriodPanel
          activePeriod={periodParam}
          detail={detail}
          from={fromParam ?? null}
          to={toParam ?? null}
        />
      ),
    },
    {
      id: "timeline",
      icon: "linea-tiempo",
      label: "Línea de tiempo",
      kind: "action",
      active: timelineActive,
      onClick: () => {
        if (timelineActive) {
          setDockOpen(false);
        } else {
          setDockTab("timeline");
          setDockOpen(true);
        }
      },
    },
    {
      id: "exportar",
      icon: "exportar",
      label: "Exportar",
      kind: "panel",
      detail: exportDetail,
      onDetailChange: setExportDetail,
      render: (detail) => (
        <div className="space-y-2">
          <button
            type="button"
            onClick={copyView}
            className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[var(--text-sm)] text-ln-op-ink hover:bg-ln-op-stripe"
          >
            <span aria-hidden="true">🔗</span> Copiar vista
            {copied && <span className="text-[var(--text-xs)] text-ln-op-ok">· copiada</span>}
          </button>
          <SavedViewsPopover />
          <button
            type="button"
            onClick={() => exportPngFnRef.current?.()}
            className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[var(--text-sm)] text-ln-op-ink hover:bg-ln-op-stripe"
          >
            <span aria-hidden="true">🖼️</span> Exportar PNG
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="En desarrollo"
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[var(--text-sm)] text-ln-op-faint"
          >
            Informe de situación (en desarrollo)
          </button>
          {detail && (
            <p className="border-t border-ln-op-line-2 pt-2 text-[var(--text-xs)] leading-snug text-ln-op-mute">
              «Copiar vista» copia un enlace con la vista, el alcance y el período actuales. «Vistas
              guardadas» recuerda tableros con nombre. «Exportar PNG» descarga el mapa con una nota
              de método al pie.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "actualizar",
      icon: "actualizar",
      label: refreshing ? "Actualizando…" : "Actualizar",
      kind: "action",
      disabled: refreshing || kpisPending,
      onClick: onRefresh,
    },
    {
      id: "acerca",
      icon: "acerca",
      label: "Acerca",
      kind: "panel",
      detail: acercaDetail,
      onDetailChange: setAcercaDetail,
      render: (detail) => (
        <div className="space-y-2 text-[var(--text-sm)] text-ln-op-mute">
          <p className="max-w-prose">
            Mapa situacional por capas sobre el registro de eventos. Las superficies de detalle
            (mortalidad, vigilancia, pérdidas) viven como capas de esta misma vista.
          </p>
          {detail && (
            <>
              {demoNotice}
              {aboutSlot}
              <PanoramaKpiFooter kpis={kpis} pending={kpisPending} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* v2C masthead — the ONLY fixed row of the console (spec: everything else
          floats over the map). Title + "Acerca" popover on the left; fresh chip
          + Actualizar on the right. The SCOPE pill moved into the floating
          top-right cluster over the map (it is the keyboard path to the
          jurisdiction menu). Rendered only when the caller passes `scopeLabel`
          (the pages always do; unit/embedding callers that omit it keep no
          masthead). */}
      {scopeLabel !== undefined && (
        <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-ln-op-line bg-ln-op-card px-4 py-1.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-ink-2">
            Centro de Situación Nacional
          </h2>
          {/* task #38 v3: "Acerca de esta vista" (methodology + demo + KPI footer)
              and "Actualizar" moved into the floating rail (Acerca / Actualizar
              icons). The masthead keeps only the identity line + the honesty
              signals (demo pill + data-freshness chip). */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* Compact always-visible demo pill (the full disclosure lives in the
                "Acerca" popover) — the honesty signal never scrolls away because
                nothing scrolls, but it must also never be hidden behind a click. */}
            {demoNotice != null && (
              <span
                className="rounded-full border border-ln-op-warn-bd bg-ln-op-warn-bg px-2 py-0.5 text-[var(--text-xs)] font-medium text-ln-op-ink-2"
                title="El dataset cargado es sintético (densidad ponderada por Censo 2022); no representa casos reales."
              >
                Datos de demostración
              </span>
            )}
            {/* H7 (cowork QA): this chip is the LAST EVENT in the active alcance,
                not a data-freshness watermark — it legitimately changes when the
                scope changes (a smaller alcance has an older last event). Labeled
                "Último evento en el alcance" so it never reads as "Salta tiene datos
                más viejos". */}
            {kpis.dataAsOf && (
              <span
                suppressHydrationWarning
                title="Fecha y hora del evento más reciente dentro del alcance seleccionado (no es la frescura general de los datos)."
                className="rounded-full border border-ln-op-line bg-ln-op-card px-2.5 py-0.5 text-[var(--text-xs)] tabular-nums text-ln-op-mute"
              >
                Último evento en el alcance:{" "}
                {new Date(kpis.dataAsOf).toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: AR_TIME_ZONE,
                })}
              </span>
            )}
          </div>
        </header>
      )}
      {/* v2C body: ONE map region — the map fills everything below the masthead
          and every other control floats over it as an absolute overlay
          (`relative` here is their positioning ancestor). Expanding the dock,
          opening menus or switching views never re-layouts MapLibre (spec
          no-negociable #4). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MapErrorBoundary key={mapReloadKey} onReset={() => setMapReloadKey((k) => k + 1)}>
          <SituationalMapDynamic
            layers={mapLayers}
            label={mapLabel}
            fill
            aggregationLabel={aggregationLabel}
            // task #38 v3: the console owns all chrome now (the floating vertical
            // rail + the top-left scope pill / KPI cluster). The map renders no
            // legacy toolbar and no top-right briefing card; it only hands its
            // map-coupled exportPng up for the "Exportar" rail panel.
            overlayChrome
            registerExportPng={registerExportPng}
            onDivisionLegendChange={setDivisionLegend}
            onGraduatedScaleChange={setGraduatedScale}
            onProvinceSeqLegendChange={setProvinceSeqLegend}
            onFeatureClick={onFeatureClick}
            onProvinceDrill={canDrillProvince ? onProvinceDrill : undefined}
            onReturnNational={canReturnNational ? onReturnNational : undefined}
            // task #36 fix 5 — semantic scroll navigation. Only free-navigation
            // operators (admin/universal, no forced jurisdiction) get the wheel
            // takeover + the general scope commit; a pinned gob operator keeps
            // cooperative wheel-zoom bounded to their jurisdiction.
            onScopeCommit={scrollNavEligible ? commitScopeDrill : undefined}
            scrollNavEnabled={scrollNavEligible}
            initialBounds={initialBounds}
            frameProvinceOnLoad={frameProvinceOnLoad}
            rateProvinceOnlyEmpty={rateProvinceOnlyEmpty}
            selectedProvinceCode={selectedProvinceCode}
            selectedLocalityCenter={selectedLocalityCenter}
            localityCommitted={effectiveScopeLocality != null}
            frame={presetFrame}
            onZoom={onMapZoom}
            initialCamera={initialCamera}
            onCameraChange={onCameraChange}
            highlightedUnitKey={highlightedUnitKey}
            onUnitHover={setHighlightedUnitKey}
            viewMeta={viewMeta}
          />
        </MapErrorBoundary>
        {/* H12: loading skeleton over the map — a shimmer + honest cue while the
            first bubbles fetch, so a direct-URL entry never reads as a blank map.
            pointer-events-none so it never blocks the map underneath; cleared the
            instant features paint. */}
        {showMapSkeleton && (
          <div
            aria-busy="true"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-ln-op-card/45 backdrop-blur-[1px]"
          >
            <span className="animate-pulse rounded-full border border-ln-op-line bg-ln-op-card/95 px-4 py-1.5 text-[var(--text-sm)] font-medium text-ln-op-mute shadow-sm">
              Cargando el mapa…
            </span>
          </div>
        )}
        <PanoramaDock
          open={dockOpen}
          onOpenChange={setDockOpen}
          tab={dockTab}
          onTabChange={setDockTab}
          recordCount={dockBadgeCount}
          meta={dockMeta}
          csvAction={
            dockCsvHref !== null ? (
              <a
                href={dockCsvHref}
                download="panorama-mapa.csv"
                className="rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2 py-0.5 text-xs font-medium text-ln-op-ink-2 hover:border-ln-op-azul/40"
              >
                Exportar CSV
              </a>
            ) : undefined
          }
          registros={dockRegistros}
          stats={dockStats}
          timeline={scrubberDock}
        />
        {/* task #38 v3 top-LEFT cluster: the floating scope pill (THE keyboard
            path to the jurisdiction menu — NOT in the rail, per spec), the vista
            name stated ONCE (de-dup), then the KPI cards, stale notice and the
            bivariate encoding toggle. The rail owns the right edge. Absolute —
            never re-layouts the map. Narrows below 2xl so 1366 releases the map
            center. */}
        <div className="absolute left-3.5 top-3.5 z-10 flex w-64 max-w-[calc(100%-1.75rem)] flex-col gap-2 2xl:w-72">
          {(scopeLabel !== undefined ||
            allowedProvinces !== undefined ||
            filtersSlot !== undefined) && (
            <OverlayDisclosure
              summaryTestId="panorama-scope-pill"
              panelClassName="left-0 w-80 max-w-[80vw]"
              closeSignal={`${effectiveScopeProvince ?? ""}|${effectiveScopeLocality ?? ""}`}
              summaryClassName="inline-flex w-fit items-center gap-1.5 rounded-full border border-ln-op-azul bg-ln-op-azul/5 px-3.5 py-1 text-[var(--text-sm)] font-semibold text-ln-op-azul hover:bg-ln-op-azul/10"
              summary={
                <>
                  <span aria-hidden="true">◉</span>
                  <span className="sr-only">Alcance</span>
                  {liveScopeLabel || "Nacional"}
                  <span aria-hidden="true" className="text-[var(--text-xs)]">
                    ▾
                  </span>
                </>
              }
            >
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
                  Jurisdicción
                </p>
                {/* The JurisdictionSwitcher is rendered CLIENT-SIDE (embedded
                    drill): a province/locality pick commits the scope shallowly
                    (no reload). Native selects = the full keyboard path. */}
                {allowedProvinces !== undefined && (
                  <JurisdictionSwitcher
                    allowedProvinces={allowedProvinces}
                    localities={scopeData.localities}
                    selectedProvince={effectiveScopeProvince}
                    selectedLocality={effectiveScopeLocality}
                    onScopeCommit={onSwitcherScopeCommit}
                  />
                )}
                {filtersSlot}
                <p className="text-[var(--text-xs)] leading-snug text-ln-op-faint">
                  También podés hacer click en una provincia del mapa.
                </p>
              </div>
            </OverlayDisclosure>
          )}
          {vistaName && (
            <p className="w-fit max-w-full rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card/95 px-3 py-1 text-[var(--text-xs)] text-ln-op-mute shadow-sm">
              Vista · <span className="font-semibold text-ln-op-ink-2">{vistaName}</span>
            </p>
          )}
          <KpiChips
            kpis={kpis}
            metricIds={metricIds}
            presetId={activePresetId}
            activeBaseLayerId={captionLayer?.id ?? null}
            onRebase={(id) => {
              void onToggle(id);
            }}
            onOpenAbout={() => setRailOpen("acerca")}
            pending={kpisPending}
            degraded={kpisDegraded}
          />
          {kpisStale && (
            // error-path audit 2026-07-04 finding E5: the KPI refetch failed and
            // the cards show the last-known numbers, not live ones — say so.
            <output
              aria-live="polite"
              className="block rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-xs text-ln-op-warn"
            >
              No pudimos actualizar los indicadores. Mostrando los últimos valores conocidos.
            </output>
          )}
          {/* task #63: bivariate map-encoding toggle (only on Brotes activos). */}
          {bivariateControl}
        </div>
        {/* task #38 v3 — the vertical modifier rail (right edge of the map). */}
        <PanoramaRail items={railItems} open={railOpen} onOpenChange={setRailOpen} />
        {/* v2C single-line legend pill (bottom-left, above the dock bar): base
            label + classed ramp + per-layer dots + the ALWAYS-VISIBLE k-anon
            pill. Expands upward into the FULL reading: the real MapLegends
            blocks + caption + honesty notices + the one-line auto-reading. */}
        <div className="absolute bottom-16 left-3.5 z-10 max-w-[calc(100%-1.75rem)]">
          <LegendPill
            baseLabel={
              bivariateActive ? "Riesgo combinado" : (captionLayer?.label ?? "Eventos por unidad")
            }
            rampColors={legendRampColors}
            bivariate={bivariateActive}
            layerDots={legendLayerDots}
          >
            <div className="space-y-2.5">
              {/* k-anon disclosure — the full per-layer suppression counts. */}
              <PanoramaSuppressionNotice states={states} />
              {/* panorama-ia-v2 §2.4: plain-language caption — what a map mark
                  means at the active VISTA + derived level. Under the bivariate
                  encoding it explains the 3×3 matrix + tercile method instead. */}
              {bivariateActive ? (
                <p className="text-sm leading-snug text-ln-op-mute" aria-live="polite">
                  Riesgo combinado por provincia: cobertura antirrábica (terciles) × señales de
                  zoonosis (terciles). El rincón de riesgo — cobertura baja · señales altas —
                  resalta en rosa. Terciles calculados sobre la distribución del alcance actual. Una
                  provincia protegida por privacidad (k-anonimato) se muestra con trama, nunca con
                  color.
                </p>
              ) : (
                <PanoramaCaption layer={captionLayer} level={level} period={captionPeriod} />
              )}
              {/* WARNING 6: honest note when the color scale is anchored to a
                  shared link's day rather than the live edge. */}
              {scaleAnchoredToAsOf && scrubbing && (
                <p className="text-xs leading-snug text-ln-op-mute" aria-live="polite">
                  Escala de color anclada a este día (se abrió desde un enlace con fecha). Volvé al
                  último evento para fijarla al borde en vivo.
                </p>
              )}
              {/* The full scale legends (province ramp / division fill /
                  graduated circles / bivariate 3×3). */}
              <MapLegends
                layers={mapLayers}
                divisionLegend={divisionLegend}
                graduatedScale={graduatedScale}
                provinceSeqLegend={provinceSeqLegend}
              />
              {/* panorama-event-points: honest points-mode disclosure. */}
              {pointsMode && Object.keys(pointsInfo).length > 0 && (
                <output
                  aria-live="polite"
                  className="block space-y-1 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 text-xs text-ln-op-ink-2"
                >
                  {Object.entries(pointsInfo).map(([id, info]) => (
                    <p key={id}>{pointsDisclosureLine(id as LayerId, info)}</p>
                  ))}
                </output>
              )}
              {/* One-line auto-reading (narration LAST — monitoring order). */}
              <PanoramaReading
                kpis={readingKpis}
                stale={kpisStale}
                pending={kpisPending}
                degraded={kpisDegraded}
              />
            </div>
          </LegendPill>
        </div>
      </div>
      <DetailDrawer selected={selected} periodLabel={viewMeta.periodLabel} onClose={closeDrawer} />
    </div>
  );
}
