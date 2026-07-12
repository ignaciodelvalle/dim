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
  /**
   * H10 (cowork QA): the map is in BIVARIATE mode (a 3×3 matrix, not a sequential
   * ramp). When true the collapsed strip shows an honest 3×3 matrix hint instead
   * of a ramp — the caller must ALSO pass `rampColors={null}` so no ramp competes
   * with the hint. The full 3×3 reading lives in the expanded `children`.
   */
  bivariate?: boolean;
  /** One dot per active point layer (its registry color + label). */
  layerDots: ReadonlyArray<{ color: string; label: string }>;
  /** The expanded full reading (MapLegends + captions + notices). */
  children: ReactNode;
};

/**
 * Collapsed bivariate cue: a 3×3 grid whose fill deepens toward the high×high
 * (risk) corner — a recognizable matrix glyph, so the strip never implies a
 * sequential ramp in bivariate mode. Purely decorative (the expanded panel
 * carries the real legend + method), hence aria-hidden.
 */
function BivariateHint() {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-xs)] border border-ln-op-line-2"
      title="Mapa bivariado (matriz 3×3): tocá para leer la escala."
    >
      {[0.15, 0.3, 0.5, 0.3, 0.5, 0.7, 0.5, 0.7, 0.95].map((alpha, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 9-cell positional matrix — index IS the stable identity.
          key={`biv-${i}`}
          className="block h-2 w-2"
          style={{
            backgroundColor: `color-mix(in srgb, var(--color-ln-op-azul) ${alpha * 100}%, transparent)`,
          }}
        />
      ))}
    </span>
  );
}

export function LegendPill({ baseLabel, rampColors, bivariate, layerDots, children }: Props) {
  return (
    <OverlayDisclosure
      side="up"
      panelClassName="left-0 max-h-[55vh] w-[19rem] overflow-y-auto"
      summaryClassName="flex max-w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-full border border-ln-op-line bg-ln-op-card/95 px-3.5 py-1.5 text-[var(--text-sm)] text-ln-op-ink-2 shadow-sm hover:border-ln-op-celeste"
      summary={
        <>
          {/* min-w-0 + truncate: a long metric name ellipsizes instead of hard-
              clipping the whole strip (the trailing ramp / k-anon pill / caret
              stay pinned via shrink-0) — legend-truncation fix, PO round-2 QA. */}
          <span className="min-w-0 flex-shrink truncate font-semibold">{baseLabel}</span>
          {bivariate && <BivariateHint />}
          {rampColors !== null && rampColors.length > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 overflow-hidden rounded-[var(--radius-xs)] border border-ln-op-line-2"
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
            <span key={dot.label} className="inline-flex shrink-0 items-center gap-1">
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
            className="shrink-0 rounded-full border border-ln-op-line px-2 py-0.5 text-[var(--text-xs)] text-ln-op-mute"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--color-ln-op-stripe) 0 3px, var(--color-ln-op-line-2) 3px 6px)",
            }}
            title="Unidades con menos de 5 casos: valor suprimido por k-anonimato (Ley 25.326)"
          >
            ⊘ k&lt;5 protegido
          </span>
          <span aria-hidden="true" className="shrink-0 text-[var(--text-xs)] text-ln-op-faint">
            ▴
          </span>
        </>
      }
    >
      {children}
    </OverlayDisclosure>
  );
}
