"use client";

// MapDataTable — the accessible ("Ley 26.653") table view of the situational
// MAP's active layers, per administrative unit.
//
// The map is the LEAST accessible surface: a WebGL canvas whose aria-label is
// only a point count. The right-rail RankedUnitsPanel/PanoramaDataTable already
// tabulate the single RANKED base layer; this table instead mirrors EVERY active
// aggregate layer's per-unit value the map is painting, right next to the map,
// so a screen-reader or keyboard user reads the same numbers — plus a client-side
// CSV download (no new endpoint; a <a download> over an in-memory Blob).
//
// PRIVACY (invariant §5): a k-anon-suppressed cell renders "Protegido (k<5)",
// NEVER a number — the same trichotomy the map legend and pinned popup keep.
//
// English identifiers, es-AR user copy (project invariant #4).

import { useEffect, useMemo, useState } from "react";

/** One per-unit cell of an active layer, as the table (and CSV) render it. */
export type MapTableRow = {
  /** Layer name — disambiguates a multi-layer table. */
  layer: string;
  /** Administrative unit name (province / locality / department). */
  unit: string;
  /**
   * The value WITH its unit ("64,4 %" | "1.234"), or the protected/no-data text.
   * `protected` cells carry "Protegido (k<5)" here — never a number.
   */
  value: string;
};

/** Descriptor of one active aggregate metric — used to NAME the "Valor" column
 * after the metric it actually shows (and its true unit). */
export type ValueMetric = {
  /** Layer label — matches MapTableRow.layer so a row's metric can be looked up. */
  label: string;
  dataType?: "rate" | "density" | "signal" | "reference";
  level?: "province" | "locality";
};

/**
 * Name the "Valor" column after the SINGLE contributing metric + its true unit,
 * or a generic "Valor" when several metrics interleave (the Capa column
 * disambiguates them and each cell already carries its own unit).
 *
 * DATA-TRUTH (cowork QA ronda 3 §3): a `rate` metric is a percentage ONLY at
 * province grain. At locality grain the repository returns a per-unit COUNT
 * (rate-by-locality is deferred — repository.ts "V1 LIMITATION"), so the header
 * says "(conteo)", never a false "%". Density/signal metrics are counts too.
 */
export function mapTableValueHeader(metrics: ValueMetric[]): string {
  if (metrics.length !== 1) return "Valor";
  const [m] = metrics;
  if (m.dataType === "rate") {
    return m.level === "province" ? `${m.label} (%)` : `${m.label} (conteo)`;
  }
  return `${m.label} (conteo)`;
}

const CSV_HEADER = ["Capa", "Unidad", "Valor"] as const;

/** Escape one CSV field: wrap in quotes and double any embedded quote when the
 * field contains a comma, quote, or newline (RFC 4180). */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Build the CSV text (header + rows) for the map table. Pure — unit-tested.
 *
 * DATA-TRUTH: a layer whose server fetch hit the 2000-row cap must NOT export
 * looking complete — `truncatedLayers` (labels of capped layers) appends one
 * `#`-comment line per capped layer so the self-contained file carries the
 * same disclosure the on-screen layer panel shows.
 */
export function buildMapTableCsv(rows: MapTableRow[], truncatedLayers: string[] = []): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push([csvField(r.layer), csvField(r.unit), csvField(r.value)].join(","));
  }
  for (const label of truncatedLayers) {
    lines.push(`# Capa ${label} truncada: mostrando los 2000 registros más recientes`);
  }
  return lines.join("\r\n");
}

type Props = {
  rows: MapTableRow[];
  /** es-AR table caption naming the active scope + period (auditable context). */
  caption: string;
  /** CSV download filename (without extension). */
  filename: string;
  /**
   * Active aggregate metrics (label + dataType + level) — lets the table NAME the
   * "Valor" column after the metric it shows and its true unit. Absent → the
   * column keeps the generic "Valor" header (backward compatible).
   */
  metrics?: ValueMetric[];
  /**
   * Labels of active layers whose fetch hit the server row cap (2000) — the
   * CSV export appends a per-layer truncation comment so a capped layer never
   * exports looking complete. Absent/empty → no comment lines.
   */
  truncatedLayers?: string[];
};

/**
 * Build the map table's CSV as an in-memory Blob URL (same-origin — the strict
 * CSP allows it; no network, no endpoint). Rebuilt when the rows change;
 * revoked on unmount / rebuild so the object URL never leaks. Exported so the
 * v2C dock bar's "Exportar CSV" action shares the exact same artifact as the
 * Registros pane's download link (one CSV builder, two affordances).
 */
export function useMapTableCsvHref(
  rows: MapTableRow[],
  truncatedLayers: string[] = [],
): string | null {
  const csv = useMemo(() => buildMapTableCsv(rows, truncatedLayers), [rows, truncatedLayers]);
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || rows.length === 0) {
      setHref(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    setHref(url);
    return () => URL.revokeObjectURL(url);
  }, [csv, rows.length]);
  return href;
}

export function MapDataTable({ rows, caption, filename, metrics, truncatedLayers }: Props) {
  const href = useMapTableCsvHref(rows, truncatedLayers);
  // Round-2 review #3a: the Capa column repeats the SAME value on every row
  // when a single layer is active — zero information, pure noise. Derive the
  // count straight from the rows already in scope (no new prop): when 2+
  // distinct layers actually produced rows, Capa disambiguates them and stays;
  // with exactly one, drop the column (the CSV export keeps Capa regardless —
  // a self-contained file has no adjacent context to lean on).
  const rowLabels = useMemo(() => new Set(rows.map((r) => r.layer)), [rows]);
  const showLayerColumn = rowLabels.size > 1;
  // Cowork QA ronda 3 §3: the "Valor" column never named its metric — with a
  // single metric in view, name it (and its true unit) so "204" is not read as a
  // bare, unlabeled number. With several metrics the Capa column already
  // disambiguates, so the column stays a generic "Valor".
  const valueHeader = useMemo(() => {
    if (rowLabels.size !== 1 || !metrics) return "Valor";
    const [only] = rowLabels;
    const metric = metrics.find((m) => m.label === only);
    return metric ? mapTableValueHeader([metric]) : "Valor";
  }, [rowLabels, metrics]);

  if (rows.length === 0) {
    return (
      <p className="text-xs leading-snug text-ln-op-mute">
        Sin datos por unidad para las capas activas en este alcance.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ln-op-mute">{rows.length} filas</p>
        {href !== null && (
          <a
            href={href}
            download={`${filename}.csv`}
            className="rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2 py-0.5 text-xs font-medium text-ln-op-ink-2 hover:border-ln-op-azul/40"
          >
            Descargar CSV
          </a>
        )}
      </div>
      <div className="max-h-80 overflow-auto rounded-[var(--radius-md)] border border-ln-op-line">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-ln-op-card">
            <tr className="border-b border-ln-op-line text-xs uppercase tracking-[0.08em]">
              {showLayerColumn && (
                <th scope="col" className="px-2 py-1 text-left font-bold text-ln-op-ink-2">
                  Capa
                </th>
              )}
              <th scope="col" className="px-2 py-1 text-left font-bold text-ln-op-ink-2">
                Unidad
              </th>
              <th scope="col" className="px-2 py-1 text-right font-bold text-ln-op-ink-2">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                // Rows can repeat (layer, unit) across levels; index keeps keys
                // stable for this read-only projection.
                key={`${row.layer} ${row.unit} ${i}`}
                className="border-b border-ln-op-line/50"
              >
                {showLayerColumn && <td className="px-2 py-1 text-ln-op-ink-2">{row.layer}</td>}
                <th scope="row" className="px-2 py-1 text-left font-normal text-ln-op-ink">
                  {row.unit}
                </th>
                <td className="px-2 py-1 text-right tabular-nums text-ln-op-ink-2">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
