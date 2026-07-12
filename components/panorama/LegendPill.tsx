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
  /**
   * Round-3 QA fix 6: low/high endpoint labels flanking the ramp (e.g. "0%" /
   * "70% meta") — so "what does dark mean" is answerable WITHOUT expanding.
   * Null when there is no ramp to anchor (bivariate mode, or no classed fill).
   */
  rampEndpoints?: { min: string; max: string } | null;
  /**
   * Round-3 QA fix 6: the graduated/points size hint — small vs large bubble
   * radii (px, as rendered on the map) + their value labels. These encodings
   * paint no ramp at all, so without this the collapsed pill offered no scale
   * cue beyond a bare color dot.
   */
  graduatedHint?: {
    small: { r: number; label: string };
    large: { r: number; label: string };
  } | null;
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

export function LegendPill({
  baseLabel,
  rampColors,
  bivariate,
  layerDots,
  rampEndpoints = null,
  graduatedHint = null,
  children,
}: Props) {
  return (
    <OverlayDisclosure
      side="up"
      panelClassName="left-0 max-h-[55vh] w-[19rem] overflow-y-auto"
      summaryClassName="flex max-w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-full border border-ln-op-line bg-ln-op-card px-3.5 py-1.5 text-[var(--text-sm)] text-ln-op-ink-2 shadow-md hover:border-ln-op-celeste"
      summary={
        <>
          {/* min-w-0 + truncate: a long metric name ellipsizes instead of hard-
              clipping the whole strip (the trailing ramp / k-anon pill / caret
              stay pinned via shrink-0) — legend-truncation fix, PO round-2 QA. */}
          <span className="min-w-0 flex-shrink truncate font-semibold">{baseLabel}</span>
          {bivariate && (
            // Round-3 QA fix 6: the 3×3 hint already existed; add the two axis
            // labels micro-captioned so the collapsed strip names WHAT the
            // matrix crosses, not just that it is a matrix.
            <span className="inline-flex shrink-0 items-center gap-1">
              <BivariateHint />
              <span className="text-[10px] leading-none text-ln-op-faint">cobertura × señal</span>
            </span>
          )}
          {rampColors !== null && rampColors.length > 0 && (
            // Round-3 QA fix 6: min/max endpoint labels flank the ramp so the
            // collapsed pill answers "what does dark mean" without expanding.
            <span className="inline-flex shrink-0 items-center gap-1">
              {rampEndpoints && (
                <span className="text-[10px] tabular-nums leading-none text-ln-op-faint">
                  {rampEndpoints.min}
                </span>
              )}
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
              {rampEndpoints && (
                <span className="text-[10px] tabular-nums leading-none text-ln-op-faint">
                  {rampEndpoints.max}
                </span>
              )}
            </span>
          )}
          {graduatedHint && (
            // Round-3 QA fix 6: graduated/points had NO collapsed scale at all
            // (only a color dot) — the biggest gap the QA doc named. A compact
            // small●–large● step hint with the real bin labels.
            <span
              className="inline-flex shrink-0 items-center gap-1"
              title="Tamaño del punto ∝ cantidad de eventos por unidad"
            >
              <span
                aria-hidden="true"
                className="inline-block shrink-0 rounded-full border border-ln-op-line-2 bg-ln-op-azul/20"
                style={{ width: 4, height: 4 }}
              />
              <span className="text-[10px] tabular-nums leading-none text-ln-op-faint">
                {graduatedHint.small.label}
              </span>
              <span aria-hidden="true" className="text-[10px] leading-none text-ln-op-faint">
                –
              </span>
              <span
                aria-hidden="true"
                className="inline-block shrink-0 rounded-full border border-ln-op-line-2 bg-ln-op-azul/20"
                style={{ width: 10, height: 10 }}
              />
              <span className="text-[10px] tabular-nums leading-none text-ln-op-faint">
                {graduatedHint.large.label}
              </span>
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
