"use client";

// PanoramaDataTable — panorama-ia-v2 §3.3, the accessible ("Ley 26.653") view,
// and — since the ranking one-list consolidation (PO: "consistente a morir") —
// the DEFAULT (and only) rendering of the "Ranking de unidades" dock section.
//
// A real, sortable <table role="table"> with NO WebGL: the screen-reader path to
// the SAME data the map plots, with header cells that NAME every column
// (Jurisdicción / <métrica> / Brecha vs meta). The map's aria-label is only a
// point count; this table is where assistive tech (and keyboard users) actually
// read the values.
//
// It carries the map linkage the retired headerless list used to own: rows are
// hover-synced with the map (onHover bubbles the unit key up; the console mirrors
// it to the map's feature-state) and aria-current marks the map→row highlight.
//
// Same projection as the map (RankedUnit rows). Suppressed cells never reach here
// — the ranking upstream drops them (privacy invariant §5.1); the console renders
// the k-anon suppressed-count line beneath this table.

import { useId, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import type { RankedUnit, RankingKind } from "@/src/modules/panorama/domain/ranking";

type SortKey = "label" | "value" | "gap";
type SortDir = "asc" | "desc";

type Props = {
  rows: RankedUnit[];
  kind: RankingKind;
  /** es-AR label of the ranked measure, used in the heading + the value column header. */
  measureLabel: string;
  onSelect?: (key: string) => void;
  /**
   * trust/safety invariant (2026-07-10): the base layer produced NO data, so an
   * empty table must not read as "sin jurisdicciones bajo meta". Mirrors
   * RankedUnitsPanel.dataUnavailable so both views of the same projection stay
   * honest in lockstep.
   */
  dataUnavailable?: boolean;
  /** The unit key currently highlighted on the map (hover sync), or null. */
  highlightedKey?: string | null;
  /** Fired on row hover/focus (key) and blur/leave (null) — mirrors to the map. */
  onHover?: (key: string | null) => void;
  /**
   * Small-scope fallback (Cowork QA ronda 3 §4, P2.5): true when the scope holds
   * fewer than a full Worst-N of units, so `rows` is EVERY in-scope unit ordered
   * by the metric (not a "worst 10"). Reframes the heading from "Peores N" to
   * "Tus N {unitNoun}".
   */
  scopeFallback?: boolean;
  /** es-AR plural unit noun for the fallback heading (comunas/localidades/…). */
  unitNoun?: string;
};

const ariaSort = (active: boolean, dir: SortDir): "ascending" | "descending" | "none" =>
  active ? (dir === "asc" ? "ascending" : "descending") : "none";

/** Capitalize the first letter so a lower-case measure reads as a column header. */
const asHeader = (label: string): string =>
  label.length === 0 ? label : label.charAt(0).toUpperCase() + label.slice(1);

export function PanoramaDataTable({
  rows,
  kind,
  measureLabel,
  onSelect,
  dataUnavailable = false,
  highlightedKey = null,
  onHover,
  scopeFallback = false,
  unitNoun = "jurisdicciones",
}: Props) {
  // Default: worst first — rate by gap desc, density by value desc.
  const [sortKey, setSortKey] = useState<SortKey>(kind === "rate" ? "gap" : "value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const headingId = useId();

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "label") cmp = a.label.localeCompare(b.label, "es");
      else if (sortKey === "gap") cmp = (a.gap ?? 0) - (b.gap ?? 0);
      else cmp = a.value - b.value;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const header = (key: SortKey, label: string) => {
    const active = sortKey === key;
    return (
      <th scope="col" aria-sort={ariaSort(active, sortDir)} className="px-2 py-1 text-left">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 font-bold text-ln-op-ink-2 hover:text-ln-op-ink"
        >
          {label}
          <span aria-hidden="true" className="text-ln-op-mute">
            {active && (
              <Icon name={sortDir === "asc" ? "chevron-up" : "chevron-down"} size="sm" decorative />
            )}
          </span>
        </button>
      </th>
    );
  };

  // P2.5: name the ranking framing + metric in the heading so "peores en qué" is
  // answerable at a glance (Cowork H8). Small scope → "Tus N {unitNoun} · métrica";
  // else "Peores N · métrica". Mirrors the retired RankedUnitsPanel heading.
  const heading = scopeFallback
    ? `Tus ${rows.length} ${unitNoun} · ${measureLabel}`
    : `Peores ${rows.length > 0 ? rows.length : 10} · ${measureLabel}`;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        {heading}
      </h3>
      {rows.length === 0 ? (
        dataUnavailable ? (
          // trust/safety invariant: no data loaded — never claim "sin
          // jurisdicciones bajo meta" (all-clear) when we simply have nothing.
          <p className="text-xs leading-snug text-ln-op-warn">
            No pudimos calcular el ranking en este momento.
          </p>
        ) : (
          <p className="text-xs leading-snug text-ln-op-mute">
            {kind === "rate"
              ? "Sin jurisdicciones bajo meta en este alcance."
              : "Sin datos suficientes en este alcance."}
          </p>
        )
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Datos de {measureLabel} por jurisdicción (vista accesible, ordenable).
          </caption>
          <thead>
            <tr className="border-b border-ln-op-line text-xs uppercase tracking-[0.08em]">
              {header("label", "Jurisdicción")}
              {header("value", asHeader(measureLabel))}
              {kind === "rate" && header("gap", "Brecha vs meta")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const highlighted = row.key === highlightedKey;
              return (
                <tr
                  key={row.key}
                  aria-current={highlighted ? "true" : undefined}
                  onMouseEnter={() => onHover?.(row.key)}
                  onMouseLeave={() => onHover?.(null)}
                  className={`border-b border-ln-op-line/50 transition-colors ${
                    highlighted ? "bg-ln-op-line/50" : ""
                  }`}
                >
                  <th scope="row" className="px-2 py-1 text-left font-normal text-ln-op-ink">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(row.key)}
                        onFocus={() => onHover?.(row.key)}
                        onBlur={() => onHover?.(null)}
                        className="text-left underline-offset-2 hover:underline"
                      >
                        {row.label}
                      </button>
                    ) : (
                      row.label
                    )}
                  </th>
                  <td className="px-2 py-1 tabular-nums text-ln-op-ink-2">
                    {kind === "rate" ? `${Math.round(row.value)}%` : row.value}
                  </td>
                  {kind === "rate" && (
                    <td className="px-2 py-1 tabular-nums text-ln-op-warn">
                      {row.gap !== null ? `−${Math.round(row.gap)}` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
