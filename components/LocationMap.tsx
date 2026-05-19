"use client";

// MapLibre + OpenStreetMap tile renderer. Loaded via next/dynamic from
// server pages (Next 15 forbids `ssr:false` in server components). Because
// the heavy `maplibre-gl` runtime is imported inside the useEffect below,
// it never participates in SSR; the server-rendered output is just the
// loading skeleton from the dynamic() wrapper, and the JS chunk is only
// fetched on the client when this component mounts.
//
// Consumed by:
//   - app/(app)/mis-mascotas/[publicToken]/eventos/[eventId] — pet event detail
//   - app/(app)/denuncias/[id]                                — welfare report authed
//   - app/denuncias/codigo/[code]                             — welfare report anon

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lng: number;
};

export default function LocationMap({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
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
