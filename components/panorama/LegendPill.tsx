"use client";

// LegendPill — the v2C single-line legend overlay (bottom-left, above the
// dock bar): one pill with the base-metric label, the 5-cell classed ramp,
// one dot per active point layer, and the ALWAYS-VISIBLE k-anon pill
// («⊘ k<5 protegido» — privacy visible, spec no-negociable #1). Clicking
// expands the FULL reading (the real MapLegends blocks + captions + honesty
// notices) in a panel that opens upward — plan note: the compact strip is the
// overlay; the full legend is one click away.

import type { ReactNode } from "react";

import { OverlayDisclosure } from "@/components/panorama/OverlayDisclosure";

type Props = {
  /** Label of the metric painting the map ("Eventos por unidad", layer label…). */
  baseLabel: string;
  /** The classed ramp actually painted (class colors, low→high), or null. */
  rampColors: readonly string[] | null;
  /** One dot per active point layer (its registry color + label). */
  layerDots: ReadonlyArray<{ color: string; label: string }>;
  /** The expanded full reading (MapLegends + captions + notices). */
  children: ReactNode;
};

export function LegendPill({ baseLabel, rampColors, layerDots, children }: Props) {
  return (
    <OverlayDisclosure
      side="up"
      panelClassName="left-0 max-h-[55vh] w-[19rem] overflow-y-auto"
      summaryClassName="flex max-w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-full border border-ln-op-line bg-ln-op-card/95 px-3.5 py-1.5 text-[var(--text-sm)] text-ln-op-ink-2 shadow-sm hover:border-ln-op-celeste"
      summary={
        <>
          <span className="font-semibold">{baseLabel}</span>
          {rampColors !== null && rampColors.length > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex overflow-hidden rounded-[var(--radius-xs)] border border-ln-op-line-2"
            >
              {rampColors.map((color) => (
                <span
                  // Classed ramp colors are distinct stops (class-scale.ts
                  // samples without repeats), so the color IS the identity.
                  key={color}
                  className="block h-2 w-3.5"
                  style={{ background: color }}
                />
              ))}
            </span>
          )}
          {layerDots.map((dot) => (
            <span key={dot.label} className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full border border-ln-op-line"
                style={{ background: dot.color }}
              />
              <span className="max-w-24 truncate text-[var(--text-xs)]">{dot.label}</span>
            </span>
          ))}
          {/* k-anon pill — NEVER hidden (suppression stays visible on the
              collapsed strip; the expanded panel carries the full notice). */}
          <span
            className="rounded-full border border-ln-op-line px-2 py-0.5 text-[var(--text-xs)] text-ln-op-mute"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--color-ln-op-stripe) 0 3px, var(--color-ln-op-line-2) 3px 6px)",
            }}
            title="Unidades con menos de 5 casos: valor suprimido por k-anonimato (Ley 25.326)"
          >
            ⊘ k&lt;5 protegido
          </span>
          <span aria-hidden="true" className="text-[var(--text-xs)] text-ln-op-faint">
            ▴
          </span>
        </>
      }
    >
      {children}
    </OverlayDisclosure>
  );
}
