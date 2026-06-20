"use client";

import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

// maplibre-gl ships its own CSS (popups, controls, canvas). It is imported
// per-map-component in this repo (see LocationMap/LocationPicker), not globally.
import "maplibre-gl/dist/maplibre-gl.css";

// ---------------------------------------------------------------------------
// SituationalMap — the Panorama console's geospatial canvas.
//
// PRIVACY (spec §13.4): the basemap is built ENTIRELY from a local GeoJSON
// asset (public/geo/ar-provinces.geojson). There is NO external tile/glyph
// provider — a government situational map must not beacon the operator's
// viewport or the plotted locations to a third party. This is why we do NOT
// reuse components/charts/MapChoropleth's OpenStreetMap raster style.
//
// Because we ship no glyph server, map layers carry NO on-canvas text; counts
// and details are surfaced via HTML popups (same approach as MapChoropleth).
//
// Slice 1 renders a single point layer (perdidas), clustered natively by
// MapLibre. Additional layers + the LayerPanel arrive in Slice 2.
// ---------------------------------------------------------------------------

type Props = {
  /** Pre-scoped point features for the active layer (resolved server-side). */
  features: FeatureCollection;
  /** Point/cluster color (hex) from the layer registry. */
  color: string;
  /** Accessible name for the map region. */
  label: string;
  /** Map height in px. */
  height?: number;
};

// Continental Argentina centroid + a zoom that frames the mainland.
const AR_CENTER: [number, number] = [-63.6167, -40.0];
const AR_ZOOM = 3.4;
const BASEMAP_URL = "/geo/ar-provinces.geojson";

// Dark government-console palette (canvas / land / borders).
const COLOR_CANVAS = "#0b1020";
const COLOR_LAND = "#161d33";
const COLOR_BORDER = "#2b3658";

/** Compute a [[minLng,minLat],[maxLng,maxLat]] bbox over point features. */
function pointsBbox(features: FeatureCollection): [[number, number], [number, number]] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const f of features.features) {
    if (!f.geometry) continue;
    const [lng, lat] = f.geometry.coordinates;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng) || maxLng <= minLng || maxLat <= minLat) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function SituationalMap({ features, color, label, height = 560 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;

      // Self-contained style: solid dark background, NO external sources.
      const style: maplibregl.StyleSpecification = {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": COLOR_CANVAS } }],
      };

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: AR_CENTER,
        zoom: AR_ZOOM,
        attributionControl: false,
        dragRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const pointData = features as unknown as GeoJSON.FeatureCollection;

      map.on("load", async () => {
        if (cancelled) return;

        // --- Local basemap: Argentine province polygons (no external tiles) ---
        try {
          const basemap = await fetch(BASEMAP_URL).then((r) => r.json());
          if (cancelled) return;
          map.addSource("ar-provinces", { type: "geojson", data: basemap });
          map.addLayer({
            id: "ar-prov-fill",
            type: "fill",
            source: "ar-provinces",
            paint: { "fill-color": COLOR_LAND, "fill-opacity": 1 },
          });
          map.addLayer({
            id: "ar-prov-line",
            type: "line",
            source: "ar-provinces",
            paint: { "line-color": COLOR_BORDER, "line-width": 0.8 },
          });
        } catch {
          // Basemap unavailable — points still render over the dark canvas.
        }

        // --- Active point layer (clustered) ---
        map.addSource("layer-points", {
          type: "geojson",
          data: pointData,
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 12,
        });

        // Cluster bubbles — radius steps with count (no on-canvas text: privacy).
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "layer-points",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": color,
            "circle-opacity": 0.8,
            "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24, 500, 32],
            "circle-stroke-color": COLOR_CANVAS,
            "circle-stroke-width": 2,
          },
        });

        // Unclustered individual points.
        map.addLayer({
          id: "points",
          type: "circle",
          source: "layer-points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": color,
            "circle-radius": 6,
            "circle-stroke-color": COLOR_CANVAS,
            "circle-stroke-width": 1.5,
          },
        });

        // Fit to the data if we have any; otherwise stay framed on Argentina.
        const bbox = pointsBbox(features);
        if (bbox) {
          map.fitBounds(bbox, { padding: 56, animate: false, maxZoom: 11 });
        }

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: "panorama-popup",
        });

        // Cluster: hover shows the count; click zooms to expand.
        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("mousemove", "clusters", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const n = (f.properties as { point_count?: number }).point_count ?? 0;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-size:12px;padding:2px 6px"><strong>${n}</strong> en esta zona<br/><em style="font-size:11px;color:#94a3b8">Clic para acercar</em></div>`,
            )
            .addTo(map);
        });
        map.on("click", "clusters", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const clusterId = (f.properties as { cluster_id?: number }).cluster_id;
          const src = map.getSource("layer-points") as maplibregl.GeoJSONSource | undefined;
          if (clusterId == null || !src) return;
          src.getClusterExpansionZoom(clusterId).then((zoom) => {
            const geom = f.geometry as GeoJSON.Point;
            map.easeTo({ center: geom.coordinates as [number, number], zoom });
          });
        });

        // Point: hover shows the record summary.
        map.on("mouseenter", "points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "points", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("mousemove", "points", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as {
            name?: string;
            species?: string;
            status?: string;
          };
          const name = p.name ?? "—";
          const meta = [p.species, p.status].filter(Boolean).join(" · ");
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-size:12px;padding:2px 6px"><strong>${name}</strong>${meta ? `<br/><span style="color:#94a3b8">${meta}</span>` : ""}</div>`,
            )
            .addTo(map);
        });
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [features, color]);

  const count = features.features.length;

  return (
    <div className="relative w-full" style={{ height }}>
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-[8px] border border-ln-op-line"
        style={{ background: COLOR_CANVAS }}
        role="img"
        aria-label={`${label}. ${count} ${count === 1 ? "punto" : "puntos"} en la vista.`}
      />
      {count === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-[6px] bg-black/40 px-4 py-2 text-[13px] text-white/80">
            Sin datos para esta capa en tu cobertura.
          </p>
        </div>
      )}
      {/* a11y / no-JS fallback: the count is announced via aria-label above; a
          full data table per point arrives with the detail drawer in Slice 3. */}
    </div>
  );
}
