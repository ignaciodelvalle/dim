"use client";

// PanoramaDataTable — panorama-ia-v2 §3.3, the accessible ("Ley 26.653") view.
//
// A real, sortable <table role="table"> with NO WebGL: the screen-reader path
// to the SAME data the map plots, and a legal accessibility requirement for the
// government handoff. The map's aria-label is only a point count; this table is
// where assistive tech (and keyboard users) actually read the values.
//
// Same projection as the map (RankedUnit rows). Suppressed cells never reach
// here — the ranking upstream drops them (privacy invariant §5.1).

import { useMemo, useState } from "react";

import type { RankedUnit, RankingKind } from "@/src/modules/panorama/domain/ranking";

type SortKey = "label" | "value" | "gap";
type SortDir = "asc" | "desc";

type Props = {
  rows: RankedUnit[];
  kind: RankingKind;
  /** es-AR label of the ranked measure, used in the value column header. */
  measureLabel: string;
  onSelect?: (key: string) => void;
  /**
   * trust/safety invariant (2026-07-10): the base layer produced NO data, so an
   * empty table must not read as "sin jurisdicciones bajo meta". Mirrors
   * RankedUnitsPanel.dataUnavailable so both views of the same projection stay
   * honest in lockstep.
   */
  dataUnavailable?: boolean;
};

const ariaSort = (active: boolean, dir: SortDir): "ascending" | "descending" | "none" =>
  active ? (dir === "asc" ? "ascending" : "descending") : "none";

export function PanoramaDataTable({
  rows,
  kind,
  measureLabel,
  onSelect,
  dataUnavailable = false,
}: Props) {
  // Default: worst first — rate by gap desc, density by value desc.
  const [sortKey, setSortKey] = useState<SortKey>(kind === "rate" ? "gap" : "value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
            {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
          </span>
        </button>
      </th>
    );
  };

  if (rows.length === 0) {
    if (dataUnavailable) {
      return (
        <p className="text-xs leading-snug text-ln-op-warn">
          No pudimos calcular el ranking en este momento.
        </p>
      );
    }
    return (
      <p className="text-xs leading-snug text-ln-op-mute">
        {kind === "rate"
          ? "Sin jurisdicciones bajo meta en este alcance."
          : "Sin datos suficientes en este alcance."}
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">
        Datos de {measureLabel} por jurisdicción (vista accesible, ordenable).
      </caption>
      <thead>
        <tr className="border-b border-ln-op-line text-xs uppercase tracking-[0.08em]">
          {header("label", "Jurisdicción")}
          {header("value", kind === "rate" ? "Cobertura" : "Eventos")}
          {kind === "rate" && header("gap", "Brecha vs meta")}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.key} className="border-b border-ln-op-line/50">
            <th scope="row" className="px-2 py-1 text-left font-normal text-ln-op-ink">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(row.key)}
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
        ))}
      </tbody>
    </table>
  );
}
