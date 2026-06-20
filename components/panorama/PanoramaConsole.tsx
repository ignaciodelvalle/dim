"use client";

// PanoramaConsole — the client orchestrator for the situational map.
//
// Owns the per-layer runtime state, fetches /api/panorama/[layer] on toggle
// (threading the active scope/period searchParams so client toggles re-fetch
// with the same filters the server used), and feeds the active layers to the
// (dynamic) SituationalMap. Perdidas is mounted server-side and seeded here as
// the default-on layer, so its features paint on first render without a fetch.

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { LayerPanel, type LayerPanelState } from "@/components/panorama/LayerPanel";
import type { ActiveLayer } from "@/components/panorama/SituationalMap";
import { SituationalMapDynamic } from "@/components/panorama/SituationalMapDynamic";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
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
};

export function PanoramaConsole({
  defaultLayerId,
  defaultFeatures,
  defaultTruncated = false,
  defaultSuppressedCount = 0,
}: Props) {
  const searchParams = useSearchParams();
  // Feature data per layer (the default is seeded; others fetched on toggle).
  const dataRef = useRef<Map<LayerId, FeatureCollection>>(
    new Map([[defaultLayerId, defaultFeatures]]),
  );

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

  // Build the active-layers array for the map from current state + cached data.
  const activeLayers = useMemo<ActiveLayer[]>(() => {
    const out: ActiveLayer[] = [];
    for (const l of PANORAMA_LAYERS) {
      if (!states[l.id]?.active) continue;
      out.push({
        id: l.id,
        color: l.color,
        label: l.label,
        geomType: l.geomType,
        features: dataRef.current.get(l.id) ?? EMPTY_FC,
      });
    }
    return out;
  }, [states]);

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
      } catch {
        // On failure, leave the layer off and clear loading; no silent half-state.
        dataRef.current.delete(id);
        setStates((s) => ({
          ...s,
          [id]: { active: false, loading: false, count: 0, suppressedCount: 0, truncated: false },
        }));
      }
    },
    [searchParams, states],
  );

  const mapLabel = useMemo(() => {
    const names = activeLayers.map((l) => l.label);
    return names.length > 0 ? `Mapa: ${names.join(", ")}` : "Mapa situacional";
  }, [activeLayers]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <SituationalMapDynamic layers={activeLayers} label={mapLabel} />
      <LayerPanel states={states} onToggle={onToggle} />
    </div>
  );
}
