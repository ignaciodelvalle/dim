// PanoramaConsole — module-level helpers, types, and constants.
//
// Extracted mechanically from PanoramaConsole.tsx (file-size split, behavior-
// preserving): everything here is standalone (no closure over component
// state) and unchanged, only moved. PanoramaConsole.tsx re-exports `SeededLayer`
// so external imports keep working unchanged.

import type { ReactNode } from "react";

import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import type { LocalityCentroids } from "@/lib/infra/ar-localidades";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import {
  CHOROPLETH_LAYERS,
  PANORAMA_LAYERS,
  getLayer,
  isAggregatedPointLayer,
} from "@/src/modules/panorama/domain/layers";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
import type {
  AggregationLevel,
  FeatureCollection,
  LayerId,
} from "@/src/modules/panorama/domain/types";

export const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// panorama-redesign Fase 1: trailing debounce for the preset-commit layer
// fetch. Rapid preset clicks coalesce into ONE fetch burst (the last click);
// the state flips + shallow URL push stay synchronous for instant feedback.
export const PRESET_FETCH_DEBOUNCE_MS = 200;

/** True when the error is a fetch cancellation (superseded request, NOT a
 * failure). Every catch on an abort-wrapped path MUST early-return on this —
 * running the failure branch would deactivate the layer on every superseded
 * fetch (design-mandated correctness rule, panorama-redesign Fase 1). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export const initialState = (): Record<LayerId, LayerPanelState> => {
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

export type ApiResponse = {
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  noLocalityCount: number;
  level?: AggregationLevel;
  // panorama-event-points Slice 1: present only on a server-authorized points
  // response ("points"); undefined/absent on the aggregated path.
  mode?: "points" | "aggregated";
  sinUbicacionCount?: number;
  /** Honesty (panorama QA 2026-07-14): the server returned its budget/failure
   *  fallback — an empty that must never read as a real "sin datos". */
  degraded?: boolean;
  /**
   * task panorama-bivariate-2026-07-21: province-grain, k=5-suppressed fallback
   * for the bivariate "riesgo de brotes" join's signal axis. Present only on the
   * zoonosis response at `level=province` (the national overview); undefined
   * everywhere else. See `LayerFeaturesResult.bivariateSignal` server-side jsdoc.
   */
  bivariateSignal?: FeatureCollection;
};

// The two choropleth layer ids — the only layers the aggregation level affects.
export const CHOROPLETH_IDS = new Set<LayerId>(CHOROPLETH_LAYERS.map((l) => l.id));

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
 * (provinceDataRef) rather than the locality cache (dataRef). Mirrors the
 * LEVEL half of the cache routing `activeLayers` uses to READ features
 * (choropleth OR aggregated-point layer, at province level). P4b added a second
 * read route — the NATIONAL LOD band — which this seed predicate deliberately
 * ignores: at mount the scope-aware `mapZoom` init keeps the band at `drilled`
 * for a seeded locality view, so seed placement still equals read placement
 * (the C2 level-invariant); post-mount band flips are covered by the
 * national-band cache-warm effect, never by the seed.
 */
export function seededLayerUsesProvinceCache(id: LayerId, level: AggregationLevel): boolean {
  return (CHOROPLETH_IDS.has(id) || isAggregatedPointLayer(id)) && level === "province";
}

// panorama-event-points: per-layer es-AR copy for the honest points-mode
// disclosure. perdidas/mordeduras plot REAL coordinates; denuncias plots the
// coarse LOCALITY CENTROID (never the exact report coordinate).
export function pointsDisclosureLine(
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
export const SCOPE_PERIOD_KEYS = ["period", "from", "to", "province", "locality"] as const;

export const BOARD_STORAGE_KEY = "panorama:board:v1";

export type SavedBoard = {
  layers: string;
  level: AggregationLevel;
  preset: string | null;
  period: string | null;
  /** P5: the encoding selection (`?encoding=`); optional — older boards lack it. */
  encoding?: string | null;
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
export function scopePeriodQsOf(params: URLSearchParams): string {
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
export function parseLayersParam(raw: string | null): LayerId[] | null {
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
export function canonicalLayersKey(ids: readonly LayerId[]): string {
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
export function saveBoard(
  params: URLSearchParams,
  prefs: { capasDetail: boolean; scrubDetail: boolean },
): void {
  try {
    const board: SavedBoard = {
      layers: params.get("layers") ?? "",
      level: params.get("level") === "locality" ? "locality" : "province",
      preset: params.get("preset"),
      period: params.get("period"),
      encoding: params.get("encoding"),
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
export function loadingPanoramaKpis(): PanoramaKpis {
  return {
    kpis: [],
    recalculatedFor: "Cargando indicadores…",
    dataAsOf: null,
    coverageDenominator: null,
  };
}

export type PanoramaConsoleProps = {
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
   * The locality SLUG the operator is IMPLICITLY scoped to (single-locality govt
   * case — e.g. a CABA-barrio operator), when no locality is explicitly selected.
   * Mirrors `initialDivisionProvince`: folded into the DERIVED scope so
   * `selectedLocalityCenter` resolves and the map autozooms to the locality on
   * load, and the level opens at "locality". PRESENTATION-ONLY — the data scope
   * is unchanged (already enforced server-side by the scoped loaders). Undefined
   * for whole-province, multi-locality, or admin/national scope.
   */
  initialDivisionLocality?: string | null;
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
   * preset — the role default on a first visit, OR the `?preset=<id>` a deep-link
   * named (so it may differ from `defaultPresetId`); `seededLayers` carries the
   * per-layer envelopes. When present the console seeds its caches + states from these,
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
  /**
   * Q12: TRUE only for an operator whose HOME is a bounded jurisdiction (a govt
   * actor with assigned jurisdictions). Drives the map's reset-view control:
   * a bounded operator returns to "mi jurisdicción"; an admin/universal actor
   * returns to "Vista nacional". Distinct from `initialBounds` because a DRILLED
   * admin also receives `initialBounds` (the drilled province bbox) yet has no
   * personal jurisdiction, so keying the label on `initialBounds` mislabels the
   * control for admin. Undefined/false → admin/universal (national reset copy).
   */
  boundedJurisdiction?: boolean;
  /**
   * Cursor I2 — the aggregate cube's build timestamp when the SEEDED view is
   * served from the cube (admin, cubeable choropleth, fresh). Rendered by the
   * "Acerca" footer as the honest "Datos precalculados al …" caption.
   * Null/undefined → live-served (or points-only) seed; the caption reads
   * "Datos en vivo". Reflects the FIRST-render (seeded) source; it is a
   * freshness annotation, not a per-toggle live signal.
   */
  cubeBuiltAt?: Date | string | null;
};
