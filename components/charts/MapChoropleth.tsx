"use client";

import {
  type GeoLevel,
  type RawDatum,
  departmentBelongsToProvince,
  isCABA,
  joinChoroplethData,
} from "@/lib/geo-join";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  COLOR_SUPPRESSED,
  type ColorRamp,
  RAMP_BLUE,
  divergentStops,
} from "@/lib/viz-scales";
import type maplibregl from "maplibre-gl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Mapa coroplético v2 — MapLibre GL JS con:
 *  - Drill jerárquico: provincia → departamento → barrio (CABA).
 *  - Cross-filter: selección persiste en searchParams (mismo patrón que PeriodPicker).
 *  - Escala tokenizada: colorScale viene de lib/viz-scales.ts (no hex literal).
 *  - Join robusto: normalizador por nivel, orphanData explícito, flag de supresión.
 *  - A11y: <details> con tabla de datos; aria-label; teclado (Escape para volver).
 *
 * Backward-compatible: los callers que no pasen `allowDrill` ni `level` obtienen
 * el comportamiento v1 sin ningún cambio.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChoroplethRegionDatum = {
  /** Código de región — emparejado por normalizador de nivel con feature.properties.code. */
  code: string;
  /** Valor numérico que determina el color. */
  value: number;
  /** Etiqueta para tooltip y tabla a11y. */
  label?: string;
  /** Celda suprimida por k-anonimato — se renderiza en COLOR_SUPPRESSED. */
  suppressed?: boolean;
};

export type MapChoroplethProps = {
  /** URL del GeoJSON. Default "/geo/ar-provinces.geojson". */
  geojsonUrl?: string;
  /** Datos de regiones — emparejados con features por `code` normalizado. */
  data: ChoroplethRegionDatum[];
  /**
   * Nivel geográfico del GeoJSON provisto.
   * Determina el normalizador de código. Default: "province".
   */
  level?: GeoLevel;
  /**
   * Ramp de colores [bajo, alto] — DEBE venir de lib/viz-scales.ts.
   * Acepta tanto ColorRamp (readonly) como [string, string] mutable
   * para compatibilidad con callers v1. Migrar a ColorRamp de viz-scales.ts.
   * Default: RAMP_BLUE.
   */
  colorScale?: readonly [string, string] | [string, string];
  /** Centro del mapa [lng, lat]. Default: centroide de Argentina. */
  center?: [number, number];
  /** Zoom inicial. Default 4. */
  zoom?: number;
  /** Alto del mapa en px. Default 400. */
  height?: number;
  className?: string;
  /** Etiqueta de la tabla a11y. */
  fallbackTableLabel?: string;
  /**
   * Whitelist de `feature.properties.code` a renderizar.
   * Cuando se provee y es no-vacía, el GeoJSON se filtra antes de agregar
   * la fuente. Viewport se ajusta solo a esas features.
   */
  visibleCodes?: string[];
  /**
   * Habilita el drill jerárquico interactivo.
   * province → department (o barrio para CABA).
   * Default: false (comportamiento v1).
   */
  allowDrill?: boolean;
  /**
   * Claves de searchParams para cross-filter.
   * Al hacer click en una región actualiza el param del nivel activo,
   * filtrando KPIs y charts de la página vía URL state.
   * Si no se provee, el cross-filter está deshabilitado.
   */
  paramKeys?: {
    province?: string;
    department?: string;
    barrio?: string;
  };
  /**
   * Human-readable label for the scale legend (e.g. "Casos abiertos").
   * When provided, a gradient scale legend with the data min→max range
   * is rendered below the map. Required for dashboards where the color
   * encodes a quantitative variable.
   */
  scaleLabel?: string;
  /**
   * Color scale rendering mode.
   *  - `"sequential"` (default): linear interpolation from colorScale[0] → colorScale[1].
   *  - `"divergent"`: divergent scale anchored at `target` using SCALE_DIVERGENT_COMPLIANCE
   *    (orange=below target, neutral=at target, teal=above target — colorblind-safe).
   *    Requires `target` to be provided; falls back to sequential if `target` is absent.
   */
  scaleMode?: "sequential" | "divergent";
  /**
   * Compliance target value used when `scaleMode === "divergent"`.
   * Anchors the neutral midpoint of the divergent ramp (e.g. 80 for an 80% coverage goal).
   * Has no effect when `scaleMode` is `"sequential"` (the default).
   */
  target?: number;
};

// ---------------------------------------------------------------------------
// GeoJSON URL per level
// ---------------------------------------------------------------------------

const GEOJSON_BY_LEVEL: Record<GeoLevel, string> = {
  province: "/geo/ar-provinces.geojson",
  department: "/geo/ar-departments.geojson",
  barrio: "/geo/caba-barrios.geojson",
};

const LEVEL_LABELS: Record<GeoLevel, string> = {
  province: "Provincias",
  department: "Departamentos",
  barrio: "Barrios",
};

// ---------------------------------------------------------------------------
// Internal drill state
// ---------------------------------------------------------------------------

type DrillCrumb = {
  label: string;
  level: GeoLevel;
  geojsonUrl: string;
  provinceIso?: string;
};

type DrillState = {
  level: GeoLevel;
  geojsonUrl: string;
  breadcrumb: DrillCrumb[];
  provinceIso?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MapChoropleth({
  geojsonUrl,
  data,
  level = "province",
  colorScale = RAMP_BLUE,
  center = [-63.6167, -38.4161],
  zoom = 4,
  height = 400,
  className = "",
  fallbackTableLabel = "Datos del mapa",
  visibleCodes,
  allowDrill = false,
  paramKeys,
  scaleLabel,
  scaleMode = "sequential",
  target,
}: MapChoroplethProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [drillState, setDrillState] = useState<DrillState>({
    level,
    geojsonUrl: geojsonUrl ?? GEOJSON_BY_LEVEL[level],
    breadcrumb: [],
  });

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Refs so event handlers always see the latest state without re-mounting
  const drillStateRef = useRef(drillState);
  drillStateRef.current = drillState;

  const dataRef = useRef(data);
  dataRef.current = data;

  const paramKeysRef = useRef(paramKeys);
  paramKeysRef.current = paramKeys;

  // ---------------------------------------------------------------------------
  // Cross-filter
  // ---------------------------------------------------------------------------

  const updateCrossFilter = useCallback(
    (selectedCode: string, currentLevel: GeoLevel) => {
      const keys = paramKeysRef.current;
      if (!keys) return;
      const key = keys[currentLevel];
      if (!key) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set(key, selectedCode);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // ---------------------------------------------------------------------------
  // Drill back
  // ---------------------------------------------------------------------------

  function handleDrillBack() {
    setDrillState((prev) => {
      if (prev.breadcrumb.length === 0) return prev;
      const last = prev.breadcrumb[prev.breadcrumb.length - 1];
      return {
        level: last.level,
        geojsonUrl: last.geojsonUrl,
        provinceIso: last.provinceIso,
        breadcrumb: prev.breadcrumb.slice(0, -1),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Map init — re-runs when drill level/url changes
  // ---------------------------------------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: MapLibre map initializes once per drill level; data/center/zoom intentionally read from refs inside the effect to avoid full re-init on every prop change. Only re-init when the geographic level/url or drill context changes.
  useEffect(() => {
    if (!mapContainer.current) return;

    // Tear down previous map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const {
      level: curLevel,
      geojsonUrl: curUrl,
      provinceIso: curProvinceIso,
    } = drillStateRef.current;
    const curData = dataRef.current;

    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapContainer.current) return;

      // Privacy (spec §13.4 mirror): tiles-free basemap — background layer only,
      // no external raster source. The choropleth region polygons (per-level
      // local geojson) are added as a data layer on top of this background.
      // No third-party tile provider means no viewport beacon to OSM or similar.
      const STYLE: maplibregl.StyleSpecification = {
        version: 8,
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": "#e8ecf0" },
          },
        ],
      };

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE,
        center,
        zoom,
        attributionControl: false,
      });

      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        fetch(curUrl)
          .then((r) => r.json())
          .then((geojson: GeoJSON.FeatureCollection) => {
            if (cancelled) return;

            // Filter features by visibleCodes or province prefix
            let sourceFeatures = geojson.features;

            if (visibleCodes && visibleCodes.length > 0) {
              const visibleSet = new Set(visibleCodes);
              sourceFeatures = sourceFeatures.filter((f) => {
                const code = String((f.properties as Record<string, string>)?.code ?? "");
                return visibleSet.has(code);
              });
            } else if (curLevel === "department" && curProvinceIso) {
              sourceFeatures = sourceFeatures.filter((f) => {
                const code = String((f.properties as Record<string, string>)?.code ?? "");
                return departmentBelongsToProvince(code, curProvinceIso);
              });
            }

            // Robust join — exposes orphanData instead of silently dropping it
            const rawData: RawDatum[] = curData.map((d) => ({
              code: d.code,
              value: d.value,
              label: d.label,
              suppressed: d.suppressed,
            }));

            const { features: joinedFeatures, orphanData } = joinChoroplethData(
              sourceFeatures,
              rawData,
              curLevel,
            );

            if (orphanData.length > 0) {
              console.warn(
                `[MapChoropleth] ${orphanData.length} dato(s) sin feature matching en ${curUrl}:`,
                orphanData.map((o) => o.code),
              );
            }

            const values = joinedFeatures
              .filter((f) => !f.missingData && !f.suppressed)
              .map((f) => f.value ?? 0);
            const minVal = values.length > 0 ? Math.min(...values) : 0;
            const maxVal =
              values.length > 0 && values.length > 1 ? Math.max(...values) : minVal + 1;

            // Enrich GeoJSON features with choropleth metadata
            const enriched: GeoJSON.FeatureCollection = {
              type: "FeatureCollection",
              features: sourceFeatures.map((originalFeature, idx) => {
                const joined = joinedFeatures[idx];
                const extraProps: Record<string, unknown> = {};

                if (joined && !joined.missingData) {
                  extraProps.choropleth_value = joined.suppressed ? minVal : (joined.value ?? 0);
                  extraProps.choropleth_label = joined.label ?? joined.code;
                  extraProps.choropleth_suppressed = joined.suppressed ? "yes" : "no";
                } else {
                  extraProps.choropleth_missing = "yes";
                }

                return {
                  ...originalFeature,
                  properties: { ...originalFeature.properties, ...extraProps },
                };
              }),
            };

            // MapLibre color expression:
            // - suppressed: COLOR_SUPPRESSED
            // - no data:    COLOR_NO_DATA
            // - has data:   interpolation (sequential or divergent)
            const isDivergent = scaleMode === "divergent" && typeof target === "number";

            const dataInterpolateExpr: maplibregl.ExpressionSpecification = isDivergent
              ? (() => {
                  // Divergent: anchor at `target`, orange=below, neutral=at, teal=above.
                  // Reuses divergentStops from lib/viz-scales — same helper as SituationalMap.
                  const stops = divergentStops(target as number, minVal, maxVal);
                  const flatStops = stops.flat();
                  return [
                    "interpolate",
                    ["linear"],
                    ["get", "choropleth_value"],
                    ...flatStops,
                  ] as maplibregl.ExpressionSpecification;
                })()
              : ([
                  "interpolate",
                  ["linear"],
                  ["get", "choropleth_value"],
                  minVal,
                  colorScale[0],
                  maxVal,
                  colorScale[1],
                ] as maplibregl.ExpressionSpecification);

            const colorExpr: maplibregl.ExpressionSpecification = [
              "case",
              ["==", ["get", "choropleth_suppressed"], "yes"],
              COLOR_SUPPRESSED,
              ["has", "choropleth_value"],
              dataInterpolateExpr,
              COLOR_NO_DATA,
            ];

            map.addSource("regions", { type: "geojson", data: enriched });

            map.addLayer({
              id: "regions-fill",
              type: "fill",
              source: "regions",
              paint: { "fill-color": colorExpr, "fill-opacity": 0.75 },
            });

            map.addLayer({
              id: "regions-outline",
              type: "line",
              source: "regions",
              paint: { "line-color": "#ffffff", "line-width": 1 },
            });

            // Selection highlight layer (starts with no-match filter)
            map.addLayer({
              id: "regions-selected",
              type: "line",
              source: "regions",
              filter: ["==", ["get", "code"], "__none__"],
              paint: { "line-color": "#1d4ed8", "line-width": 3 },
            });

            // Auto-fit bounds
            try {
              let lngMin = Number.POSITIVE_INFINITY;
              let lngMax = Number.NEGATIVE_INFINITY;
              let latMin = Number.POSITIVE_INFINITY;
              let latMax = Number.NEGATIVE_INFINITY;

              function walkCoords(coords: unknown): void {
                if (!Array.isArray(coords)) return;
                if (typeof coords[0] === "number") {
                  const lng = coords[0] as number;
                  const lat = coords[1] as number;
                  if (lng < lngMin) lngMin = lng;
                  if (lng > lngMax) lngMax = lng;
                  if (lat < latMin) latMin = lat;
                  if (lat > latMax) latMax = lat;
                } else {
                  for (const c of coords) walkCoords(c);
                }
              }

              for (const feature of enriched.features) {
                const geom = feature.geometry;
                if (geom && "coordinates" in geom) walkCoords(geom.coordinates);
              }

              const validBbox =
                Number.isFinite(lngMin) &&
                Number.isFinite(lngMax) &&
                Number.isFinite(latMin) &&
                Number.isFinite(latMax) &&
                lngMax > lngMin &&
                latMax > latMin;

              if (validBbox) {
                map.fitBounds(
                  [
                    [lngMin, latMin],
                    [lngMax, latMax],
                  ],
                  { padding: 24, animate: false, maxZoom: 9 },
                );
              }
            } catch {
              // Bbox failed — initial center/zoom stays.
            }

            // Tooltip
            const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

            map.on("mousemove", "regions-fill", (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as Record<string, string | number>;
              const labelText = props.choropleth_label ?? props.name ?? props.code ?? "";
              const isSuppressed = props.choropleth_suppressed === "yes";
              const isMissing = props.choropleth_missing === "yes";
              const drillable = allowDrill && curLevel !== "barrio";

              const valStr = isSuppressed
                ? "Dato suprimido (privacidad k-anonimato)"
                : isMissing
                  ? "Sin datos"
                  : String(props.choropleth_value ?? "—");

              const drillHint = drillable
                ? `<br/><em style="font-size:11px;color:#6b7280">Clic para ver detalle</em>`
                : "";

              map.getCanvas().style.cursor = drillable ? "pointer" : "default";
              tooltip
                .setLngLat(e.lngLat)
                .setHTML(
                  `<div style="font-size:13px;padding:4px 8px"><strong>${labelText}</strong><br/>${valStr}${drillHint}</div>`,
                )
                .addTo(map);
            });

            map.on("mouseleave", "regions-fill", () => {
              map.getCanvas().style.cursor = "";
              tooltip.remove();
            });

            // Click — cross-filter + optional drill
            map.on("click", "regions-fill", (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as Record<string, string>;
              const clickedCode = String(props.code ?? "");
              const clickedName = String(props.name ?? clickedCode);

              // Highlight selection
              map.setFilter("regions-selected", ["==", ["get", "code"], clickedCode]);

              // Cross-filter via searchParams
              updateCrossFilter(clickedCode, curLevel);

              // Drill down
              if (allowDrill && curLevel === "province") {
                const nextLevel: GeoLevel = isCABA(clickedCode) ? "barrio" : "department";
                setDrillState((prev) => ({
                  level: nextLevel,
                  geojsonUrl: GEOJSON_BY_LEVEL[nextLevel],
                  provinceIso: clickedCode,
                  breadcrumb: [
                    ...prev.breadcrumb,
                    {
                      label: clickedName,
                      level: "province",
                      geojsonUrl: GEOJSON_BY_LEVEL.province,
                    },
                  ],
                }));
              }
            });
          })
          .catch((err) => {
            console.error("[MapChoropleth] Error cargando GeoJSON:", err);
          });
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drillState.level,
    drillState.geojsonUrl,
    drillState.provinceIso,
    colorScale,
    allowDrill,
    scaleMode,
    target,
  ]);

  // ---------------------------------------------------------------------------
  // Scale range for gradient legend — derived from non-suppressed data values.
  // ---------------------------------------------------------------------------

  const scaleBounds = useMemo(() => {
    const values = data.filter((d) => !d.suppressed).map((d) => d.value);
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, max };
  }, [data]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={className}>
      {/* Breadcrumb + Volver */}
      {allowDrill && drillState.breadcrumb.length > 0 && (
        <nav aria-label="Nivel de mapa" className="mb-2 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleDrillBack}
            className="text-ln-azul hover:underline font-medium"
          >
            ← Volver
          </button>
          <ol className="flex items-center gap-1 list-none m-0 p-0">
            {drillState.breadcrumb.map((crumb, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are positional
                key={i}
                className="flex items-center gap-1"
              >
                <span className="text-ln-ink-2">{crumb.label}</span>
                <span className="text-ln-ink-3" aria-hidden="true">
                  /
                </span>
              </li>
            ))}
            <li className="text-ln-ink font-medium">{LEVEL_LABELS[drillState.level]}</li>
          </ol>
        </nav>
      )}

      {/* Mapa */}
      <div
        ref={mapContainer}
        style={{ height }}
        className="w-full rounded-xl overflow-hidden border border-ln-line"
        aria-label={fallbackTableLabel}
        role="img"
      />

      {/* Leyenda del mapa */}
      <figure
        className="mt-2 space-y-1.5"
        aria-label={`Leyenda: ${scaleLabel ?? fallbackTableLabel}`}
      >
        <figcaption className="sr-only">
          {scaleLabel ?? fallbackTableLabel} — escala de colores y estados especiales del mapa
        </figcaption>

        {/* Gradient scale — only shown when we have data and a label */}
        {scaleLabel && scaleBounds && scaleBounds.min !== scaleBounds.max && (
          <div
            role="img"
            aria-label={
              scaleMode === "divergent" && typeof target === "number"
                ? `Escala de color para ${scaleLabel}: bajo meta ${target}% (naranja) — sobre meta (verde azulado)`
                : `Escala de color para ${scaleLabel}: de ${scaleBounds.min} (mínimo) a ${scaleBounds.max} (máximo)`
            }
          >
            <p className="text-[10px] text-ln-ink-3 mb-0.5">{scaleLabel}</p>
            {scaleMode === "divergent" && typeof target === "number" ? (
              // Divergent legend: two poles with the target anchor labeled.
              // Mirrors the F5 Panorama province-choropleth legend semantics.
              // Colorblind-safe: orange=below, neutral=at target, teal=above.
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ln-ink-3">bajo meta</span>
                  <div
                    className="h-2.5 flex-1 rounded-sm border border-ln-line"
                    style={{
                      background: `linear-gradient(to right, ${COLOR_DIVERGENT_BELOW}, ${COLOR_DIVERGENT_NEUTRAL}, ${COLOR_DIVERGENT_ABOVE})`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-ln-ink-3">sobre meta</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-ln-ink-3">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-[2px] border border-ln-line"
                    style={{ background: COLOR_DIVERGENT_NEUTRAL }}
                    aria-hidden="true"
                  />
                  <span>
                    meta <strong>{target}%</strong>
                  </span>
                </div>
              </div>
            ) : (
              // Sequential legend: min → max gradient bar.
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-ln-ink-3">{scaleBounds.min}</span>
                <div
                  className="h-2.5 flex-1 rounded-sm border border-ln-line"
                  style={{
                    background: `linear-gradient(to right, ${colorScale[0]}, ${colorScale[1]})`,
                  }}
                  aria-hidden="true"
                />
                <span className="text-[10px] tabular-nums text-ln-ink-3">{scaleBounds.max}</span>
              </div>
            )}
          </div>
        )}

        {/* Discrete swatches: no-data + suppressed */}
        <ul
          className="flex items-center gap-3 list-none m-0 p-0 text-[10px] text-ln-ink-3"
          aria-label="Estados especiales"
        >
          <li className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-ln-line"
              style={{ background: COLOR_NO_DATA }}
              aria-hidden="true"
            />
            Sin datos
          </li>
          <li className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-ln-line"
              style={{ background: COLOR_SUPPRESSED }}
              aria-hidden="true"
            />
            Suprimido (privacidad)
          </li>
        </ul>
      </figure>

      {/* Tabla a11y */}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ln-azul hover:underline text-xs font-medium">
          Ver datos
        </summary>
        <table className="mt-2 w-full border-collapse text-xs">
          <caption className="sr-only">{fallbackTableLabel}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border border-ln-line px-3 py-1.5 text-left font-semibold text-ln-ink-2 bg-ln-stripe"
              >
                Región
              </th>
              <th
                scope="col"
                className="border border-ln-line px-3 py-1.5 text-left font-semibold text-ln-ink-2 bg-ln-stripe"
              >
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.code}>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink">
                  {d.label ?? d.code}
                </td>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink tabular-nums">
                  {d.suppressed ? <span className="text-ln-op-mute">— (suprimido)</span> : d.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
