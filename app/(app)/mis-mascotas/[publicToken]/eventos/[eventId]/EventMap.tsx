"use client";

// MapLibre + OpenStreetMap tile renderer for event detail. Loaded via
// next/dynamic from the server page (Next 15 forbids `ssr:false` in server
// components). Because the heavy `maplibre-gl` runtime is imported inside
// the useEffect below, it never participates in SSR; the server-rendered
// output is just the loading skeleton from the dynamic() wrapper, and the
// JS chunk is only fetched on the client when this component mounts. The
// event detail page itself renders the rest of its content without JS.

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lng: number;
};

export default function EventMap({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      // Dynamic import so MapLibre only loads at view time. The CSS is already
      // included by the static `import` above (Next/Webpack hoists side-effects).
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        // Free, no-token OSM raster style. Suffices for v1 — when we add radius
        // queries we can swap to a vector style without changing this file.
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [lng, lat],
        zoom: 14,
        attributionControl: { compact: true },
      });
      new maplibregl.Marker({ color: "#dc2626" }).setLngLat([lng, lat]).addTo(map);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
      aria-label={`Mapa con marcador en latitud ${lat}, longitud ${lng}`}
    />
  );
}
