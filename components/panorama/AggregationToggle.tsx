"use client";

// AggregationToggle — the aggregation-axis control: "Provincia / Localidad".
//
// IMPORTANT: this is the AGGREGATION AXIS, NOT the scope filter. The
// JurisdictionSwitcher above narrows WHAT the operator sees (province/locality
// scope); this control changes HOW all aggregated layers are grouped and rendered:
//   - Provincia → choropleth layers fill province polygons; density+signal point
//     layers (perdidas, mordeduras, denuncias, zoonosis) show one graduated circle
//     per province aggregating all events in that province.
//   - Localidad → choropleth layers show graduated locality centroids; density+signal
//     layers show one graduated circle per locality (k-anon k=5 suppression applies).
// Reference layers (refugios, decomisos) are NOT affected — they always render as
// individual pins because each represents a distinct entity.

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
        Eje de agrupación de todas las capas de eventos (perdidas, denuncias, mordeduras, zoonosis)
        y de superficie (cobertura, mortalidad). Distinto del filtro de alcance de arriba.
        {!relevant && (
          <span className="mt-0.5 block text-ln-op-mute/80">
            Activá una capa de eventos o superficie para ver el efecto.
          </span>
        )}
      </p>
    </fieldset>
  );
}
