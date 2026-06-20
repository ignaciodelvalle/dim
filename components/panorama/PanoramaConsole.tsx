"use client";

// PanoramaConsole — the client orchestrator for the situational map.
//
// Owns the per-layer runtime state, fetches /api/panorama/[layer] on toggle
// (threading the active scope/period searchParams so client toggles re-fetch
// with the same filters the server used), and feeds the active layers to the
// (dynamic) SituationalMap. Perdidas is mounted server-side and seeded here as
// the default-on layer, so its features paint on first render without a fetch.

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DetailDrawer, type SelectedFeature } from "@/components/panorama/DetailDrawer";
import { LayerPanel, type LayerPanelState } from "@/components/panorama/LayerPanel";
import { PanoramaKpiStrip } from "@/components/panorama/PanoramaKpiStrip";
import type { ActiveLayer } from "@/components/panorama/SituationalMap";
import { SituationalMapDynamic } from "@/components/panorama/SituationalMapDynamic";
import { TimeScrubber } from "@/components/panorama/TimeScrubber";
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";
import { PANORAMA_LAYERS, getLayer, isTemporalLayer } from "@/src/modules/panorama/domain/layers";
import type { FeatureCollection, LayerId } from "@/src/modules/panorama/domain/types";

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
};

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
};

export function PanoramaConsole({
  defaultLayerId,
  defaultFeatures,
  defaultTruncated = false,
  defaultSuppressedCount = 0,
  initialKpis,
}: Props) {
  const searchParams = useSearchParams();
  // Feature data per layer (the default is seeded; others fetched on toggle).
  // This is the LIVE cache (asOf=null). The temporal as-of cache is separate.
  const dataRef = useRef<Map<LayerId, FeatureCollection>>(
    new Map([[defaultLayerId, defaultFeatures]]),
  );
  // As-of feature cache (F4): per (layer, asOf-iso) the features the layer had at
  // that instant. Refreshed when the scrubber moves; cleared when the period/scope
  // changes (a new window invalidates the axis). Live layers stay in dataRef.
  const asOfDataRef = useRef<Map<LayerId, FeatureCollection>>(new Map());

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
        period: searchParams.get("period") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      }),
    [searchParams],
  );

  // Current as-of upper bound. null = live (parked at "ahora").
  const [asOf, setAsOf] = useState<Date | null>(null);
  const scrubbing = asOf !== null;

  // A new period/scope window invalidates the as-of cache and parks at live.
  // biome-ignore lint/correctness/useExhaustiveDependencies: qs identity is the intended trigger.
  useEffect(() => {
    asOfDataRef.current.clear();
    setAsOf(null);
  }, [searchParams]);

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
  const onFeatureClick = useCallback((layerId: string, properties: Record<string, unknown>) => {
    const reg = getLayer(layerId as LayerId);
    if (!reg) return;
    setSelected({ layerId: reg.id, layerLabel: reg.label, properties });
  }, []);
  const closeDrawer = useCallback(() => setSelected(null), []);

  // Build the active-layers array for the map from current state + cached data.
  // Under a scrub (asOf !== null): temporal layers paint their AS-OF features;
  // non-temporal layers are DIMMED (current-state data shown muted, never as if
  // it were as-of-t). asOfVersion forces a recompute after as-of fetches resolve.
  const activeLayers = useMemo<ActiveLayer[]>(() => {
    // The as-of features live in a ref (not React state), so `asOfVersion` is the
    // explicit recompute trigger bumped after each as-of fetch resolves. Reading
    // it here keeps the dependency honest (no unused-dep lint).
    void asOfVersion;
    const out: ActiveLayer[] = [];
    for (const l of PANORAMA_LAYERS) {
      if (!states[l.id]?.active) continue;
      const temporal = isTemporalLayer(l.id);
      const features =
        scrubbing && temporal
          ? (asOfDataRef.current.get(l.id) ?? EMPTY_FC)
          : (dataRef.current.get(l.id) ?? EMPTY_FC);
      out.push({
        id: l.id,
        color: l.color,
        label: l.label,
        geomType: l.geomType,
        features,
        // Non-temporal layers can't be reproduced in time — mute them while scrubbing.
        dimmed: scrubbing && !temporal,
      });
    }
    return out;
    // asOfVersion + scrubbing are intentional triggers (caches are refs).
  }, [states, scrubbing, asOfVersion]);

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

  const onToggle = useCallback(
    async (id: LayerId) => {
      const wasActive = states[id]?.active ?? false;
      if (wasActive) {
        // Turn off — keep cached data so a re-toggle is instant.
        setStates((s) => ({ ...s, [id]: { ...s[id], active: false } }));
        return;
      }

      // If we already have data cached (e.g. the default layer), just re-activate.
      if (dataRef.current.has(id)) {
        const fc = dataRef.current.get(id) ?? EMPTY_FC;
        setStates((s) => ({
          ...s,
          [id]: { ...s[id], active: true, loading: false, count: fc.features.length },
        }));
        // Mid-scrub: also resolve this temporal layer's as-of view if missing.
        if (asOf !== null && isTemporalLayer(id) && !asOfDataRef.current.has(id)) {
          void fetchAsOfFor(id, asOf);
        }
        return;
      }

      // Fetch the layer, threading the active scope/period searchParams so the
      // server scopes it identically to the page-load render.
      setStates((s) => ({ ...s, [id]: { ...s[id], active: true, loading: true } }));
      try {
        const qs = searchParams.toString();
        const res = await fetch(`/api/panorama/${id}${qs ? `?${qs}` : ""}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        dataRef.current.set(id, body.features);
        setStates((s) => ({
          ...s,
          [id]: {
            active: true,
            loading: false,
            count: body.features.features.length,
            suppressedCount: body.suppressedCount,
            truncated: body.truncated,
          },
        }));
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
    [searchParams, states, asOf, fetchAsOfFor],
  );

  const mapLabel = useMemo(() => {
    const names = activeLayers.map((l) => l.label);
    return names.length > 0 ? `Mapa: ${names.join(", ")}` : "Mapa situacional";
  }, [activeLayers]);

  const onScrub = useCallback((next: Date | null) => setAsOf(next), []);

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
        />
        <LayerPanel states={states} onToggle={onToggle} scrubbing={scrubbing} />
      </div>
      <DetailDrawer selected={selected} onClose={closeDrawer} />
    </div>
  );
}
