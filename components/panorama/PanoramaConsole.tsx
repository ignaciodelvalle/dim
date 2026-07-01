"use client";

// PanoramaConsole — the client orchestrator for the situational map.
//
// Owns the per-layer runtime state, fetches /api/panorama/[layer] on toggle
// (threading the active scope/period searchParams so client toggles re-fetch
// with the same filters the server used), and feeds the active layers to the
// (dynamic) SituationalMap. Perdidas is mounted server-side and seeded here as
// the default-on layer, so its features paint on first render without a fetch.

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AggregationToggle } from "@/components/panorama/AggregationToggle";
import { DetailDrawer, type SelectedFeature } from "@/components/panorama/DetailDrawer";
import { LayerPanel, type LayerPanelState } from "@/components/panorama/LayerPanel";
import { PanoramaKpiStrip } from "@/components/panorama/PanoramaKpiStrip";
import { PresetPanel } from "@/components/panorama/PresetPanel";
import type { ActiveLayer, PointRenderMode } from "@/components/panorama/SituationalMap";
import { SituationalMapDynamic } from "@/components/panorama/SituationalMapDynamic";
import { TimeScrubber } from "@/components/panorama/TimeScrubber";
import { PANORAMA_DEFAULT_PRESET, resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import type { LocalityCentroids } from "@/lib/ar-localidades";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { checkCompatibility } from "@/src/modules/panorama/domain/compatibility";
import {
  AGGREGATED_POINT_IDS,
  AGGREGATED_POINT_LAYERS,
  CHOROPLETH_LAYERS,
  PANORAMA_LAYERS,
  getLayer,
  isAggregatedPointLayer,
  isTemporalLayer,
} from "@/src/modules/panorama/domain/layers";
import {
  PANORAMA_PRESETS,
  type PresetId,
  getPreset,
  presetLayerIds,
} from "@/src/modules/panorama/domain/presets";
import type {
  AggregationLevel,
  FeatureCollection,
  LayerId,
} from "@/src/modules/panorama/domain/types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

const initialState = (): Record<LayerId, LayerPanelState> => {
  const out = {} as Record<LayerId, LayerPanelState>;
  for (const l of PANORAMA_LAYERS) {
    out[l.id] = { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false };
  }
  return out;
};

type ApiResponse = {
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  level?: AggregationLevel;
};

// The two choropleth layer ids — the only layers the aggregation level affects.
const CHOROPLETH_IDS = new Set<LayerId>(CHOROPLETH_LAYERS.map((l) => l.id));

type Props = {
  /** Default-on layer id (perdidas) — its features come pre-resolved from the server. */
  defaultLayerId: LayerId;
  /** Server-rendered features for the default layer. */
  defaultFeatures: FeatureCollection;
  /** Envelope for the default layer (truncated/suppressed). */
  defaultTruncated?: boolean;
  defaultSuppressedCount?: number;
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
};

export function PanoramaConsole({
  defaultLayerId,
  defaultFeatures,
  defaultTruncated = false,
  defaultSuppressedCount = 0,
  initialKpis,
  initialBounds,
  localityCentroids = {},
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Feature data per layer (the default is seeded; others fetched on toggle).
  // This is the LIVE cache (asOf=null). The temporal as-of cache is separate.
  const dataRef = useRef<Map<LayerId, FeatureCollection>>(new Map());
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
  // C2 fix: seed the default layer (perdidas, an aggregated point layer) into the
  // PROVINCE cache because the console's default aggregation axis is "province".
  // The server resolves the default seed at province level (app/*/panorama/page.tsx).
  // Seeding into dataRef (locality cache) would leave provinceDataRef empty on
  // first render, causing the activeLayers memo to find EMPTY_FC → blank map.
  const provinceDataRef = useRef<Map<LayerId, FeatureCollection>>(
    isAggregatedPointLayer(defaultLayerId)
      ? new Map([[defaultLayerId, defaultFeatures]])
      : new Map(),
  );

  // U5 aggregation axis — the granularity TOGGLE. Distinct from the scope filter
  // (JurisdictionSwitcher narrows WHAT is shown; this changes HOW the choropleth
  // layers are aggregated + rendered). Defaults to PROVINCE: the national
  // overview reads well at a glance, the province rollup is fast, and it keeps
  // the default off the slow rabies-coverage locality rollup. Locality (centroid
  // symbols) is one toggle away.
  const [level, setLevel] = useState<AggregationLevel>("province");
  const levelRef = useRef(level);
  levelRef.current = level;

  const [states, setStates] = useState<Record<LayerId, LayerPanelState>>(() => {
    const s = initialState();
    s[defaultLayerId] = {
      active: true,
      loading: false,
      count: defaultFeatures.features.length,
      suppressedCount: defaultSuppressedCount,
      truncated: defaultTruncated,
    };
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
  const qs = searchParams.toString();
  // Skip the refetch for the very first render (the server already seeded the
  // KPIs for the initial searchParams); only refetch when the filters change.
  const seededQsRef = useRef<string | null>(qs);
  useEffect(() => {
    if (seededQsRef.current === qs) {
      seededQsRef.current = null;
      return;
    }
    let cancelled = false;
    fetch(`/api/panorama/kpis${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<PanoramaKpis>) : null))
      .then((body) => {
        if (!cancelled && body) setKpis(body);
      })
      .catch(() => {
        // Leave the last-known KPIs in place on a transient failure (no flash).
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

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

  // A new period/scope window invalidates the as-of cache and parks at live. It
  // also invalidates the province-level cache and the LOCALITY-level entries in
  // dataRef for choropleth layers AND aggregated point layers (their counts are
  // period-sensitive). Reference layers keep their cache — they refetch on toggle.
  //
  // W2 fix: after clearing the caches, refetch any CURRENTLY ACTIVE layers that
  // are period-sensitive (aggregated point + choropleth). This is required so a
  // preset's period change (router.replace) fetches at the NEW params rather than
  // having the active-preset layers go blank (cache cleared, no refetch triggered).
  // The fetch uses the NEW searchParams (post-replace) via the effect closure.
  // Mount guard for the cache-invalidation effect below: the server already
  // seeded the default layer at the initial params (C2), so skip the first run.
  const layerSeededQsRef = useRef<string | null>(qs);
  // biome-ignore lint/correctness/useExhaustiveDependencies: qs identity is the intended trigger.
  useEffect(() => {
    // Skip the FIRST run (mount): clearing + refetching here would wipe the C2
    // seed in provinceDataRef and flash a redundant load. Only react to ACTUAL
    // param changes (period/scope toggles, preset router.replace).
    if (layerSeededQsRef.current === qs) {
      layerSeededQsRef.current = null;
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
        try {
          const res = await fetch(
            `/api/panorama/${l.id}${params.toString() ? `?${params.toString()}` : ""}`,
            { headers: { accept: "application/json" } },
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
              truncated: body.truncated,
            },
          }));
        } catch {
          setStates((s) => ({
            ...s,
            [l.id]: { ...s[l.id], loading: false },
          }));
        }
      }),
    ).then(() => setLevelVersion((v) => v + 1));
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [asOf, searchParams]);

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
    const out: ActiveLayer[] = [];
    for (const l of PANORAMA_LAYERS) {
      if (!states[l.id]?.active) continue;
      const temporal = isTemporalLayer(l.id);
      const isAggregatedPoint = AGGREGATED_POINT_IDS.has(l.id);
      // Choropleth layers in province mode fill basemap polygons (province cache).
      // Aggregated point layers (F1 density+signal) in province mode also read the
      // province cache — the server returned province-grouped AggregatedPointCells.
      const usesProvinceCache =
        (CHOROPLETH_IDS.has(l.id) || isAggregatedPoint) && level === "province";
      const features = usesProvinceCache
        ? (provinceDataRef.current.get(l.id) ?? EMPTY_FC)
        : scrubbing && temporal
          ? (asOfDataRef.current.get(l.id) ?? EMPTY_FC)
          : (dataRef.current.get(l.id) ?? EMPTY_FC);

      // Resolve the point render mode (F1 Panorama v2):
      //   - density+signal → "graduated" (per-unit circles, no clustering)
      //   - reference (refugios/decomisos) → "reference" (discrete pins + clustering)
      //   - choropleth layers → renderMode omitted (handled by geomType path)
      const renderMode: PointRenderMode | undefined =
        l.geomType === "point" ? (isAggregatedPoint ? "graduated" : "reference") : undefined;

      out.push({
        id: l.id,
        color: l.color,
        label: l.label,
        geomType: l.geomType,
        renderMode,
        features,
        // Choropleth layers + aggregated point layers carry the active aggregation
        // level so the map can use it for popup labeling (e.g. "province" means
        // the feature represents a whole province). Reference layers omit it.
        level: l.geomType === "choropleth" || isAggregatedPoint ? level : undefined,
        // Non-temporal layers can't be reproduced in time — mute them while scrubbing.
        dimmed: scrubbing && !temporal,
        // F5: thread data-type taxonomy + compliance target from the registry so
        // the map can choose divergent vs sequential choropleth rendering.
        dataType: l.dataType,
        complianceTarget: l.complianceTarget,
      });
    }
    return out;
    // asOfVersion + scrubbing + level + levelVersion are intentional triggers.
  }, [states, scrubbing, asOfVersion, level, levelVersion]);

  // Fetch a temporal layer's AS-OF features into the as-of cache (used when a
  // layer is toggled on mid-scrub, so it paints at the current instant, not live).
  const fetchAsOfFor = useCallback(
    async (id: LayerId, at: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("asOf", at.toISOString());
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
      try {
        const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return null;
        const body = (await res.json()) as ApiResponse;
        if (lvl === "province") provinceDataRef.current.set(id, body.features);
        else dataRef.current.set(id, body.features);
        return body;
      } catch {
        return null;
      }
    },
    [searchParams],
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
          const body = await fetchChoroplethAt(l.id, next);
          setStates((s) => ({
            ...s,
            [l.id]: {
              ...s[l.id],
              loading: false,
              count: body?.features.features.length ?? s[l.id].count,
              suppressedCount: body?.suppressedCount ?? 0,
              truncated: body?.truncated ?? false,
            },
          }));
        }),
      ).then(() => setLevelVersion((v) => v + 1));
    },
    [fetchChoroplethAt],
  );

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
      const compat = checkCompatibility(activeIds, id, PANORAMA_LAYERS);
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
            const nextActive = activeIds.concat(id);
            const base = {
              ...s,
              [id]: { ...s[id], active: true, loading: false, count: fc.features.length },
            };
            return applyHintsAfterActivate(base, nextActive);
          });
          setLevelVersion((v) => v + 1);
          return;
        }
        setStates((s) => ({ ...s, [id]: { ...s[id], active: true, loading: true } }));
        const body = await fetchChoroplethAt(id, "province");
        setStates((s) => {
          const nextActive = activeIds.concat(id);
          const layerState: LayerPanelState = body
            ? {
                active: true,
                loading: false,
                count: body.features.features.length,
                suppressedCount: body.suppressedCount,
                truncated: body.truncated,
              }
            : { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false };
          const base = { ...s, [id]: layerState };
          return applyHintsAfterActivate(base, body ? nextActive : activeIds);
        });
        setLevelVersion((v) => v + 1);
        return;
      }

      // If we already have data cached (e.g. the default layer), just re-activate.
      if (dataRef.current.has(id)) {
        const fc = dataRef.current.get(id) ?? EMPTY_FC;
        setStates((s) => {
          const nextActive = activeIds.concat(id);
          const base = {
            ...s,
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
        const qs = params.toString();
        const res = await fetch(`/api/panorama/${id}${qs ? `?${qs}` : ""}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        dataRef.current.set(id, body.features);
        setStates((s) => {
          const nextActive = activeIds.concat(id);
          const base = {
            ...s,
            [id]: {
              active: true,
              loading: false,
              count: body.features.features.length,
              suppressedCount: body.suppressedCount,
              truncated: body.truncated,
            },
          };
          return applyHintsAfterActivate(base, nextActive);
        });
        // Mid-scrub: also resolve this temporal layer's as-of view.
        if (asOf !== null && isTemporalLayer(id)) {
          void fetchAsOfFor(id, asOf);
        }
      } catch {
        // On failure, leave the layer off and clear loading; no silent half-state.
        dataRef.current.delete(id);
        setStates((s) => ({
          ...s,
          [id]: { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false },
        }));
      }
    },
    [searchParams, states, asOf, fetchAsOfFor, fetchChoroplethAt, computeHints],
  );

  // F3: active preset — null when the operator is in manual "modo avanzado".
  const [activePresetId, setActivePresetId] = useState<PresetId | null>(null);

  /**
   * F3: Activate a preset.
   *
   * W2 fix: previously this called window.history.pushState then immediately
   * awaited onToggle for each preset layer. Those fetches closed over the OLD
   * searchParams (before the pushState re-render), so the period was wrong.
   * Then the [searchParams] effect fired (triggered by pushState), cleared the
   * cache entries for aggregated-point layers, blanking the map.
   *
   * Correct ordering:
   * 1. Deactivate all currently active layers + clear all caches.
   * 2. Set level + mark the preset's layers active (loading=true) in state —
   *    no fetch here.
   * 3. Call router.replace with the new period — this triggers the
   *    [searchParams] effect, which clears period-sensitive caches (already
   *    empty) and then refetches the NOW-ACTIVE layers at the CORRECT period.
   *    The effect reads the layers from statesRef (which already has the preset
   *    layers marked active), so the refetch picks up exactly the right set.
   * 4. Record the preset id for the PresetPanel highlight.
   */
  const onPreset = useCallback(
    (id: PresetId) => {
      const preset = getPreset(id);
      if (!preset) return;

      // Clear all caches — preset always starts fresh.
      dataRef.current.clear();
      provinceDataRef.current.clear();
      asOfDataRef.current.clear();

      // Switch aggregation level immediately so statesRef and the refetch in the
      // [searchParams] effect both see the correct level.
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

      // Replace the URL with the preset period. This triggers the [searchParams]
      // effect, which (W2 fix) now also refetches the active period-sensitive
      // layers at the new params — picking them up from statesRef.
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("period", preset.periodPreset);
      router.replace(`?${nextParams.toString()}`);
    },
    [searchParams, router],
  );

  // Whether any aggregation-axis-sensitive layer is active (choropleth or
  // density/signal point layers). The toggle hints when it has no current effect
  // (all active layers are reference pins).
  const anyChoroplethActive = useMemo(
    () => [...CHOROPLETH_LAYERS, ...AGGREGATED_POINT_LAYERS].some((l) => states[l.id]?.active),
    [states],
  );

  const mapLabel = useMemo(() => {
    const names = activeLayers.map((l) => l.label);
    return names.length > 0 ? `Mapa: ${names.join(", ")}` : "Mapa situacional";
  }, [activeLayers]);

  const onScrub = useCallback((next: Date | null) => setAsOf(next), []);

  // A1 PR-7: autozoom — derive the current jurisdiction selection from
  // searchParams (set by JurisdictionSwitcher via router.replace).
  // The province code is an ISO 3166-2:AR string (e.g. "AR-X"); the locality
  // is identified by its slug. The locality centroid comes from the server-
  // preloaded localityCentroids map (keyed by slug), so no client-side DB
  // call is needed.
  const selectedProvinceCode = searchParams.get("province") ?? null;
  const selectedLocalitySlug = searchParams.get("locality") ?? null;
  const selectedLocalityCenter: [number, number] | null =
    selectedLocalitySlug !== null ? (localityCentroids[selectedLocalitySlug] ?? null) : null;

  return (
    <div className="space-y-4">
      {/* KPIs stay LIVE during a scrub (the dashboard metrics are not forked by
          asOf in v1). The scrubber note states this so the operator isn't misled. */}
      <PanoramaKpiStrip kpis={kpis} />
      <TimeScrubber since={since} until={until} onChange={onScrub} />
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <SituationalMapDynamic
          layers={activeLayers}
          label={mapLabel}
          onFeatureClick={onFeatureClick}
          initialBounds={initialBounds}
          selectedProvinceCode={selectedProvinceCode}
          selectedLocalityCenter={selectedLocalityCenter}
        />
        <div className="space-y-3">
          <PresetPanel
            presets={PANORAMA_PRESETS}
            activePresetId={activePresetId}
            onPreset={onPreset}
          />
          <AggregationToggle
            level={level}
            onChange={onLevelChange}
            relevant={anyChoroplethActive}
          />
          <LayerPanel states={states} onToggle={onToggle} scrubbing={scrubbing} />
        </div>
      </div>
      <DetailDrawer selected={selected} onClose={closeDrawer} />
    </div>
  );
}
