"use client";

// use-asof-frame — the temporal FRAME pipeline: fetch every active temporal
// layer at one as-of instant, and report honestly when a frame did not fully
// land.
//
// Extracted from PanoramaConsole (perf review 2026-07-25). It is the first slice
// of the `usePanoramaData` seam that review proposed: the console is a
// 5100-line component in which every fetch/cache/cancellation defect looked
// locally reasonable precisely because nobody could hold the whole machine in
// their head. Frame acquisition is the most self-contained piece of it, so it
// moves first.
//
// TWO defects are fixed here by construction, not by care:
//
//  1. The effect keys on the as-of INSTANT (a string), never on the `asOf` Date
//     OBJECT. TimeScrubber re-mints that Date from a useMemo, so an unrelated
//     re-render produced a NEW object at the SAME instant and re-fired the
//     whole fan-out — measured at exactly 2× the necessary traffic during
//     playback. The KPI path already keyed on a string; this one did not.
//  2. A non-ok response is REPORTED rather than swallowed. It used to `return`
//     silently while the version counter still bumped, so the map repainted the
//     previous frame's features while the caption advanced to the new date —
//     frame N's label over frame M's data, which invariant 3 exists to prevent.

import { useEffect, useState } from "react";

import { isAbortError } from "@/components/panorama/panorama-console-helpers";
import type { ApiResponse } from "@/components/panorama/panorama-console-helpers";
import {
  PANORAMA_LAYERS,
  isAggregatedPointLayer,
  isTemporalLayer,
} from "@/src/modules/panorama/domain/layers";
import type {
  AggregationLevel,
  FeatureCollection,
  LayerId,
} from "@/src/modules/panorama/domain/types";

/** What the CURRENT frame failed to load. Null once every layer has landed. */
export type StaleFrame = { layers: string[]; rateLimited: boolean };

type LayerOutcome = { id: LayerId; failed: boolean; rateLimited: boolean };

export function useAsOfFrame(input: {
  /** The as-of instant as an ISO string, or null at the live edge. */
  asOfIso: string | null;
  /** Active scope/period query string the frame inherits. */
  baseQs: string;
  timeBasis: string;
  level: AggregationLevel;
  /** Which layers are currently active (read live — a ref, not a dep). */
  activeLayerIds: () => LayerId[];
  /** Destination cache for the fetched frame. */
  asOfData: Map<LayerId, FeatureCollection>;
  signalFor: (key: string) => AbortSignal;
  dropCubeStamp: () => void;
  /** Bumped once the frame settles, so the map repaints. */
  onFrameSettled: () => void;
}): StaleFrame | null {
  const {
    asOfIso,
    baseQs,
    timeBasis,
    level,
    activeLayerIds,
    asOfData,
    signalFor,
    dropCubeStamp,
    onFrameSettled,
  } = input;

  const [staleFrame, setStaleFrame] = useState<StaleFrame | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeLayerIds and onFrameSettled are read live at run time by design — including them would re-fire the fan-out on every parent render, which is the bug this hook exists to fix.
  useEffect(() => {
    if (asOfIso === null) {
      // Back to live — repaint from the live cache, which is never partial.
      setStaleFrame(null);
      onFrameSettled();
      return;
    }
    // The frame must be fetched at the SAME aggregation axis it will render at,
    // or a province-framed map reads locality features and the scrubber silently
    // paints nothing.
    const currentLevel = level;
    const active = activeLayerIds().filter((id) => isTemporalLayer(id));
    if (active.length === 0) {
      setStaleFrame(null);
      onFrameSettled();
      return;
    }

    let cancelled = false;
    Promise.all(
      active.map(async (id): Promise<LayerOutcome> => {
        const params = new URLSearchParams(baseQs);
        params.set("asOf", asOfIso);
        if (currentLevel === "province") params.set("level", "province");
        else if (isAggregatedPointLayer(id)) params.set("level", "locality");
        if (timeBasis === "transaction") params.set("basis", "transaction");
        try {
          // Keyed abort: a rapid scrub supersedes its own prior request for this
          // layer instead of racing it into the cache out of order.
          dropCubeStamp();
          const res = await fetch(`/api/panorama/${id}?${params.toString()}`, {
            headers: { accept: "application/json" },
            signal: signalFor(`${id}:asOf`),
          });
          if (!res.ok) {
            // Keep the last-known features (a blank map is worse) but REPORT it.
            return { id, failed: true, rateLimited: res.status === 429 };
          }
          const body = (await res.json()) as ApiResponse;
          asOfData.set(id, body.features);
          return { id, failed: false, rateLimited: false };
        } catch (err) {
          // Superseded — the newer request owns this layer and reports for it.
          if (isAbortError(err)) return { id, failed: false, rateLimited: false };
          return { id, failed: true, rateLimited: false };
        }
      }),
    ).then((outcomes) => {
      if (cancelled) return;
      const failed = outcomes.filter((o) => o.failed);
      setStaleFrame(
        failed.length === 0
          ? null
          : {
              layers: failed.map((o) => PANORAMA_LAYERS.find((l) => l.id === o.id)?.label ?? o.id),
              rateLimited: failed.some((o) => o.rateLimited),
            },
      );
      onFrameSettled();
    });
    return () => {
      cancelled = true;
    };
  }, [asOfIso, baseQs, timeBasis, level, signalFor, dropCubeStamp, asOfData]);

  return staleFrame;
}
