// Plain server component — receives pre-fetched rows from the page.

import { Badge, EmptyState } from "@/components/poncho";
import type { OutbreakHistoryRow } from "@/lib/govt-dashboards";

type Props = {
  rows: OutbreakHistoryRow[];
};

export function OutbreakHistoryTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="shield-check"
        title="Sin brotes históricos"
        description="No hay signals de brotes registrados en tu cobertura."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gob-border">
      <table className="min-w-full text-sm">
        <thead className="bg-gob-surface-alt">
          <tr className="text-left text-xs uppercase tracking-wider text-gob-text-gray">
            <th className="px-4 py-2">Enfermedad</th>
            <th className="px-3 py-2">Localidad</th>
            <th className="px-3 py-2">Provincia</th>
            <th className="px-3 py-2">Pico</th>
            <th className="px-3 py-2 text-right">Signals</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-border">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas de histórico sin ID único; posición es suficiente
            <tr key={i}>
              <td className="px-4 py-2">
                <Badge variant="warning">{row.diseaseName}</Badge>
              </td>
              <td className="px-3 py-2 text-gob-text">{row.locality || "—"}</td>
              <td className="px-3 py-2 text-gob-text">{row.province || "—"}</td>
              <td className="px-3 py-2 text-gob-text-gray tabular-nums">
                {new Date(row.peakDate).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gob-text">
                {row.totalSignals}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
