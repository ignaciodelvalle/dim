"use client";

import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { AggregationLevel, FeatureCollection } from "@/src/modules/panorama/domain/types";

// maplibre-gl ships its own CSS (popups, controls, canvas). It is imported
// per-map-component in this repo (see LocationMap/LocationPicker), not globally.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  type ScaleBounds,
  provinceColorExpr,
  provinceDivergentColorExpr,
  provinceValueBounds,
} from "@/components/panorama/province-choropleth-style";
import { escapeHtml } from "@/lib/escape-html";
import { COLOR_NO_DATA, COLOR_SUPPRESSED, RAMP_BLUE } from "@/lib/viz-scales";

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

/**
 * The rendering mode for a point-geometry layer (F1 Panorama v2).
 *
 *  - `"graduated"` — density+signal layers: one NON-clustered circle per
 *    administrative unit, radius scaled by the feature's `count` property.
 *    The toggle axis (province/locality) drives which granularity was used
 *    server-side; the client renders whatever the server sent.
 *  - `"reference"` — individual-entity layers (refugios, decomisos): discrete
 *    pins with MapLibre native clustering. The toggle axis is ignored for these.
 */
export type PointRenderMode = "graduated" | "reference";

/** One active layer the map must render. `geomType` decides point vs choropleth;
 * for point layers, `renderMode` further decides graduated (F1) vs discrete pins. */
export type ActiveLayer = {
  id: string;
  color: string;
  label: string;
  geomType: "point" | "choropleth";
  /**
   * Point-layer rendering mode (F1 Panorama v2). Only set for geomType="point":
   *   - `"graduated"` → density/signal layers: per-unit circles sized by count.
   *   - `"reference"` → reference layers: discrete pins with native MapLibre clustering.
   * Undefined (or ignored) for choropleth layers.
   */
  renderMode?: PointRenderMode;
  features: FeatureCollection;
  /**
   * U5 aggregation axis (choropleth layers only, and graduated point layers).
   * For choropleth: "province" → fill the local ar-provinces polygons by value;
   * "locality" → centroid graduated symbols. For graduated point layers: reflects
   * which grouping the server used (province or locality). Reference layers and
   * choropleth layers leave this following U5 semantics.
   */
  level?: AggregationLevel;
  /** F4: muted while a time scrub is active because the layer has no time
   * dimension (refugios) or is a current-state rollup (cobertura/mortalidad) —
   * it shows live data, not as-of-t, so it is rendered dimmed (not as if as-of). */
  dimmed?: boolean;
  /**
   * F5: the layer's data-type taxonomy from the registry (threaded from
   * PanoramaLayer.dataType). Used to choose the divergent vs sequential
   * choropleth rendering path. Undefined for layers that pre-date F5 or for
   * point layers where dataType drives aggregation, not coloring.
   */
  dataType?: "rate" | "density" | "signal" | "reference";
  /**
   * F5: compliance target for `dataType: "rate"` layers (e.g. 80 for the
   * antirrábica 80% legal goal). When present alongside `dataType === "rate"`,
   * the province choropleth renders as a DIVERGENT scale anchored at this value.
   * Undefined for density/signal/reference layers (sequential coloring).
   */
  complianceTarget?: number;
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
  /**
   * Pre-zoomed bounding box for the map's initial viewport.
   * When provided (govt operators with assigned jurisdictions), the map opens
   * fitted to this bbox instead of the data-extent bbox.
   * Admin (no assigned jurisdictions) leaves this undefined and keeps the
   * national/data-extent fit.
   */
  initialBounds?: [[number, number], [number, number]];
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
// U5 province-choropleth: a fill (+ its hover outline) over the SHARED
// ar-provinces basemap source, colored by a per-layer data-join on the polygon
// `code` property. Namespaced by layer id so two province-choropleths coexist.
const provinceFillLayerId = (id: string) => `pano-prov-fill-${id}`;
const provinceLineLayerId = (id: string) => `pano-prov-line-${id}`;

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

export function SituationalMap({
  layers,
  label,
  height = 560,
  onFeatureClick,
  initialBounds,
}: Props) {
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
  // Capture initialBounds once at mount — it's a stable server-computed value
  // (jurisdiction bbox) that must not change after the map is constructed.
  const initialBoundsRef = useRef(initialBounds);

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
        // Prefer the server-computed jurisdiction bbox (govt) over the
        // data-extent bbox (admin/national). Falls back to the data-extent
        // when no initialBounds was supplied (admin = national view).
        const bbox = initialBoundsRef.current ?? layersBbox(layersRef.current);
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
      // U5: a province-level choropleth fills the SHARED basemap polygons — it
      // has no own GeoJSON source, so it can't be reconciled via getSource. We
      // recompute its data-driven color expression in place on every sync.
      if (layer.geomType === "choropleth" && layer.level === "province") {
        if (mountedRef.current.has(layer.id)) {
          updateProvinceChoroplethLayer(map, layer);
        } else {
          addProvinceChoroplethLayer(map, layer);
          mountedRef.current.add(layer.id);
        }
        applyDim(map, layer);
        continue;
      }
      const existing = map.getSource(srcId(layer.id)) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        if (layer.geomType === "choropleth") {
          addChoroplethLayer(map, layer, data);
        } else if (layer.renderMode === "graduated") {
          // F1: density+signal layers render as per-unit graduated circles (no clustering).
          addGraduatedPointLayer(map, layer, data);
        } else {
          // Reference layers (refugios, decomisos): discrete pins with native clustering.
          addReferencePointLayer(map, layer, data);
        }
        mountedRef.current.add(layer.id);
      }
      // F4: reconcile the dimmed state on every sync (covers toggling dim on a
      // layer that is already mounted). Dimmed layers are muted, not hidden, so
      // the operator still sees the current-state context — never AS-OF-t data.
      applyDim(map, layer);
    }
  }

  /**
   * F1 Panorama v2: graduated circles for density+signal layers.
   *
   * One NON-clustered circle per administrative unit (province or locality).
   * `circle-radius` is a step expression on the feature's `count` property so
   * higher event counts render as larger circles. Suppressed cells (count null
   * → coalesced to 0) render at a fixed small muted radius, same as the
   * choropleth's suppressed-cell treatment.
   *
   * This replaces MapLibre's generic point clustering for these layers so the
   * map shows a STABLE, DETERMINISTIC symbol per unit regardless of zoom level.
   */
  function addGraduatedPointLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
  ) {
    // Non-clustered source — one feature per unit is already the aggregation unit.
    map.addSource(srcId(layer.id), { type: "geojson", data });
    map.addLayer({
      id: pointLayerId(layer.id),
      type: "circle",
      source: srcId(layer.id),
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "suppressed"], true],
          COLOR_SUPPRESSED,
          layer.color,
        ],
        "circle-opacity": ["case", ["==", ["get", "suppressed"], true], 0.45, 0.82],
        // Graduated radius by count. Suppressed cells render at a fixed small
        // radius (coalesce null → 0 then the case catches suppressed before
        // the interpolate). Province-level units carry larger counts so the
        // higher end of the scale is wider.
        "circle-radius": [
          "case",
          ["==", ["get", "suppressed"], true],
          5,
          [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "count"], 0],
            0,
            6,
            10,
            10,
            50,
            16,
            200,
            24,
            500,
            32,
          ],
        ],
        "circle-stroke-color": COLOR_CANVAS,
        "circle-stroke-width": 1.5,
      },
    });
    wireGraduatedPointInteractions(map, layer);
  }

  /**
   * Reference-layer rendering: discrete pins with MapLibre native clustering.
   * Used for refugios and decomisos — each feature represents an individual
   * entity (shelter / expediente) that must not be spatially merged.
   */
  function addReferencePointLayer(
    map: maplibregl.Map,
    layer: ActiveLayer,
    data: GeoJSON.FeatureCollection,
  ) {
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
    wireReferencePointInteractions(map, layer);
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

  // --- U5 province-choropleth: fill the local basemap polygons by value. -----

  // Add a fill (+ hover outline) over the SHARED ar-provinces basemap source.
  // The fill-color is a data-driven expression keyed on the polygon `code`
  // property (a local-only data-join — NO external provider, mirrors the
  // MapChoropleth color-expression approach but on the local polygons). If the
  // basemap source is missing (fetch failed), there is nothing to fill.
  /** Choose the fill-color expression for a province choropleth based on dataType.
   * Rate layers with a complianceTarget render as a divergent scale (F5);
   * all others keep the sequential RAMP_BLUE path. */
  function provinceColorExprForLayer(layer: ActiveLayer) {
    if (layer.dataType === "rate" && typeof layer.complianceTarget === "number") {
      return provinceDivergentColorExpr(layer.features, layer.complianceTarget);
    }
    return provinceColorExpr(layer.features);
  }

  function addProvinceChoroplethLayer(map: maplibregl.Map, layer: ActiveLayer) {
    if (!map.getSource("ar-provinces")) return;
    const fillId = provinceFillLayerId(layer.id);
    const lineId = provinceLineLayerId(layer.id);
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: "ar-provinces",
        paint: {
          "fill-color": provinceColorExprForLayer(layer),
          "fill-opacity": 0.82,
        },
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: "ar-provinces",
        paint: { "line-color": COLOR_CANVAS, "line-width": 0.8 },
      });
    }
    wireProvinceChoroplethInteractions(map, layer);
  }

  // Recompute the color expression in place when the layer's features change
  // (e.g. scope/period refetch). The fill layer + source are reused.
  function updateProvinceChoroplethLayer(map: maplibregl.Map, layer: ActiveLayer) {
    const fillId = provinceFillLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, "fill-color", provinceColorExprForLayer(layer));
    } else {
      // Basemap may have loaded after the first sync attempt — try to add now.
      addProvinceChoroplethLayer(map, layer);
    }
  }

  function wireProvinceChoroplethInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const fillId = provinceFillLayerId(layer.id);
    // Look up the value for a province code from the layer's current features.
    const valueFor = (code: string): number | null => {
      const current = layersRef.current.find((l) => l.id === layer.id);
      for (const f of current?.features.features ?? []) {
        const p = f.properties as { provinceCode?: string; province?: string; value?: number };
        if (p.provinceCode === code) return p.value ?? 0;
      }
      return null;
    };
    map.on("mouseenter", fillId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", fillId, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mousemove", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = props.code ?? "";
      const value = valueFor(code);
      const place = props.name ?? code ?? "—";
      const valueLine =
        value === null
          ? `<span style="color:#94a3b8">Sin datos</span>`
          : `<strong>${value.toLocaleString("es-AR")}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    // Clicking a province opens the DetailDrawer with the province cell props.
    map.on("click", fillId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as { code?: string; name?: string };
      const code = props.code ?? "";
      onFeatureClickRef.current?.(layer.id, {
        provinceCode: code,
        province: props.name ?? code,
        value: valueFor(code),
        level: "province",
      });
    });
  }

  /**
   * Interactions for graduated-circle layers (F1 density+signal).
   * No cluster — every feature is already one unit. Hover shows the count;
   * click opens the DetailDrawer.
   */
  function wireGraduatedPointInteractions(map: maplibregl.Map, layer: ActiveLayer) {
    const popup = popupRef.current;
    if (!popup) return;
    const pl = pointLayerId(layer.id);

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
      const p = f.properties as {
        place?: string;
        count?: number | null;
        suppressed?: boolean;
      };
      const place = p.place ?? "—";
      const valueLine = p.suppressed
        ? `<span style="color:#94a3b8">Suprimido (privacidad)</span>`
        : `<strong>${(p.count ?? 0).toLocaleString("es-AR")}</strong>`;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
        )
        .addTo(map);
    });
    map.on("click", pl, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      onFeatureClickRef.current?.(layer.id, (f.properties ?? {}) as Record<string, unknown>);
    });
  }

  /**
   * Interactions for reference-layer discrete pins (refugios, decomisos).
   * Cluster bubbles zoom in; unclustered points open the DetailDrawer.
   */
  function wireReferencePointInteractions(map: maplibregl.Map, layer: ActiveLayer) {
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
          `<div style="font-size:12px;padding:2px 6px"><div style="color:#cbd5e1">${escapeHtml(place)}</div>${valueLine}<br/><em style="font-size:11px;color:#94a3b8">${escapeHtml(layer.label)}</em></div>`,
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

  // U5 + F5: province-choropleth scale legend. One entry per active province-mode
  // choropleth layer, with its value min→max range and (for rate layers) the
  // compliance target. Rendered as an HTML overlay — no on-canvas text (privacy).
  // Legends are always visible (not gated on zoom) — fixes the "coropletas sin
  // leyenda" complaint: the overlay sits on top of the map at all zoom levels.
  const provinceLegends = layers
    .filter((l) => l.geomType === "choropleth" && l.level === "province")
    .map((l) => ({
      layer: l,
      bounds: provinceValueBounds(l.features),
      isDivergent: l.dataType === "rate" && typeof l.complianceTarget === "number",
    }))
    .filter(
      (
        x,
      ): x is {
        layer: ActiveLayer;
        bounds: ScaleBounds;
        isDivergent: boolean;
      } => x.bounds !== null,
    );

  // F1 Panorama v2: FIXED graduated-circle legend for density+signal layers.
  // Shows the circle-size → count-bucket mapping from the step expression in
  // addGraduatedPointLayer. Independent of zoom (circles are non-clustered, one
  // per unit, so this legend is always accurate). Shown when at least one
  // graduated layer is active.
  const hasGraduatedLayer = layers.some((l) => l.renderMode === "graduated");

  // Graduated-circle legend buckets: [radius-px, label]. Mirrors the step
  // expression in addGraduatedPointLayer: 0→6, 10→10, 50→16, 200→24, 500→32.
  const GRADUATED_BUCKETS: Array<{ r: number; label: string }> = [
    { r: 6, label: "1–9" },
    { r: 10, label: "10–49" },
    { r: 16, label: "50–199" },
    { r: 24, label: "200–499" },
    { r: 32, label: "500+" },
  ];

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
      {provinceLegends.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 space-y-2">
          {provinceLegends.map(({ layer, bounds, isDivergent }) => (
            <div
              key={layer.id}
              className="rounded-[6px] bg-black/55 px-3 py-2 text-[11px] text-white/90"
            >
              <div className="mb-1 font-medium">{layer.label}</div>
              {isDivergent && typeof layer.complianceTarget === "number" ? (
                // F5: divergent legend — two poles with the target anchor labeled.
                // Colorblind-safe: orange=below, white=at target, teal=above.
                // Text labels accompany every color swatch (not color-only).
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {/* Gradient bar: below-pole → neutral → above-pole */}
                    <span className="tabular-nums text-white/70">bajo meta</span>
                    <span
                      className="h-2.5 w-28 flex-none rounded-full"
                      style={{
                        background: `linear-gradient(to right, ${COLOR_DIVERGENT_BELOW}, ${COLOR_DIVERGENT_NEUTRAL}, ${COLOR_DIVERGENT_ABOVE})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="tabular-nums text-white/70">sobre meta</span>
                  </div>
                  {/* Target anchor — the pivotal reference point */}
                  <div className="flex items-center gap-1.5 text-white/60">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-[2px] border border-white/30"
                      style={{ background: COLOR_DIVERGENT_NEUTRAL }}
                      aria-hidden="true"
                    />
                    <span>
                      meta{" "}
                      <strong className="text-white/80">
                        {layer.complianceTarget.toLocaleString("es-AR")}%
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                // Sequential legend for density/count choropleths.
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{bounds.min.toLocaleString("es-AR")}</span>
                  <span
                    className="h-2.5 w-24 rounded-full"
                    style={{
                      background: `linear-gradient(to right, ${RAMP_BLUE[0]}, ${RAMP_BLUE[1]})`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums">{bounds.max.toLocaleString("es-AR")}</span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-1.5 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: COLOR_NO_DATA }}
                  aria-hidden="true"
                />
                Sin datos
              </div>
            </div>
          ))}
        </div>
      )}
      {/* F1 graduated-circle legend: fixed size → count-bucket mapping.
          Shown bottom-right when any density/signal layer is active.
          Does NOT depend on zoom — the circles are non-clustered, one per unit. */}
      {hasGraduatedLayer && (
        <div className="pointer-events-none absolute bottom-3 right-12 rounded-[6px] bg-black/55 px-3 py-2 text-[11px] text-white/90">
          <div className="mb-1.5 font-medium text-white/80">Eventos por unidad</div>
          <div className="flex flex-col gap-1">
            {GRADUATED_BUCKETS.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span
                  className="flex-none rounded-full"
                  style={{
                    width: b.r * 2,
                    height: b.r * 2,
                    background: "rgba(255,255,255,0.25)",
                    border: "1.5px solid rgba(255,255,255,0.5)",
                  }}
                  aria-hidden="true"
                />
                <span className="tabular-nums text-white/70">{b.label}</span>
              </div>
            ))}
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="flex-none rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  background: COLOR_SUPPRESSED,
                  opacity: 0.6,
                }}
                aria-hidden="true"
              />
              <span className="text-white/50">Suprimido</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Remove every maplibre object belonging to a layer id (point, locality
// choropleth, AND province-choropleth fill/outline over the shared basemap).
function removeLayer(map: maplibregl.Map, id: string) {
  for (const lid of [
    clusterLayerId(id),
    pointLayerId(id),
    choroLayerId(id),
    provinceFillLayerId(id),
    provinceLineLayerId(id),
  ]) {
    if (map.getLayer(lid)) map.removeLayer(lid);
  }
  // Only the per-layer GeoJSON source is removed; the SHARED ar-provinces
  // basemap source is never removed here (province-choropleth borrows it).
  if (map.getSource(srcId(id))) map.removeSource(srcId(id));
}

// F4: mute a layer (and re-restore it) by scaling circle-opacity. We never hide
// dimmed layers — the operator keeps the current-state context while scrubbing —
// but the reduced opacity signals "not reproducible in time" on the canvas.
const DIM_OPACITY = 0.18;
function applyDim(map: maplibregl.Map, layer: ActiveLayer) {
  const dim = layer.dimmed === true;
  if (layer.geomType === "choropleth") {
    // U5 province mode: mute the polygon fill instead of the centroid circles.
    if (layer.level === "province") {
      const fid = provinceFillLayerId(layer.id);
      if (map.getLayer(fid)) map.setPaintProperty(fid, "fill-opacity", dim ? DIM_OPACITY : 0.82);
      return;
    }
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
  // F1 graduated point layers: single circle per unit (no cluster layer).
  if (layer.renderMode === "graduated") {
    const pl = pointLayerId(layer.id);
    if (map.getLayer(pl)) {
      map.setPaintProperty(
        pl,
        "circle-opacity",
        dim
          ? DIM_OPACITY
          : (["case", ["==", ["get", "suppressed"], true], 0.45, 0.82] as unknown as number),
      );
    }
    return;
  }
  // Reference layers (discrete pins with clustering).
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
    return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(place)}</strong><br/><em style="font-size:11px;color:#94a3b8">Ubicación aproximada (centroide de localidad)</em></div>`;
  }
  if (layer.id === "refugios") {
    const name = String(props.name ?? "Refugio");
    const v = props.verified ? " · verificado" : "";
    return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(name)}</strong><span style="color:#94a3b8">${v}</span></div>`;
  }
  // Generic: a primary label + a meta line built from common props.
  const primary = String(props.name ?? props.code ?? props.diseaseLabel ?? layer.label);
  const meta = [props.incidentType, props.severity, props.status, props.diseaseCode]
    .filter(Boolean)
    .join(" · ");
  return `<div style="font-size:12px;padding:2px 6px"><strong>${escapeHtml(primary)}</strong>${meta ? `<br/><span style="color:#94a3b8">${escapeHtml(meta)}</span>` : ""}</div>`;
}
