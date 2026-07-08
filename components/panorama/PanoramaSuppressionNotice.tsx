"use client";

// PanoramaSuppressionNotice — first-class k-anon disclosure (panorama-redesign
// Fase 1). Promotes the "sin localidad" / suppressed-cell badges out of the
// "Personalizar" details so the operator sees the privacy treatment WITHOUT
// any click.
//
// PRIVACY: this component re-renders the SAME envelope counts LayerPanel
// already shows one click away (suppressedCount / noLocalityCount per layer).
// A count OF suppressed cells is not itself a suppressed value — no k=5 math
// is computed, read, or altered here. Never derives a rate from anything.

import type { LayerPanelState } from "@/components/panorama/LayerPanel";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { LayerId } from "@/src/modules/panorama/domain/types";

type Props = {
  /** Per-layer runtime state owned by PanoramaConsole (same record LayerPanel gets). */
  states: Record<LayerId, LayerPanelState>;
};

type Contribution = { label: string; value: number };

/** Sum `pick` over ACTIVE, non-loading layers, keeping a per-layer breakdown. */
function collect(
  states: Record<LayerId, LayerPanelState>,
  pick: (s: LayerPanelState) => number,
): { total: number; breakdown: Contribution[] } {
  const breakdown: Contribution[] = [];
  let total = 0;
  for (const layer of PANORAMA_LAYERS) {
    const s = states[layer.id];
    if (!s?.active || s.loading) continue;
    const value = pick(s);
    if (value <= 0) continue;
    total += value;
    breakdown.push({ label: layer.label, value });
  }
  return { total, breakdown };
}

function breakdownTitle(breakdown: Contribution[]): string {
  return breakdown.map((b) => `${b.label}: ${b.value.toLocaleString("es-AR")}`).join(" · ");
}

// Pill style mirrors the LayerPanel badges (same tokens, text-only — the
// wording itself is the signal, never color alone).
const PILL_CLASS =
  "inline-flex items-center rounded-full border border-ln-op-line bg-ln-op-card px-2.5 py-1 text-xs text-ln-op-mute";

export function PanoramaSuppressionNotice({ states }: Props) {
  const suppressed = collect(states, (s) => s.suppressedCount);
  const noLocality = collect(states, (s) => s.noLocalityCount ?? 0);

  if (suppressed.total === 0 && noLocality.total === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="note" aria-label="Tratamiento de privacidad">
      {suppressed.total > 0 && (
        <span className={PILL_CLASS} title={breakdownTitle(suppressed.breakdown)}>
          {`${suppressed.total.toLocaleString("es-AR")} celdas con menos de 5 casos ocultas por privacidad (k-anonimato)`}
        </span>
      )}
      {noLocality.total > 0 && (
        <span className={PILL_CLASS} title={breakdownTitle(noLocality.breakdown)}>
          {`${noLocality.total.toLocaleString("es-AR")} registros sin localidad asignada — visibles solo a nivel provincial`}
        </span>
      )}
    </div>
  );
}
