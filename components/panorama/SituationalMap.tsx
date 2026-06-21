"use client";

import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

// maplibre-gl ships its own CSS (popups, controls, canvas). It is imported
// per-map-component in this repo (see LocationMap/LocationPicker), not globally.
import "maplibre-gl/dist/maplibre-gl.css";
import { COLOR_SUPPRESSED } from "@/lib/viz-scales";

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
// Slice 2 renders MULTIPLE simultaneous layers:
//   - point layers (clustered natively by MapLibre), and
//   - graduated-symbol choropleth layers (circle radius + color by value;
//     suppressed cells muted via COLOR_SUPPRESSED).
// Layers are added/removed dynamically as the LayerPanel toggles them. The map
// keeps a registry of mounted layer ids and reconciles against the prop on each
// render. Perdidas is the default-on layer (mounted by the parent on load).
// ---------------------------------------------------------------------------

/** One active layer the map must render. `geomType` decides point-cluster vs.
 * graduated-symbol rendering. */
export type ActiveLayer = {
  id: string;
  color: string;
  label: string;
  geomType: "point" | "choropleth";
  features: FeatureCollection;
  /** F4: muted while a time scrub is active because the layer has no time
   * dimension (refugios) or is a current-state rollup (cobertura/mortalidad) —
   * it shows live data, not as-of-t, so it is rendered dimmed (not as if as-of). */
  dimmed?: boolean;
};

type Props = {
  /** The set of currently-active layers (perdidas default-on). */
  layers: ActiveLayer[];
  /** Accessible name for the map region. */
  label: string;
  /** Map height in px. */
  height?: number;
  /**
   * Fired when an INDIVIDUAL feature is clicked (not a cluster — clusters zoom).
   * Bubbles the layer id + the feature's GeoJSON properties up to the console,
   * which opens the DetailDrawer. Choropleth cells and points both emit this.
   */
  onFeatureClick?: (layerId: string, properties: Record<string, unknown>) => void;
};

// Continental Argentina centroid + a zoom that frames the mainland.
const AR_CENTER: [number, number] = [-63.6167, -40.0];
const AR_ZOOM = 3.4;
const BASEMAP_URL = "/geo/ar-provinces.geojson";

// Dark government-console palette (canvas / land / borders).
const COLOR_CANVAS = "#0b1020";
const COLOR_LAND = "#161d33";
const COLOR_BORDER = "#2b3658";

// Per-layer maplibre object ids are namespaced by layer id so multiple layers
// coexist without collision.
const srcId = (id: string) => `pano-src-${id}`;
const clusterLayerId = (id: string) => `pano-cluster-${id}`;
const pointLayerId = (id: string) => `pano-point-${id}`;
const choroLayerId = (id: string) => `pano-choro-${id}`;

/** Compute a [[minLng,minLat],[maxLng,maxLat]] bbox over many feature sets. */
function layersBbox(layers: ActiveLayer[]): [[number, number], [number, number]] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const layer of layers) {
    for (const f of layer.features.features) {
      if (!f.geometry) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng) || maxLng <= minLng || maxLat <= minLat) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function SituationalMap({ layers, label, height = 560, onFeatureClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mlRef = useRef<typeof maplibregl | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);
  // Track which layer ids are currently mounted on the map so we can reconcile.
  const mountedRef = useRef<Set<string>>(new Set());
  // Keep the latest layers prop accessible inside one-time map handlers.
  const layersRef = useRef<ActiveLayer[]>(layers);
  layersRef.current = layers;
  // Keep the latest click callback accessible inside one-time map handlers.
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;

  // --- One-time map construction (basemap only). ---------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;
      mlRef.current = maplibregl;

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
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "panorama-popup",
      });

      map.on("load", async () => {
        if (cancelled) return;
        // Local basemap: Argentine province polygons (no external tiles).
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
        if (cancelled) return;
        loadedRef.current = true;
        syncLayers();
        const bbox = layersBbox(layersRef.current);
        if (bbox) map.fitBounds(bbox, { padding: 56, animate: false, maxZoom: 11 });
      });
    });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mountedRef.current = new Set();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Build the map ONCE; layer reconciliation happens in the effect below.
  }, []);

  // --- Reconcile layers whenever the prop changes. -------------------------
  // `layers` IS the trigger; syncLayers reads the latest via layersRef, so the
  // ref-read deps are intentionally omitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layers is the intended trigger.
  useEffect(() => {
    if (loadedRef.current) syncLayers();
  }, [layers]);

  // Add/update/remove maplibre sources+layers to match `layersRef.current`.
  function syncLayers() {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    const active = layersRef.current;
    const activeIds = new Set(active.map((l) => l.id));

    // Remove layers no longer active.
    for (const id of mountedRef.current) {
      if (!activeIds.has(id)) {
        removeLayer(map, id);
        mountedRef.current.delete(id);
      }
    }

    // Add or update active layers.
    for (const layer of active) {
      const data = layer.features as unknown as GeoJSON.FeatureCollection;
      const existing = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        if (layer.geomType === "choropleth") {
          addChoroplethLayer(map, layer, data);
        } else {
          addPointLayer(map, layer, data);
        }
        mountedRef.current.add(layer.id);
      }
      // F4: reconcile the dimmed state on every sync (covers toggling dim on a
      // layer that is already mounted). Dimmed layers are muted, not hidden, so
      // the operator still sees the current-state context — never AS-OF-t data.
      applyDim(map, layer);
    }
  }

  function addPointLayer(map: maplibregl.Map, layer: ActiveLayer, data: GeoJSON.FeatureCollection) {
    map.addSource(srcId(layer.id), {
      type: "geojson",
      data,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 12,
    });
    // Cluster bubbles (no on-canvas text: privacy).
    map.addLayer({
      id: clusterLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      filter: ["has", "point_count"],
      paint: {
        "circle-color": layer.color,
        "circle-opacity": 0.8,
        "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24, 500, 32],
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 2,
      },
    });
    // Unclustered points.
    map.addLayer({
      id: pointLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": layer.color,
        "circle-radius": 6,
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wirePointInteractions(map, layer);
  }

  function addChoroplethLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
  ) {
    map.addSource(srcId(layer.id), { type: "geojson", data });
    // Graduated symbol: radius scales with `value`; suppressed cells (value null
    // → coalesced to 0 by maplibre 'get') render muted at a fixed small radius.
    map.addLayer({
      id: choroLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          COLOR_SUPPRESSED,
          layer.color,
        ],
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.45, 0.78],
        "circle-radius": [
          "case",
          ["==", ["get", "suppressed"], true],
          5,
          ["interpolate", ["linear"], ["coalesce", ["get", "value"], 0], 0, 6, 50, 16, 250, 26],
        ],
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wireChoroplethInteractions(map, layer);
  }

  function wirePointInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const cl = clusterLayerId(layer.id);
    const pl = pointLayerId(layer.id);

    map.on("mouseenter", cl, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", cl, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", cl, (e) => {
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
    map.on("click", cl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const clusterId = (f.properties as { cluster_id?: number }).cluster_id;
      const src = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
      if (clusterId == null || !src) return;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        const geom = f.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });
    });

    map.on("mouseenter", pl, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", pl, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(pointPopupHtml(layer, f.properties ?? {}))
        .addTo(map);
    });
    // Clicking an INDIVIDUAL point opens the DetailDrawer (clusters zoom; see above).
    map.on("click", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  function wireChoroplethInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const id = choroLayerId(layer.id);
    map.on("mouseenter", id, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", id, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as {
        locality?: string;
        province?: string;
        value?: number | null;
        suppressed?: boolean;
      };
      const place = [p.locality, p.province].filter(Boolean).join(", ") || "—";
      // Suppressed cells NEVER show a number — privacy (k-anon).
      const valueLine = p.suppressed
        ? `<span style="color:#94a3b8">Suprimido (privacidad)</span>`
        : `<strong>${p.value ?? 0}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${place}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${layer.label}</em></div>`,
        )
        .addTo(map);
    });
    // Clicking a choropleth cell opens the DetailDrawer. Suppressed cells still
    // open — the drawer renders "Suprimido", never the real count (k-anon).
    map.on("click", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  const totalPoints = layers.reduce((sum, l) => sum + l.features.features.length, 0);

  return (
    <div className="relative w-full" style={{ height }}>
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-[8px] border border-ln-op-line"
        style={{ background: COLOR_CANVAS }}
        role="img"
        aria-label={`${label}. ${totalPoints} ${totalPoints === 1 ? "punto" : "puntos"} en la vista.`}
      />
      {totalPoints === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-[6px] bg-black/40 px-4 py-2 text-[13px] text-white/80">
            Sin datos para esta capa en tu cobertura.
          </p>
        </div>
      )}
    </div>
  );
}

// Remove every maplibre object belonging to a layer id.
function removeLayer(map: maplibregl.Map, id: string) {
  for (const lid of [clusterLayerId(id), pointLayerId(id), choroLayerId(id)]) {
    if (map.getLayer(lid)) map.removeLayer(lid);
  }
  if (map.getSource(srcId(id))) map.removeSource(srcId(id));
}

// F4: mute a layer (and re-restore it) by scaling circle-opacity. We never hide
// dimmed layers — the operator keeps the current-state context while scrubbing —
// but the reduced opacity signals "not reproducible in time" on the canvas.
const DIM_OPACITY = 0.18;
function applyDim(map: maplibregl.Map, layer: ActiveLayer) {
  const dim = layer.dimmed === true;
  if (layer.geomType === "choropleth") {
    const cid = choroLayerId(layer.id);
    if (!map.getLayer(cid)) return;
    // Suppressed cells were 0.45, visible 0.78; restore via the original case expr.
    map.setPaintProperty(
      cid,
      "circle-opacity",
      dim
        ? DIM_OPACITY
        : (["case", ["==", ["get", "suppressed"], true], 0.45, 0.78] as unknown as number),
    );
    return;
  }
  const pl = pointLayerId(layer.id);
  const cl = clusterLayerId(layer.id);
  if (map.getLayer(pl)) map.setPaintProperty(pl, "circle-opacity", dim ? DIM_OPACITY : 1);
  if (map.getLayer(cl)) map.setPaintProperty(cl, "circle-opacity", dim ? DIM_OPACITY : 0.8);
}

// Layer-specific point popup copy (es-AR). Coarse layers (denuncias) state the
// marker is a locality centroid, never a precise spot.
function pointPopupHtml(layer: ActiveLayer, props: Record<string, unknown>): string {
  if (layer.id === "denuncias") {
    const place = [props.locality, props.province].filter(Boolean).join(", ") || "Localidad";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${place}</strong><br/><em style="font-size:11px;color:#94a3b8">Ubicación aproximada (centroide de localidad)</em></div>`;
  }
  if (layer.id === "refugios") {
    const name = String(props.name ?? "Refugio");
    const v = props.verified ? " · verificado" : "";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${name}</strong><span style="color:#94a3b8">${v}</span></div>`;
  }
  // Generic: a primary label + a meta line built from common props.
  const primary = String(props.name ?? props.code ?? props.diseaseLabel ?? layer.label);
  const meta = [props.incidentType, props.severity, props.status, props.diseaseCode]
    .filter(Boolean)
    .join(" · ");
  return `<div style="font-size:12px;padding:2px 6px"><strong>${primary}</strong>${meta ? `<br/><span style="color:#94a3b8">${meta}</span>` : ""}</div>`;
}
