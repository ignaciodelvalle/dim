"use client";

// use-choropleth-motion — B1 (map plan): the map's reduced-motion floor.
//
// Extracted from SituationalMap so that file stops growing (it is already past
// its budget in scripts/check-file-size.ts), and so the floor lives in ONE
// named place instead of being an anonymous effect halfway down a 3400-line
// component.
//
// Returns a ref carrying the live preference. The map's paint and camera code
// runs inside imperative maplibre handlers that close over their first render,
// so they read `.current` rather than the reactive value.

import type maplibregl from "maplibre-gl";
import { type RefObject, useEffect, useRef } from "react";

import { fillPaintTransition } from "@/components/panorama/situational-map-config";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/** Mounted choropleth fills, by layer-id convention (province + division). */
const CHOROPLETH_FILL_ID = /^pano-(prov-fill|div-fill)-/;

export function useChoroplethMotion(mapRef: RefObject<maplibregl.Map | null>): RefObject<boolean> {
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // Turning the OS preference ON must stop the animation NOW, not at the next
  // data update — a floor is a promise, not a default. Walks the mounted
  // choropleth fills and re-sets their transitions when the preference flips.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof map.getStyle !== "function") return;
    const transition = fillPaintTransition(reducedMotion);
    for (const styleLayer of map.getStyle()?.layers ?? []) {
      if (styleLayer.type !== "fill") continue;
      if (!CHOROPLETH_FILL_ID.test(styleLayer.id)) continue;
      map.setPaintProperty(styleLayer.id, "fill-color-transition", transition);
      map.setPaintProperty(styleLayer.id, "fill-opacity-transition", transition);
    }
  }, [reducedMotion, mapRef]);

  return reducedMotionRef;
}
