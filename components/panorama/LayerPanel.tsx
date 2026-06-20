"use client";

// LayerPanel — the legend-as-control (spec §4: the layer list IS the legend).
//
// One toggle per layer: a color swatch + label + live feature count, plus a
// "suprimido" badge when k-anon hid cells and a "capá al máximo (2.000)" note
// when the per-layer cap truncated the result. Toggling a layer asks the parent
// to fetch /api/panorama/[layer] (or drop it). The panel is purely
// presentational — fetch + map mutation live in the parent console.

import { PANORAMA_LAYERS, isTemporalLayer } from "@/src/modules/panorama/domain/layers";
import type { LayerId } from "@/src/modules/panorama/domain/types";

/** Per-layer runtime state surfaced in the legend. */
export type LayerPanelState = {
  active: boolean;
  loading: boolean;
  /** Plotted feature count (after privacy filtering). */
  count: number;
  /** k-anon suppressed cell count (choropleth only); 0 otherwise. */
  suppressedCount: number;
  /** The 2.000 per-layer cap clipped the result. */
  truncated: boolean;
};

type Props = {
  states: Record<LayerId, LayerPanelState>;
  onToggle: (id: LayerId) => void;
  /** F4: a time scrub is active — non-temporal layers are flagged not reproducible. */
  scrubbing?: boolean;
};

export function LayerPanel({ states, onToggle, scrubbing = false }: Props) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Capas
      </legend>
      <ul className="space-y-1">
        {PANORAMA_LAYERS.map((layer) => {
          const st = states[layer.id];
          const active = st?.active ?? false;
          // Under a scrub, layers with no time dimension can't be reproduced
          // as-of-t — flag and visually de-emphasise them in the legend.
          const notReproducible = scrubbing && !isTemporalLayer(layer.id);
          return (
            <li key={layer.id}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-[6px] px-1.5 py-1 text-[12px] text-ln-op-ink-2 hover:bg-ln-op-card ${
                  notReproducible ? "opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-current"
                  checked={active}
                  onChange={() => onToggle(layer.id)}
                />
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full border border-ln-op-line"
                  style={{ background: layer.color }}
                  aria-hidden="true"
                />
                <span className="flex-1">{layer.label}</span>
                {notReproducible && (
                  <span
                    className="rounded-full border border-ln-op-line bg-ln-op-card px-1.5 py-0.5 text-[10px] text-ln-op-mute"
                    title="Esta capa no tiene dimensión temporal: muestra el estado actual, no reproducible en el tiempo."
                  >
                    no reproducible en el tiempo
                  </span>
                )}
                {st?.loading && (
                  <span className="text-[11px] text-ln-op-mute" aria-live="polite">
                    cargando…
                  </span>
                )}
                {active && !st?.loading && (
                  <span className="tabular-nums text-[11px] text-ln-op-mute">
                    {st.count.toLocaleString("es-AR")}
                  </span>
                )}
                {active && !st?.loading && st.suppressedCount > 0 && (
                  <span
                    className="rounded-full border border-ln-op-line bg-ln-op-card px-1.5 py-0.5 text-[10px] text-ln-op-mute"
                    title="Celdas ocultas por privacidad (k-anonimato, k=5)"
                  >
                    {st.suppressedCount} suprimido{st.suppressedCount === 1 ? "" : "s"}
                  </span>
                )}
                {active && !st?.loading && st.truncated && (
                  <span
                    className="rounded-full border border-ln-op-warn-bd bg-ln-op-warn-bg px-1.5 py-0.5 text-[10px] text-ln-op-ink-2"
                    title="Se alcanzó el tope por capa; hay más registros fuera de la vista."
                  >
                    capá al máximo (2.000)
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
