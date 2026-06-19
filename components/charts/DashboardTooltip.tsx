"use client";

import type { TooltipProps } from "recharts";

/**
 * DashboardTooltip — tooltip descriptivo para DashboardChart.
 *
 * Muestra:
 *  - Período (eje X label)
 *  - Valor absoluto con unidad
 *  - Porcentaje respecto al total si se provee `total`
 *  - Nota metodológica (ventana temporal, k-anonimato, etc.)
 *
 * Reemplaza el <Tooltip/> pelado de recharts con información contextual
 * que permite al analista entender qué representa cada punto.
 *
 * @example
 * ```tsx
 * <Tooltip
 *   content={
 *     <DashboardTooltip
 *       unit="mascotas"
 *       total={450}
 *       methodNote="Ventana 30 días. Celdas < 5 suprimidas."
 *     />
 *   }
 * />
 * ```
 */

export type DashboardTooltipProps = {
  /** Unidad del valor. Ej: "mascotas", "campañas", "vacunas". */
  unit?: string;
  /**
   * Total de referencia para calcular el porcentaje.
   * Si no se provee, el porcentaje no se muestra.
   */
  total?: number;
  /**
   * Nota metodológica: ventana temporal, k-anonimato, etc.
   * Aparece en cursiva al final del tooltip.
   */
  methodNote?: string;
};

// recharts injects these props when used as content={<DashboardTooltip />}
type RechartsTooltipPayload = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
};

type InternalProps = DashboardTooltipProps &
  TooltipProps<number, string> & {
    payload?: RechartsTooltipPayload[];
    label?: string | number;
    active?: boolean;
  };

export function DashboardTooltip({
  active,
  payload,
  label,
  unit,
  total,
  methodNote,
}: InternalProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg border border-ln-line bg-ln-card shadow-md px-3 py-2 text-xs text-ln-ink min-w-[120px] max-w-[240px]"
      role="tooltip"
    >
      {/* Período */}
      {label !== undefined && label !== null && (
        <p className="font-semibold text-ln-ink-2 mb-1 text-[11px]">{String(label)}</p>
      )}

      {/* Series */}
      {payload.map((entry, i) => {
        const val = entry.value ?? 0;
        const pct = total && total > 0 ? ((val / total) * 100).toFixed(1) : null;
        const seriesName = entry.name ?? "Valor";

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: recharts payload entries are positional
            key={i}
            className="flex flex-col gap-0.5 mb-1 last:mb-0"
          >
            <span className="flex items-center gap-1.5">
              {entry.color && (
                <span
                  className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                />
              )}
              <span className="text-ln-ink-2 truncate">{seriesName}</span>
            </span>
            <span className="tabular-nums font-semibold text-ln-ink ml-3.5">
              {val.toLocaleString("es-AR")}
              {unit && <span className="font-normal text-ln-ink-3 ml-1">{unit}</span>}
              {pct !== null && <span className="font-normal text-ln-ink-3 ml-1">({pct}%)</span>}
            </span>
          </div>
        );
      })}

      {/* Nota metodológica */}
      {methodNote && (
        <p className="mt-1.5 text-[10px] text-ln-op-mute italic leading-snug border-t border-ln-line pt-1">
          {methodNote}
        </p>
      )}
    </div>
  );
}
