"use client";

// Interactive MapLibre + OpenStreetMap picker. Click anywhere on the map to
// place (or move) a marker; the parent receives `{ lat, lng }` via onChange.
//
// Companion to EventMap (which is read-only display). Both share the
// maplibre-gl CSS side-effect; loading either pulls the CSS chunk into the
// shared stylesheet. The runtime is dynamic-imported inside useEffect so
// neither component blocks SSR.

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { useEffect, useRef } from "react";

// Default to Buenos Aires city center when the parent hasn't given us a
// starting point. Picked over CABA's exact centroid because it's more
// recognizable to Argentine users and centers the map on the most populated
// jurisdiction.
const DEFAULT_CENTER = { lat: -34.6083, lng: -58.3712 };
const DEFAULT_ZOOM = 11;
const PINNED_ZOOM = 14;

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number }) => void;
};

export default function LocationPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  // Latest onChange held in a ref so we don't tear the map down every time
  // the parent re-renders with a new closure identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // `latestValueRef` is updated on every render so the init IIFE — which
  // resolves asynchronously after the maplibre import — can read the most
  // recent parent state when it finally runs. Without this, a user who taps
  // "Usar mi ubicación" between mount and the import settling would have
  // their pin silently dropped (the sync effect's `if (!map) return` guard
  // would fire early, and `[value]` wouldn't change again afterwards).
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  // Init: build the map once, dispose on unmount.
  useEffect(() => {
    let cancelled = false;
    let mapInstance: MapLibreMap | null = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      // Read the LATEST value at this moment — the parent may have called
      // setPoint while the import was resolving (e.g. via "Usar mi ubicación"
      // resolving faster than the maplibre chunk fetch).
      const initial = latestValueRef.current;
      const center = initial ?? DEFAULT_CENTER;
      mapInstance = new maplibregl.Map({
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
        center: [center.lng, center.lat],
        zoom: initial ? PINNED_ZOOM : DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });
      mapRef.current = mapInstance;

      function attachDragListener(marker: MapLibreMarker) {
        marker.on("dragend", () => {
          const { lng, lat } = marker.getLngLat();
          onChangeRef.current({ lat, lng });
        });
      }

      if (initial) {
        markerRef.current = new maplibregl.Marker({ color: "#dc2626", draggable: true })
          .setLngLat([initial.lng, initial.lat])
          .addTo(mapInstance);
        attachDragListener(markerRef.current);
      }

      mapInstance.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ color: "#dc2626", draggable: true })
            .setLngLat([lng, lat])
            .addTo(mapInstance as MapLibreMap);
          attachDragListener(markerRef.current);
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
        onChangeRef.current({ lat, lng });
      });
    })();
    return () => {
      cancelled = true;
      mapInstance?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync: when the parent's value changes externally (e.g. "Usar mi ubicación"
  // button below the map fills the inputs), move the marker to match.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (!markerRef.current) {
        const marker = new maplibregl.Marker({ color: "#dc2626", draggable: true })
          .setLngLat([value.lng, value.lat])
          .addTo(map);
        marker.on("dragend", () => {
          const { lng, lat } = marker.getLngLat();
          onChangeRef.current({ lat, lng });
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat([value.lng, value.lat]);
      }
      map.flyTo({ center: [value.lng, value.lat], zoom: PINNED_ZOOM, duration: 600 });
    })();
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 rounded-lg overflow-hidden border border-gob-border  cursor-crosshair"
      aria-label="Mapa. Tocá para marcar una ubicación."
    />
  );
}
