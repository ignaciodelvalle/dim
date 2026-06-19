"use client";

import { CHART_COLORS, type ChartColorKey } from "@/lib/viz-scales";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardTooltip } from "./DashboardTooltip";
import type { DashboardTooltipProps } from "./DashboardTooltip";

/**
 * DashboardChart — wrapper de recharts para dashboards de gobierno.
 *
 * Agrega sobre TimeSeriesChart:
 *  - Tooltip descriptivo (DashboardTooltip) con unidad + % + nota metodológica.
 *  - Freshness: "Datos al {hora}" via prop `asOf` (fuerza dynamic por caller).
 *  - Botón de export CSV/anonimizado (reusa patrón de gob/analytics/export).
 *  - prefers-reduced-motion respetado.
 *  - Estado vacío explícito (no gráfico vacío).
 *  - Estado de carga (skeleton automático cuando `loading=true`).
 *
 * Variantes: "line" | "area" | "bar".
 *
 * @example
 * ```tsx
 * <DashboardChart
 *   data={[{ x: "Ene", y: 120 }, { x: "Feb", y: 145 }]}
 *   seriesLabel="Vacunaciones"
 *   unit="mascotas"
 *   asOf={new Date()}
 *   methodNote="Ventana 30 días. Celdas < 5 suprimidas (k-anonimato)."
 *   onExport={handleExport}
 * />
 * ```
 */

export type DashboardChartPoint = {
  /** Eje X — fecha o string pre-formateado. */
  x: string;
  /** Valor numérico. */
  y: number;
};

export type DashboardChartProps = {
  data: DashboardChartPoint[];
  /** Etiqueta de la serie (tooltip + leyenda). */
  seriesLabel: string;
  /** Etiqueta del eje Y. Opcional si el contexto lo hace obvio. */
  yLabel?: string;
  /** Variante del chart. Default: "line". */
  variant?: "line" | "area" | "bar";
  /**
   * Color de la serie. DEBE ser una clave de CHART_COLORS de lib/viz-scales.ts.
   * Default: "blue".
   */
  colorKey?: ChartColorKey;
  /** Alto del gráfico en px. Default: 280. */
  height?: number;
  className?: string;
  /** Etiqueta de la tabla a11y. */
  fallbackTableLabel?: string;
  /** Unidad del valor — se muestra en el tooltip. */
  unit?: string;
  /**
   * Total de referencia para calcular porcentajes en el tooltip.
   */
  total?: number;
  /**
   * Nota metodológica para el tooltip (ventana, k-anon, etc.).
   */
  methodNote?: string;
  /**
   * Timestamp de los datos — se muestra como "Datos al {hora}".
   * El caller es responsable de pasarlo desde una prop `Date` server-side
   * con `export const dynamic = "force-dynamic"`.
   */
  asOf?: Date;
  /**
   * Callback de export. Si se provee, aparece el botón "Exportar CSV".
   * El caller implementa la lógica (reusa gob/analytics/export pattern).
   */
  onExport?: () => void | Promise<void>;
  /** Muestra skeleton de carga. */
  loading?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardChart({
  data,
  seriesLabel,
  yLabel,
  variant = "line",
  colorKey = "blue",
  height = 280,
  className = "",
  fallbackTableLabel = "Datos del gráfico",
  unit,
  total,
  methodNote,
  asOf,
  onExport,
  loading = false,
}: DashboardChartProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const strokeColor = CHART_COLORS[colorKey];
  const areaFill = `${strokeColor}33`; // 20% opacity

  const chartData = data.map((p) => ({ periodo: p.x, valor: p.y }));

  const handleExport = useCallback(async () => {
    if (!onExport || exporting) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }, [onExport, exporting]);

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={className}>
        <div
          className="w-full rounded-xl border border-ln-op-line bg-ln-op-stripe animate-pulse"
          style={{ height }}
          aria-label="Cargando gráfico…"
          role="status"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (data.length === 0) {
    return (
      <div className={className}>
        <div
          className="w-full flex flex-col items-center justify-center rounded-xl border border-ln-op-line bg-ln-op-stripe text-ln-op-mute text-sm"
          style={{ height }}
        >
          <span className="text-2xl mb-2" aria-hidden="true">
            📊
          </span>
          <p>Sin datos para el período seleccionado</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Shared recharts elements
  // ---------------------------------------------------------------------------

  const tooltipContent = <DashboardTooltip unit={unit} total={total} methodNote={methodNote} />;

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
  const legend = <Legend wrapperStyle={{ fontSize: 12 }} />;

  let chart: React.ReactNode;

  if (variant === "area") {
    chart = (
      <AreaChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip content={tooltipContent} />
        {legend}
        <Area
          type="monotone"
          dataKey="valor"
          name={seriesLabel}
          stroke={strokeColor}
          fill={areaFill}
          strokeWidth={2}
          dot={false}
          isAnimationActive={!reducedMotion}
        />
      </AreaChart>
    );
  } else if (variant === "bar") {
    chart = (
      <BarChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip content={tooltipContent} />
        {legend}
        <Bar
          dataKey="valor"
          name={seriesLabel}
          fill={strokeColor}
          isAnimationActive={!reducedMotion}
        />
      </BarChart>
    );
  } else {
    chart = (
      <LineChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip content={tooltipContent} />
        {legend}
        <Line
          type="monotone"
          dataKey="valor"
          name={seriesLabel}
          stroke={strokeColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={!reducedMotion}
        />
      </LineChart>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={className}>
      {/* Freshness + Export toolbar */}
      {(asOf || onExport) && (
        <div className="mb-2 flex items-center justify-between text-[11px] text-ln-op-mute">
          {asOf && (
            <span>
              Datos al{" "}
              <time dateTime={asOf.toISOString()}>
                {asOf.toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </span>
          )}
          {onExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="ml-auto text-ln-azul hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-[11px]"
            >
              {exporting ? "Exportando…" : "Exportar CSV"}
            </button>
          )}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {chart as React.ReactElement}
      </ResponsiveContainer>

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
                Período
              </th>
              <th
                scope="col"
                className="border border-ln-line px-3 py-1.5 text-left font-semibold text-ln-ink-2 bg-ln-stripe"
              >
                {seriesLabel}
                {unit && <span className="font-normal ml-1">({unit})</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: series temporal, posición es la identidad
              <tr key={i}>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink">{p.x}</td>
                <td className="border border-ln-line px-3 py-1.5 text-ln-ink tabular-nums">
                  {p.y.toLocaleString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
