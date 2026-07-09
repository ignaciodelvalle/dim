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

import { CapasBox } from "@/components/panorama/CapasBox";
import { DetailDrawer, type SelectedFeature } from "@/components/panorama/DetailDrawer";
import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import { PanoramaCaption } from "@/components/panorama/PanoramaCaption";
import { PanoramaDataTable } from "@/components/panorama/PanoramaDataTable";
import { PanoramaKpiFooter } from "@/components/panorama/PanoramaKpiFooter";
import { PanoramaMetricsColumn } from "@/components/panorama/PanoramaMetricsColumn";
import { PanoramaReading } from "@/components/panorama/PanoramaReading";
import { PanoramaSuppressionNotice } from "@/components/panorama/PanoramaSuppressionNotice";
import { PresetPanel } from "@/components/panorama/PresetPanel";
import { RankedUnitsPanel } from "@/components/panorama/RankedUnitsPanel";
import type { ActiveLayer, PointRenderMode } from "@/components/panorama/SituationalMap";
import { SituationalMapDynamic } from "@/components/panorama/SituationalMapDynamic";
import { TimeScrubber } from "@/components/panorama/TimeScrubber";
import {
  Z_LOCALITY,
  derivedLevel,
  pointsEligible,
} from "@/components/panorama/situational-map-utils";
import { useKeyedAbort } from "@/components/panorama/use-keyed-abort";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import type { LocalityCentroids } from "@/lib/infra/ar-localidades";
import { pushMapStateUrl, replaceMapStateUrl } from "@/lib/ui/map-layer-nav";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
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

/** Persists the board (layers/level/preset/period) for the bare-URL restore. */
function saveBoard(params: URLSearchParams): void {
  try {
    const board: SavedBoard = {
      layers: params.get("layers") ?? "",
      level: params.get("level") === "locality" ? "locality" : "province",
      preset: params.get("preset"),
      period: params.get("period"),
    };
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Storage unavailable (private mode, quota) — the board just isn't remembered.
  }
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
  /** Server-rendered headline KPIs (recalculated for the active scope+period). */
  initialKpis: PanoramaKpis;
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
};

export function PanoramaConsole({
  defaultLayerId,
  defaultFeatures,
  defaultTruncated = false,
  defaultSuppressedCount = 0,
  defaultNoLocalityCount = 0,
  initialKpis,
  initialBounds,
  localityCentroids = {},
  initialLevel = "province",
  filtersSlot,
  initialDivisionProvince = null,
}: Props) {
  const searchParams = useSearchParams();
  // panorama-redesign Fase 1: per-key fetch cancellation. Key = layer id for
  // /api/panorama/[layer] fetches, "kpis" for the KPI strip — last click wins
  // per key; superseded fetches abort instead of racing the UI state.
  const { signalFor } = useKeyedAbort();
  // Feature data per layer (the default is seeded; others fetched on toggle).
  // This is the LIVE cache (asOf=null). The temporal as-of cache is separate.
  // When the server seeded the default layer at locality level (scoped view,
  // initialLevel="locality"), the seed lands here — this IS the locality cache.
  const dataRef = useRef<Map<LayerId, FeatureCollection>>(
    initialLevel === "locality" ? new Map([[defaultLayerId, defaultFeatures]]) : new Map(),
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
    initialLevel === "province" && isAggregatedPointLayer(defaultLayerId)
      ? new Map([[defaultLayerId, defaultFeatures]])
      : new Map(),
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
    if (urlLevel === "locality" || urlLevel === "province") return urlLevel;
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
  // Effective scope for the UX points gate: an explicit picker province wins;
  // otherwise the govt operator's implicit single-province scope.
  const pointsScopeProvince = searchParams.get("province") ?? initialDivisionProvince;
  const pointsScopeLocality = searchParams.get("locality");
  const pointsMode = pointsEligible(
    { country: "AR", province: pointsScopeProvince, locality: pointsScopeLocality },
    mapZoom,
  );

  const [states, setStates] = useState<Record<LayerId, LayerPanelState>>(() => {
    const s = initialState();
    const urlLayerIds = parseLayersParam(searchParams.get("layers"));
    if (urlLayerIds === null) {
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
  const [kpis, setKpis] = useState<PanoramaKpis>(initialKpis);
  // error-path audit 2026-07-04 finding E5: a failed KPI refetch used to be
  // silently swallowed, leaving stale numbers on screen with no signal that
  // they no longer reflect the active scope/period. kpisStale surfaces that
  // without touching the no-flash behavior (the last-known kpis stay put).
  const [kpisStale, setKpisStale] = useState(false);
  const qs = searchParams.toString();
  // map-QOL: KPI refetches key on the SCOPE+PERIOD subset only — the shallow
  // board params (layers/level/preset) don't change what the KPIs measure.
  const scopePeriodQs = useMemo(() => scopePeriodQsOf(searchParams), [searchParams]);
  // Skip the refetch for the very first render (the server already seeded the
  // KPIs for the initial searchParams); only refetch when the filters change.
  const seededQsRef = useRef<string | null>(scopePeriodQs);
  useEffect(() => {
    if (seededQsRef.current === scopePeriodQs) {
      seededQsRef.current = null;
      return;
    }
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
      });
    return () => {
      cancelled = true;
    };
  }, [scopePeriodQs, signalFor]);

  // --- F4 temporal reproduction -------------------------------------------
  // The active period window [since, until] drives the scrubber axis. Resolved
  // from the SAME searchParams the server used (parity). `until` is "ahora".
  const { since, until } = useMemo(
    () =>
      resolveAnalyticsPeriod({
        // Panorama defaults to a multi-year window so the scrubber spans the
        // seeded history; the detail dashboards keep their own short defaults.
        period: searchParams.get("period") ?? PANORAMA_DEFAULT_PRESET,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      }),
    [searchParams],
  );

  // Current as-of upper bound. null = live (parked at "ahora").
  const [asOf, setAsOf] = useState<Date | null>(null);
  const scrubbing = asOf !== null;

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
        // task #77: replay by recorded_at when the operator picked transaction time.
        if (timeBasis === "transaction") params.set("basis", "transaction");
        try {
          const res = await fetch(`/api/panorama/${l.id}?${params.toString()}`, {
            headers: { accept: "application/json" },
          });
          if (!res.ok) return;
          const body = (await res.json()) as ApiResponse;
          asOfDataRef.current.set(l.id, body.features);
        } catch {
          // Leave the last-known as-of features in place on a transient failure.
        }
      }),
    ).then(() => {
      if (!cancelled) setAsOfVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [asOf, searchParams, timeBasis]);

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
      const features = usesPoints
        ? (pointsDataRef.current.get(l.id) ?? EMPTY_FC)
        : usesProvinceCache
          ? (provinceDataRef.current.get(l.id) ?? EMPTY_FC)
          : scrubbing && temporal
            ? (asOfDataRef.current.get(l.id) ?? EMPTY_FC)
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
        const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as ApiResponse;
        asOfDataRef.current.set(id, body.features);
        setAsOfVersion((v) => v + 1);
      } catch {
        // Leave the live features showing on a transient failure (no flash).
      }
    },
    [searchParams],
  );

  // U5: fetch a choropleth layer at a given aggregation level into the right
  // cache (province → provinceDataRef; locality → dataRef). Returns the count so
  // the LayerPanel state can be refreshed. Threads the active scope/period qs.
  const fetchChoroplethAt = useCallback(
    async (id: LayerId, lvl: AggregationLevel): Promise<ApiResponse | null> => {
      const params = new URLSearchParams(searchParams.toString());
      if (lvl === "province") params.set("level", "province");
      applyVerifiedParam(params, id);
      try {
        const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
          headers: { accept: "application/json" },
          signal: signalFor(id),
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
      const wasActive = states[id]?.active ?? false;
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
    return raw !== null && getPreset(raw as PresetId) ? (raw as PresetId) : null;
  });

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
  const applyPreset = useCallback(
    (id: PresetId, commit: "push" | "replace") => {
      const preset = getPreset(id);
      if (!preset) return;

      // Clear all caches — preset always starts fresh.
      dataRef.current.clear();
      provinceDataRef.current.clear();
      asOfDataRef.current.clear();
      setAsOf(null);

      // Switch aggregation level immediately so statesRef and any effect that
      // reads levelRef both see the correct level.
      setLevel(preset.level);
      levelRef.current = preset.level;

      const presetIds = presetLayerIds(preset);

      // Flip all layers: deactivate current ones; mark preset layers active+loading.
      setStates((s) => {
        const next = { ...s };
        for (const l of PANORAMA_LAYERS) {
          if (presetIds.includes(l.id)) {
            next[l.id] = {
              active: true,
              loading: true,
              count: 0,
              suppressedCount: 0,
              truncated: false,
            };
          } else if (s[l.id]?.active) {
            next[l.id] = { ...s[l.id], active: false, compatibilityHint: undefined };
          }
        }
        return next;
      });

      setActivePresetId(id);

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
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("period", preset.periodPreset);
      nextParams.set("layers", canonicalLayersKey(presetIds));
      if (preset.level === "locality") nextParams.set("level", "locality");
      else nextParams.delete("level");
      nextParams.set("preset", id);
      presetCommittedQsRef.current = scopePeriodQsOf(nextParams);
      const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
      if (commit === "push") pushMapStateUrl(nextUrl);
      else replaceMapStateUrl(nextUrl);
      saveBoard(nextParams);
      // panorama-redesign Fase 1: TRAILING debounce on the layer-fetch burst
      // ONLY — the state flips + shallow URL push above stay synchronous
      // (instant feedback). Rapid preset clicks coalesce into one burst for
      // the LAST selection; in-flight fetches are superseded via keyed abort.
      if (presetFetchTimerRef.current !== null) {
        window.clearTimeout(presetFetchTimerRef.current);
      }
      presetFetchTimerRef.current = window.setTimeout(() => {
        presetFetchTimerRef.current = null;
        void fetchLayersInto(presetIds, preset.level, nextParams);
      }, PRESET_FETCH_DEBOUNCE_MS);
    },
    [searchParams, fetchLayersInto],
  );

  /** F3: explicit preset click — a back-button-undoable board commit. */
  const onPreset = useCallback((id: PresetId) => applyPreset(id, "push"), [applyPreset]);

  // panorama-ia-v2 §1.1: DERIVE the aggregation level from (scope, zoom) instead
  // of a manual toggle. Scope selection or zooming past Z_LOCALITY drills to the
  // locality mark; a locality-baseline preset (e.g. bienestar) stays at locality
  // even zoomed out (prefer precision — PO #1). The derivation only ever calls
  // the existing onLevelChange machinery (cache-aware, keyed-abort), so the
  // province/locality fetch routing and the debounce/abort contract are intact.
  // The effective province for level derivation: an explicit picker selection
  // wins; otherwise fall back to the implicit single-province scope so a
  // jurisdiction-scoped operator (e.g. CABA) drills to LOCALITY on mount — the
  // granularity the division fill joins against — exactly as an explicit
  // ?province selection would (derivedLevel: any province scope → locality).
  const derivedProvince = searchParams.get("province") ?? initialDivisionProvince;
  const derivedLocality = searchParams.get("locality");
  useEffect(() => {
    const fromScopeZoom = derivedLevel(
      { country: "AR", province: derivedProvince, locality: derivedLocality },
      mapZoom,
    );
    const presetLevel = activePresetId ? getPreset(activePresetId)?.level : undefined;
    const desired: AggregationLevel =
      fromScopeZoom === "locality" || presetLevel === "locality" ? "locality" : "province";
    if (desired !== levelRef.current) onLevelChange(desired);
  }, [mapZoom, derivedProvince, derivedLocality, activePresetId, onLevelChange]);

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
    if (params.toString() === before) return;
    const qsStr = params.toString();
    replaceMapStateUrl(`${window.location.pathname}${qsStr ? `?${qsStr}` : ""}`);
    saveBoard(params);
  }, [activeLayersKey, level, activePresetId, verifiedOnly]);

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
    const missingFromCache = (ids: LayerId[], lvl: AggregationLevel) =>
      ids.filter((lid) => {
        const levelSensitive = CHOROPLETH_IDS.has(lid) || isAggregatedPointLayer(lid);
        const cache =
          levelSensitive && lvl === "province" ? provinceDataRef.current : dataRef.current;
        return !cache.has(lid);
      });

    if (urlLayerIds !== null) {
      const missing = missingFromCache(urlLayerIds, levelRef.current);
      if (missing.length > 0) void fetchLayersInto(missing, levelRef.current, current);
      return;
    }

    // Bare URL — offer the saved board, if any. Explicit period/preset params
    // mean the operator navigated here on purpose: don't override.
    if (current.get("period") !== null || current.get("preset") !== null) return;
    let saved: SavedBoard | null = null;
    try {
      const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
      saved = raw !== null ? (JSON.parse(raw) as SavedBoard) : null;
    } catch {
      // Storage unreadable — treat as a first visit: default-activate below.
      saved = null;
    }
    if (saved === null) {
      // (c) No explicit board, no saved board — first visit: land on the
      // flagship question-framed preset instead of the orphan default layer.
      applyPreset(DEFAULT_PANORAMA_PRESET_ID, "replace");
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
  }, [fetchLayersInto, applyPreset]);

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
        return p.provinceCode === key || p.place === key || p.name === key;
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
    const province = searchParams.get("province");
    const locality = searchParams.get("locality");
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
  }, [searchParams, since, until, states, asOf]);

  const onScrub = useCallback((next: Date | null) => setAsOf(next), []);

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
    const kpiFetch = fetch(`/api/panorama/kpis${scopePeriodQs ? `?${scopePeriodQs}` : ""}`, {
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
  const selectedProvinceCode = searchParams.get("province") ?? initialDivisionProvince ?? null;
  const selectedLocalitySlug = searchParams.get("locality") ?? null;
  const selectedLocalityCenter: [number, number] | null =
    selectedLocalitySlug !== null ? (localityCentroids[selectedLocalitySlug] ?? null) : null;

  // panorama-vista-redesign Phase 1 (design Decision 1): Vista panel (VISTA
  // label + active question line + PresetPanel row tabs) → 2-col body
  // (map column: map + honesty lines + scrubber | metrics column: ~342px
  // right rail). Supersedes the Fase 1 flat reflow.
  const activePreset = activePresetId !== null ? getPreset(activePresetId) : null;

  // panorama-vista-redesign Phase 3 (design Decision 3): the active preset's
  // curated metric ids, in display order. Null (manual/advanced mode, no
  // active preset) → PanoramaMetricsColumn shows every KPI, nothing hidden.
  const metricIds = activePreset?.metrics ?? null;

  return (
    <div className="space-y-4">
      {/* Vista panel: the primary control answers the operator's QUESTION
          first — a "VISTA" header + the active preset's question line, above
          the 6-tab row (unchanged, layout="row"). */}
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card p-4">
        {activePreset && (
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">VISTA</p>
            <p className="text-sm font-medium leading-snug text-ln-op-ink">
              {activePreset.description}
            </p>
          </div>
        )}
        <PresetPanel
          presets={PANORAMA_PRESETS}
          activePresetId={activePresetId}
          onPreset={onPreset}
          layout="row"
        />
        {/* panorama-vista-redesign Phase 2 (design Decision 2): CapasBox
            composes the unchanged LayerPanel for Detalle — checkCompatibility
            and role rules are 100% preserved; Simple is a presentational
            surface only. */}
        <CapasBox
          states={states}
          onToggle={onToggle}
          scrubbing={scrubbing}
          opacities={opacities}
          onOpacity={onOpacity}
          verifiedOnly={verifiedOnly}
          onToggleVerified={onToggleVerified}
          capasDetail={capasDetail}
          onCapasDetailChange={setCapasDetail}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_342px]">
        <div className="min-w-0 space-y-3">
          <SituationalMapDynamic
            layers={activeLayers}
            label={mapLabel}
            onFeatureClick={onFeatureClick}
            initialBounds={initialBounds}
            selectedProvinceCode={selectedProvinceCode}
            selectedLocalityCenter={selectedLocalityCenter}
            frame={presetFrame}
            onZoom={onMapZoom}
            highlightedUnitKey={highlightedUnitKey}
            onUnitHover={setHighlightedUnitKey}
            viewMeta={viewMeta}
          />
          {/* panorama-ia-v2 §2.4: plain-language caption — re-states what a map
              mark means at the active VISTA + derived level. These "honesty
              lines" live WITH the map they describe (design Decision 1). */}
          <PanoramaCaption layer={captionLayer} level={level} period={captionPeriod} />
          {/* panorama-event-points: honest points-mode disclosure — one line per
              active points-capable layer, stating the mark is now REAL locations
              (or coarse locality centroids for denuncias), plus the cap ("los N más
              recientes") and the "sin ubicación exacta" residual. */}
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
          {/* k-anon disclosure — suppression is visible without any click. */}
          <PanoramaSuppressionNotice states={states} />
          {/* design-QA 2026-07-04 P0 (control budget): TEMPORARY default-closed
              disclosure — Phase 4 (panorama-vista-redesign) removes this wrapper
              and supersedes the control-budget rule with Simple mode + temporal
              gating (the scrubber becomes a compact always-present element). */}
          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="mr-1 inline-block transition-transform group-open:rotate-90"
              >
                ▸
              </span>
              Reproducir en el tiempo
            </summary>
            <div className="mt-2">
              <TimeScrubber
                since={since}
                until={until}
                onChange={onScrub}
                basis={timeBasis}
                onBasisChange={onBasisChange}
              />
            </div>
          </details>
        </div>
        <div className="space-y-3">
          {/* panorama-vista-redesign Phase 3 (design Decision 1): the metrics
              column's right-rail order — Reading → Alcance y período →
              per-vista KPI tiles → Peores-N ranking → footer → stale notice. */}
          {/* One-line auto-reading derived from the existing KPI deltas (no new
              query). Hidden while the KPIs are stale — the notice below covers it. */}
          <PanoramaReading kpis={kpis.kpis} stale={kpisStale} />
          {/* RSC slot: scope/period filters owned by the SERVER shell, placed
              behind progressive disclosure — identical behavior, one click away. */}
          {filtersSlot !== undefined && (
            <details className="group space-y-2">
              <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block transition-transform group-open:rotate-90"
                >
                  ▸
                </span>
                Alcance y período
              </summary>
              <div className="mt-2 space-y-3">{filtersSlot}</div>
            </details>
          )}
          {/* panorama-vista-redesign Phase 3 (design Decision 3): per-vista KPI
              tiles — replaces the flat 7-tile PanoramaKpiStrip body. Same
              getPanoramaKpis() result; only filtered/ordered by the active
              preset's `metrics` (null in manual mode → shows every KPI). */}
          <PanoramaMetricsColumn kpis={kpis} metricIds={metricIds} />
          {/* panorama-ia-v2 §3.3: "Peores N" ranking — the map collapsed to an
              ordered list (hover-synced with the map), plus the accessible
              <table> view (Ley 26.653). Shown for rate/density base layers only
              (reference layers carry no per-unit ranking). */}
          {rankingKind !== null && captionLayer !== null && (
            <section className="space-y-2">
              <RankedUnitsPanel
                rows={rankedRows}
                kind={rankingKind}
                measureLabel={captionLayer.caption.measure}
                highlightedKey={highlightedUnitKey}
                onHover={setHighlightedUnitKey}
                onSelect={onRankedSelect}
              />
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
                />
              )}
            </section>
          )}
          {/* panorama-ia-v2 §0/§1.2 + PO #5: "Personalizar" (the LayerPanel
              legend/toggle) now lives inside CapasBox's Detalle mode, in the
              Vista panel above — panorama-vista-redesign Phase 2. */}
          {/* KPIs stay LIVE during a scrub (the dashboard metrics are not forked
              by asOf in v1). The footer states the recalculation cue + freshness
              chip + "Actualizar" (extracted from the retired PanoramaKpiStrip). */}
          <PanoramaKpiFooter kpis={kpis} onRefresh={onRefresh} refreshing={refreshing} />
          {kpisStale && (
            // error-path audit 2026-07-04 finding E5: the KPI refetch failed and
            // the strip above is showing the last-known numbers, not live ones —
            // say so instead of leaving the operator misled by a silent stale read.
            <output
              aria-live="polite"
              className="block rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-xs text-ln-op-warn"
            >
              No pudimos actualizar los indicadores. Mostrando los últimos valores conocidos.
            </output>
          )}
        </div>
      </div>
      <DetailDrawer selected={selected} onClose={closeDrawer} />
    </div>
  );
}
