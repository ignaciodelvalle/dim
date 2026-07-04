"use client";

// RankedUnitsPanel — panorama-ia-v2 §3.3 "Peores N jurisdicciones".
//
// The map collapsed to an ordered list: sometimes the best form is not a chart
// but a ranked table (design §3.3). Each row is hover-synced with the map
// (onHover bubbles the unit key up; the console mirrors it to the map's
// feature-state) and opens the DetailDrawer on click.
//
// Reads the SAME projection as the map (rankWorstUnits over the active layer's
// features). Suppressed cells never appear — the ranking drops them upstream, so
// no rate/count is ever shown for a k-anon cell (privacy invariant §5.1).
//
// No sparkline in P0: we have no per-unit time series yet (Fase 2). Inventing a
// trend would violate the "honest data only" product stance (PO #4) — so the
// row carries the value + gap only.

import type { RankedUnit, RankingKind } from "@/src/modules/panorama/domain/ranking";

type Props = {
  /** Worst-N rows (already ranked + capped by rankWorstUnits). */
  rows: RankedUnit[];
  /** rate → show a "brecha vs meta"; density → show the count. */
  kind: RankingKind;
  /** es-AR label of the ranked measure (e.g. "cobertura antirrábica"). */
  measureLabel: string;
  /** The unit key currently highlighted on the map (hover sync), or null. */
  highlightedKey?: string | null;
  /** Fired on row hover/focus (key) and blur/leave (null). */
  onHover?: (key: string | null) => void;
  /** Fired on row click/Enter — opens the DetailDrawer for that unit. */
  onSelect?: (key: string) => void;
};

/** Format a metric value for display. Rate values are percentages. */
function formatValue(value: number, kind: RankingKind): string {
  return kind === "rate" ? `${Math.round(value)}%` : String(value);
}

export function RankedUnitsPanel({
  rows,
  kind,
  measureLabel,
  highlightedKey = null,
  onHover,
  onSelect,
}: Props) {
  return (
    <section aria-labelledby="pano-worst-title" className="space-y-2">
      <h3
        id="pano-worst-title"
        className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute"
      >
        Peores {rows.length > 0 ? rows.length : 10} jurisdicciones
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs leading-snug text-ln-op-mute">
          {kind === "rate"
            ? "Sin jurisdicciones bajo meta en este alcance."
            : "Sin datos suficientes en este alcance."}
        </p>
      ) : (
        <ol className="space-y-1" aria-label={`Peores jurisdicciones por ${measureLabel}`}>
          {rows.map((row, i) => {
            const highlighted = row.key === highlightedKey;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  aria-current={highlighted ? "true" : undefined}
                  onMouseEnter={() => onHover?.(row.key)}
                  onMouseLeave={() => onHover?.(null)}
                  onFocus={() => onHover?.(row.key)}
                  onBlur={() => onHover?.(null)}
                  onClick={() => onSelect?.(row.key)}
                  className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1 text-left text-sm transition-colors ${
                    highlighted ? "bg-ln-op-line/50" : "hover:bg-ln-op-line/30"
                  }`}
                >
                  <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ln-op-mute">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-ln-op-ink">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-ln-op-ink-2">
                    {formatValue(row.value, kind)}
                  </span>
                  {kind === "rate" && row.gap !== null && (
                    <span
                      className="shrink-0 tabular-nums text-ln-op-warn"
                      aria-label="brecha vs meta"
                    >
                      −{Math.round(row.gap)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
