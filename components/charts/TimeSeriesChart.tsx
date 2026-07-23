"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Gráfico de serie temporal — wrapper de recharts para línea o área.
 *
 * Variantes:
 *  - line  → `<LineChart>`. Para tendencias simples. Default.
 *  - area  → `<AreaChart>`. Para visualizar volumen acumulado o rango.
 *
 * Accesibilidad:
 *  - `prefers-reduced-motion`: se detecta en el cliente y desactiva todas las animaciones
 *    de recharts cuando el usuario prefiere movimiento reducido.
 *  - Tabla de accesibilidad dentro de `<details>` con columnas "Período" y "Valor".
 *    Siempre renderizada; permite que lectores de pantalla accedan a los datos.
 *
 * @example
 * ```tsx
 * <TimeSeriesChart
 *   data={[{ x: "Ene", y: 120 }, { x: "Feb", y: 145 }]}
 *   seriesLabel="Denuncias"
 *   variant="area"
 * />
 * ```
 */

export type TimeSeriesPoint = {
  /** Fecha o string pre-formateado para mostrar en el eje X. */
  x: string;
  /** Valor numérico. */
  y: number;
};

export type TimeSeriesChartProps = {
  data: TimeSeriesPoint[];
  /** Etiqueta de la serie — aparece en el tooltip y la leyenda. */
  seriesLabel: string;
  /** Etiqueta del eje Y. Opcional si el contexto lo hace obvio. */
  yLabel?: string;
  /** "line" (default) | "area". */
  variant?: "line" | "area";
  /** Color del trazo. Default: --color-ln-azul (#242c4f). */
  strokeColor?: string;
  /**
   * Color de relleno del área (solo cuando variant === "area").
   * Default: strokeColor al 20% de opacidad.
   */
  fillColor?: string;
  /** Alto del gráfico en px. Default 300. */
  height?: number;
  /**
   * Curve interpolation (viz-suite wave 0): "monotone" (default, smooth) or
   * "stepAfter" — step curves are the honest render for SURVIVAL / time-to-event
   * series (cohort curves, reunification medians), where the value holds until
   * the next event instead of gliding between points.
   */
  lineType?: "monotone" | "stepAfter";
  className?: string;
  /** Descripción del contenido de la tabla de accesibilidad. */
  fallbackTableLabel?: string;
  /**
   * Visual review 2026-07-23 (#4): k-anon suppressed cell count, when the
   * caller knows it. With it, an EMPTY chart states "Datos ocultos por
   * privacidad (k<5)." instead of the generic no-data copy — an empty plot
   * born from suppression must never read as a missing dataset (nor as a
   * render failure).
   */
  suppressedCount?: number;
};

export function TimeSeriesChart({
  data,
  seriesLabel,
  yLabel,
  variant = "line",
  strokeColor = "#242c4f",
  fillColor,
  height = 300,
  lineType = "monotone",
  className = "",
  fallbackTableLabel = "Datos del gráfico",
  suppressedCount = 0,
}: TimeSeriesChartProps) {
  // Detectar prefers-reduced-motion en el cliente.
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const areaFill = fillColor ?? `${strokeColor}33`; // 20% de opacidad si no se provee.

  // recharts espera {x, y} → convertimos internamente para evitar colisión de keys.
  const chartData = data.map((p) => ({ periodo: p.x, valor: p.y }));

  // Visual review 2026-07-23 (#4): estado vacío EN el gráfico. Sin puntos, los
  // ejes + leyenda solos se leen como una falla de render — se dibuja un
  // mensaje centrado en el área de trazado y se omite la leyenda (no hay serie
  // que nombrar). Con suppressedCount > 0 el vacío viene de la privacidad y el
  // mensaje lo dice.
  const isEmpty = data.length === 0;
  const emptyMessage =
    suppressedCount > 0
      ? "Datos ocultos por privacidad (k<5)."
      : "Sin datos para el período seleccionado.";

  // Visual review 2026-07-23 (#4): un único punto no tiene segmento que trazar —
  // sin dot la serie es invisible (el hallazgo "Altas nuevas": un punto solo en
  // un vacío 0–1000). Se muestra el punto con dot + etiqueta de valor.
  const singlePoint = data.length === 1;
  const pointDot = singlePoint ? { r: 4, fill: strokeColor, strokeWidth: 0 } : false;
  const pointLabel = singlePoint
    ? { position: "top" as const, fontSize: 11, fill: strokeColor }
    : undefined;

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 16, left: 0, bottom: 0 },
  };

  const xAxis = <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />;
  const yAxis = (
    <YAxis
      tick={{ fontSize: 11 }}
      label={
        yLabel
          ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }
          : undefined
      }
    />
  );
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />;
  const tooltip = <Tooltip />;
  const legend = isEmpty ? null : <Legend wrapperStyle={{ fontSize: 12 }} />;

  return (
    <div className={className}>
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          {variant === "area" ? (
            <AreaChart {...commonProps}>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {legend}
              <Area
                type={lineType}
                dataKey="valor"
                name={seriesLabel}
                stroke={strokeColor}
                fill={areaFill}
                strokeWidth={2}
                dot={pointDot}
                label={pointLabel}
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          ) : (
            <LineChart {...commonProps}>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              {legend}
              <Line
                type={lineType}
                dataKey="valor"
                name={seriesLabel}
                stroke={strokeColor}
                strokeWidth={2}
                dot={pointDot}
                label={pointLabel}
                isAnimationActive={!reducedMotion}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
        {isEmpty && (
          <p
            role="note"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ln-mute"
          >
            {emptyMessage}
          </p>
        )}
      </div>

      {/* Tabla de accesibilidad */}
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
                Período
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
            {data.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: los puntos de una serie temporal son únicos por posición
              <tr key={i}>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink">{p.x}</td>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink tabular-nums">
                  {p.y}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
