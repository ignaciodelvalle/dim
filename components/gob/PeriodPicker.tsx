"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DateRangePicker } from "./DateRangePicker";
import type { DateRange } from "./DateRangePicker";

/**
 * Selector de período para dashboards.
 *
 * Chips de presets (7d / 30d / 90d / ytd) + toggle "Personalizado" que despliega
 * el `<DateRangePicker>` inline. Cada selección actualiza los searchParams vía
 * `router.replace` con `scroll: false`.
 *
 * Comportamiento:
 *  - Seleccionar un preset → setea `?period=<preset>` y limpia `?from` y `?to`.
 *  - Seleccionar "Personalizado" → setea `?period=custom`. El DateRangePicker
 *    aparece; al completar el rango setea `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 *  - El chip activo queda visualmente destacado (fondo ln-azul / texto blanco).
 *
 * Accesibilidad:
 *  - Cada chip es un `<button>` con `aria-pressed` para indicar el estado activo.
 *  - Focus ring visible en todos los chips (global focus ring de globals.css).
 *  - El DateRangePicker ya provee labels propios via htmlFor.
 *
 * @example
 * ```tsx
 * <PeriodPicker defaultPreset="30d" />
 * ```
 */

export type PeriodPreset = "7d" | "30d" | "90d" | "ytd" | "trailing12m" | "3y" | "5y" | "custom";

export type PeriodPickerProps = {
  /** Preset por defecto cuando no hay searchParam. Default "30d". */
  defaultPreset?: PeriodPreset;
  /** Clave del searchParam para el preset. Default "period". */
  presetParamKey?: string;
  /** Claves de searchParam para el rango personalizado. Default { from: "from", to: "to" }. */
  customParamKeys?: { from: string; to: string };
  /**
   * Mostrar los chips multi-año ("3 años" / "5 años"). Solo lo usa el Panorama,
   * cuya reproducción temporal abarca la historia sembrada (varios años). Los
   * dashboards de detalle NO los muestran (mantienen su ventana corta). Default false.
   */
  multiYear?: boolean;
  className?: string;
};

type PresetConfig = {
  value: PeriodPreset;
  label: string;
};

const PRESETS: PresetConfig[] = [
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "trailing12m", label: "Últimos 12 meses" },
  { value: "ytd", label: "Año en curso" },
];

/** Multi-year chips appended only when `multiYear` is set (Panorama-only). */
const MULTI_YEAR_PRESETS: PresetConfig[] = [
  { value: "3y", label: "3 años" },
  { value: "5y", label: "5 años" },
];

const chipBase =
  "inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium border " +
  "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-azul focus-visible:ring-offset-1 " +
  "min-h-11 cursor-pointer";

const chipActive = "bg-ln-azul text-white border-ln-azul";
const chipInactive =
  "bg-ln-card text-ln-ink-2 border-ln-line hover:border-ln-line-strong hover:text-ln-ink";

export function PeriodPicker({
  defaultPreset = "30d",
  presetParamKey = "period",
  customParamKeys = { from: "from", to: "to" },
  multiYear = false,
  className = "",
}: PeriodPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const presets = multiYear ? [...PRESETS, ...MULTI_YEAR_PRESETS] : PRESETS;

  const activePreset = (searchParams.get(presetParamKey) as PeriodPreset | null) ?? defaultPreset;

  const fromValue = searchParams.get(customParamKeys.from) ?? null;
  const toValue = searchParams.get(customParamKeys.to) ?? null;

  // Estado local del DateRangePicker (controlled).
  const [customRange, setCustomRange] = useState<DateRange>({
    from: fromValue,
    to: toValue,
  });

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function handlePresetClick(preset: PeriodPreset) {
    setCustomRange({ from: null, to: null });
    updateParams({
      [presetParamKey]: preset,
      [customParamKeys.from]: null,
      [customParamKeys.to]: null,
    });
  }

  function handleCustomRangeChange(range: DateRange) {
    setCustomRange(range);
    // Solo persistimos cuando ambos extremos están definidos.
    if (range.from && range.to) {
      updateParams({
        [presetParamKey]: "custom",
        [customParamKeys.from]: range.from,
        [customParamKeys.to]: range.to,
      });
    }
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {/* Fila de chips */}
      <fieldset className="flex flex-wrap gap-2 border-none p-0 m-0">
        <legend className="sr-only">Seleccionar período</legend>
        {presets.map(({ value, label }) => {
          const isActive = activePreset === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => handlePresetClick(value)}
              className={`${chipBase} ${isActive ? chipActive : chipInactive}`}
            >
              {label}
            </button>
          );
        })}

        {/* Toggle "Personalizado" */}
        <button
          type="button"
          aria-pressed={activePreset === "custom"}
          onClick={() => handlePresetClick("custom")}
          className={`${chipBase} ${activePreset === "custom" ? chipActive : chipInactive}`}
        >
          Personalizado
        </button>
      </fieldset>

      {/* DateRangePicker inline — solo visible cuando preset === "custom" */}
      {activePreset === "custom" && (
        <DateRangePicker value={customRange} onChange={handleCustomRangeChange} />
      )}
    </div>
  );
}
