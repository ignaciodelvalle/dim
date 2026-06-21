"use client";

// AggregationToggle — the U5 granularity control: "Provincia / Localidad".
//
// IMPORTANT (spec §U5): this is the AGGREGATION AXIS, NOT the scope filter. The
// JurisdictionSwitcher above narrows WHAT the operator sees (province/locality
// scope); this control changes HOW the choropleth layers are aggregated and
// rendered:
//   - Provincia → coropleta rellena sobre los polígonos de provincia.
//   - Localidad → símbolos graduados en el centroide de cada localidad.
// Point layers ignore it. The label + help text make the distinction explicit so
// it is never confused with the scope filter.

import type { AggregationLevel } from "@/src/modules/panorama/domain/types";

type Props = {
  /** Active aggregation level. */
  level: AggregationLevel;
  /** Switch the aggregation axis. */
  onChange: (next: AggregationLevel) => void;
  /** True when at least one choropleth layer is active (the toggle has effect).
   * When false the control is shown but flagged as having no current effect. */
  relevant?: boolean;
};

const OPTIONS: ReadonlyArray<{ value: AggregationLevel; label: string }> = [
  { value: "province", label: "Provincia" },
  { value: "locality", label: "Localidad" },
];

export function AggregationToggle({ level, onChange, relevant = true }: Props) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Agregación
      </legend>
      {/* Segmented control. Following the repo convention (PeriodPicker): each
          option is a <button> with aria-pressed, grouped under an aria-label. */}
      <div
        className="inline-flex w-full rounded-[6px] border border-ln-op-line bg-ln-op-card p-0.5"
        aria-label="Eje de agregación del mapa (provincia o localidad)"
      >
        {OPTIONS.map((opt) => {
          const active = level === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={`flex-1 rounded-[4px] px-2 py-1 text-[12px] font-medium transition-colors ${
                active ? "bg-ln-op-azul text-white" : "text-ln-op-ink-2 hover:bg-ln-op-line/40"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] leading-snug text-ln-op-mute">
        Cómo se agregan las capas de superficie (cobertura, mortalidad). Es distinto del filtro de
        alcance de arriba.
        {!relevant && (
          <span className="mt-0.5 block text-ln-op-mute/80">
            Activá una capa de superficie para ver el efecto.
          </span>
        )}
      </p>
    </fieldset>
  );
}
