"use client";

// CapasBox — the "Capas" control (panorama-vista-redesign Phase 2, design
// Decision 2). Composes the EXISTING LayerPanel for Detalle mode (unchanged
// compatibility model, blocked-state hints, opacity sliders, "solo firmado"
// sub-checkbox) and adds a "Simple" surface: base chip (non-toggle) + active
// overlay chips (click-to-remove) + a "＋N capas" expander that flips to
// Detalle. Toggles ALWAYS delegate to the parent's onToggle → checkCompatibility
// — Simple is a presentational surface only, never a second compatibility path.

import { LayerPanel, type LayerPanelState } from "@/components/panorama/LayerPanel";
import { type LayerRole, roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { LayerId } from "@/src/modules/panorama/domain/types";

type Props = {
  states: Record<LayerId, LayerPanelState>;
  onToggle: (id: LayerId) => void;
  /** F4: a time scrub is active — non-temporal layers are flagged not reproducible. */
  scrubbing?: boolean;
  /** map-QOL: per-layer opacity multiplier (0.2..1, default 1). */
  opacities?: Partial<Record<LayerId, number>>;
  /** map-QOL: opacity slider change — only rendered for ACTIVE layers. */
  onOpacity?: (id: LayerId, value: number) => void;
  /** task #78 Part 3: the "solo firmado por matrícula" toggle state. */
  verifiedOnly?: boolean;
  /** task #78 Part 3: flip the vet-signed numerator toggle. */
  onToggleVerified?: (id: LayerId) => void;
  /** Simple (false, default) / Detalle (true) — persisted by the parent. */
  capasDetail: boolean;
  onCapasDetailChange: (value: boolean) => void;
};

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[var(--text-sm)]";

function activeIdsOf(states: Props["states"], role: LayerRole): LayerId[] {
  return PANORAMA_LAYERS.filter((l) => roleOf(l) === role && states[l.id]?.active).map((l) => l.id);
}

export function CapasBox({
  states,
  onToggle,
  scrubbing = false,
  opacities = {},
  onOpacity,
  verifiedOnly = false,
  onToggleVerified,
  capasDetail,
  onCapasDetailChange,
}: Props) {
  const activeBaseId = activeIdsOf(states, "base")[0];
  const activeBase = activeBaseId ? PANORAMA_LAYERS.find((l) => l.id === activeBaseId) : undefined;
  const activeOverlayIds = [...activeIdsOf(states, "signal"), ...activeIdsOf(states, "reference")];
  const activeOverlays = activeOverlayIds
    .map((id) => PANORAMA_LAYERS.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => l !== undefined);
  const inactiveCount = PANORAMA_LAYERS.filter((l) => !states[l.id]?.active).length;

  return (
    <section aria-labelledby="capas-box-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3
            id="capas-box-heading"
            className="text-[var(--text-sm)] font-bold uppercase tracking-[0.12em] text-ln-op-mute"
          >
            Capas
          </h3>
          <span className="text-[var(--text-sm)] text-ln-op-faint">
            se suman · compatibles entre sí
          </span>
        </div>
        <fieldset className="m-0 inline-flex overflow-hidden rounded-[var(--radius-md)] border border-ln-op-line p-0">
          <legend className="sr-only">Modo de la sección Capas</legend>
          <button
            type="button"
            aria-pressed={!capasDetail}
            aria-label="Modo simple de capas"
            onClick={() => onCapasDetailChange(false)}
            className={`px-2.5 py-1 text-[var(--text-sm)] font-medium transition-colors ${
              !capasDetail
                ? "bg-ln-op-azul/10 text-ln-op-azul"
                : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            aria-pressed={capasDetail}
            aria-label="Modo detalle de capas"
            onClick={() => onCapasDetailChange(true)}
            className={`px-2.5 py-1 text-[var(--text-sm)] font-medium transition-colors ${
              capasDetail
                ? "bg-ln-op-azul/10 text-ln-op-azul"
                : "bg-ln-op-card text-ln-op-ink-2 hover:bg-ln-op-stripe"
            }`}
          >
            Detalle
          </button>
        </fieldset>
      </div>

      {capasDetail ? (
        <LayerPanel
          states={states}
          onToggle={onToggle}
          scrubbing={scrubbing}
          opacities={opacities}
          onOpacity={onOpacity}
          verifiedOnly={verifiedOnly}
          onToggleVerified={onToggleVerified}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeBase && (
            <span
              className={`${CHIP_BASE} border-ln-op-line bg-ln-op-card text-ln-op-ink-2`}
              title={`${activeBase.label} — base · choropleth`}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-ln-op-line"
                style={{ background: activeBase.color }}
                aria-hidden="true"
              />
              {activeBase.label}
            </span>
          )}
          {activeOverlays.map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => onToggle(layer.id)}
              className={`${CHIP_BASE} border-ln-op-azul/40 bg-ln-op-azul/10 text-ln-op-azul hover:border-ln-op-azul`}
              aria-label={`Quitar la capa ${layer.label}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-ln-op-line"
                style={{ background: layer.color }}
                aria-hidden="true"
              />
              {layer.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => onCapasDetailChange(true)}
              className={`${CHIP_BASE} border-dashed border-ln-op-line bg-ln-op-card text-ln-op-mute hover:border-ln-op-azul/40 hover:text-ln-op-azul`}
            >
              ＋{inactiveCount} capas
            </button>
          )}
        </div>
      )}
    </section>
  );
}
