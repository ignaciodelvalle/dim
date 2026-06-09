"use client";

import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

/**
 * Mapa coroplético con tiles OpenStreetMap vía MapLibre GL JS.
 *
 * Renderiza un mapa con una capa de relleno por provincia, coloreada según los valores
 * en `data`. Las provincias sin datos en `data` se muestran en gris tenue.
 *
 * Decisión de tiles (E-D1):
 *  El estilo de tiles usa `https://demotiles.maplibre.org/style.json` como placeholder v1.
 *  ARSAT es el proveedor objetivo; integración pendiente del propietario (OF-1).
 *  Ver: docs/superpowers/plans/2026-05-21-pending-decisions-resolved.md §E-D1
 *
 * Atribución OSM:
 *  La atribución "© OpenStreetMap contributors" se muestra en la esquina inferior derecha
 *  de acuerdo a los términos de uso de OSM. Si el estilo demotiles ya la incluye,
 *  el control la muestra automáticamente; si no, se agrega explícitamente via AttributionControl.
 *
 * Accesibilidad:
 *  - El mapa tiene un aria-label descriptivo.
 *  - Un `<details>` con tabla de datos queda renderizado debajo del mapa para usuarios
 *    de lectores de pantalla o cuando el mapa no carga. Columnas: "Región" y "Valor".
 *
 * @example
 * ```tsx
 * <MapChoropleth
 *   data={[{ code: "AR-C", value: 250, label: "CABA" }]}
 *   colorScale={["#e0f0ff", "#005fa3"]}
 * />
 * ```
 */

export type ChoroplethRegionDatum = {
  /** Código de región que coincide con la propiedad `code` del GeoJSON. Ej: "AR-C". */
  code: string;
  /** Valor numérico que determina la intensidad del color. */
  value: number;
  /** Etiqueta opcional para el tooltip al hacer hover sobre la región. */
  label?: string;
};

export type MapChoroplethProps = {
  /** URL del GeoJSON. Default "/geo/ar-provinces.geojson". */
  geojsonUrl?: string;
  /** Datos de regiones — se emparejan con los features del GeoJSON por `code`. */
  data: ChoroplethRegionDatum[];
  /**
   * Escala de colores del valor mínimo al máximo.
   * Default: rampa azul de un solo matiz.
   */
  colorScale?: [string, string];
  /** Centro del mapa [lng, lat]. Default: centroide aproximado de Argentina. */
  center?: [number, number];
  /** Nivel de zoom. Default 4 (cubre la mayor parte de Argentina). */
  zoom?: number;
  /** Alto del mapa en px. Default 400. */
  height?: number;
  className?: string;
  /** Descripción del contenido de la tabla de accesibilidad. */
  fallbackTableLabel?: string;
};

// Colores para regiones sin datos en el array `data`.
const MISSING_REGION_COLOR = "#e5e7eb";

export function MapChoropleth({
  geojsonUrl = "/geo/ar-provinces.geojson",
  data,
  colorScale = ["#bfdbfe", "#1d4ed8"],
  center = [-63.6167, -38.4161],
  zoom = 4,
  height = 400,
  className = "",
  fallbackTableLabel = "Datos del mapa",
}: MapChoroplethProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Capturamos las props en un ref para poder accederlas desde el efecto de mount
  // sin listar todas como dependencias — el mapa MapLibre se inicializa una única vez.
  // Las props son de solo lectura post-mount en v1; para soporte reactivo agregar un
  // efecto separado que llame a map.setStyle() / updateData() según cambios de props.
  const initPropsRef = useRef({ geojsonUrl, data, colorScale, center, zoom });
  initPropsRef.current = { geojsonUrl, data, colorScale, center, zoom };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const { geojsonUrl, data, colorScale, center, zoom } = initPropsRef.current;

    // Importación dinámica para evitar errores de SSR — MapLibre accede a `window`.
    import("maplibre-gl").then(({ default: maplibregl, AttributionControl }) => {
      if (!mapContainer.current) return;

      // v1 placeholder: demotiles MapLibre — ver E-D1. ARSAT es el proveedor objetivo (OF-1).
      const STYLE_URL = "https://demotiles.maplibre.org/style.json";

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE_URL,
        center,
        zoom,
        // La atribución se agrega manualmente para garantizar el cumplimiento OSM.
        attributionControl: false,
      });

      mapRef.current = map;

      // Atribución OSM obligatoria en esquina inferior derecha (E-D1).
      map.addControl(
        new AttributionControl({
          customAttribution: "© OpenStreetMap contributors",
          compact: false,
        }),
        "bottom-right",
      );

      map.on("load", () => {
        const values = data.map((d) => d.value);
        const minVal = values.length > 0 ? Math.min(...values) : 0;
        const maxVal = values.length > 0 ? Math.max(...values) : 1;

        // Construir expresión de interpolación lineal de color basada en el valor de cada feature.
        // Se usa una propiedad inyectada "choropleth_value" que se setea en el source.
        const matchExpression: maplibregl.ExpressionSpecification = [
          "case",
          ["has", "choropleth_value"],
          [
            "interpolate",
            ["linear"],
            ["get", "choropleth_value"],
            minVal,
            colorScale[0],
            maxVal,
            colorScale[1],
          ] as maplibregl.ExpressionSpecification,
          MISSING_REGION_COLOR,
        ];

        // Enriquecer el GeoJSON con los valores de `data` antes de cargarlo.
        fetch(geojsonUrl)
          .then((r) => r.json())
          .then((geojson: GeoJSON.FeatureCollection) => {
            const dataMap = new Map(data.map((d) => [d.code, d]));

            const enriched: GeoJSON.FeatureCollection = {
              ...geojson,
              features: geojson.features.map((feature) => {
                const code = (feature.properties as Record<string, string>)?.code ?? "";
                const datum = dataMap.get(code);
                return {
                  ...feature,
                  properties: {
                    ...feature.properties,
                    ...(datum
                      ? {
                          choropleth_value: datum.value,
                          choropleth_label: datum.label ?? datum.code,
                        }
                      : {}),
                  },
                };
              }),
            };

            map.addSource("provinces", {
              type: "geojson",
              data: enriched,
            });

            map.addLayer({
              id: "provinces-fill",
              type: "fill",
              source: "provinces",
              paint: {
                "fill-color": matchExpression,
                "fill-opacity": 0.75,
              },
            });

            map.addLayer({
              id: "provinces-outline",
              type: "line",
              source: "provinces",
              paint: {
                "line-color": "#ffffff",
                "line-width": 1,
              },
            });

            // Tooltip al hacer hover.
            const tooltip = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
            });

            map.on("mousemove", "provinces-fill", (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as Record<string, string | number>;
              const labelText = props.choropleth_label ?? props.name ?? props.code ?? "";
              const val = props.choropleth_value ?? "—";
              map.getCanvas().style.cursor = "pointer";
              tooltip
                .setLngLat(e.lngLat)
                .setHTML(
                  `<div style="font-size:13px;padding:4px 8px"><strong>${labelText}</strong><br/>${val}</div>`,
                )
                .addTo(map);
            });

            map.on("mouseleave", "provinces-fill", () => {
              map.getCanvas().style.cursor = "";
              tooltip.remove();
            });
          })
          .catch((err) => {
            console.error("[MapChoropleth] Error cargando GeoJSON:", err);
          });
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className={className}>
      {/* Contenedor del mapa */}
      <div
        ref={mapContainer}
        style={{ height }}
        className="w-full rounded-xl overflow-hidden border border-ln-line"
        aria-label={fallbackTableLabel}
        role="img"
      />

      {/* Tabla de accesibilidad — siempre renderizada, oculta visualmente si se desea */}
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
                  {d.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
