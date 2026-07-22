// Plain server component -- receives pre-fetched rows from the page.

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpPill } from "@/components/ui/dashboard";
import type { OutbreakHistoryRow } from "@/lib/analytics/govt-dashboards";

type Props = {
  rows: OutbreakHistoryRow[];
};

export function OutbreakHistoryTable({ rows }: Props) {
  if (rows.length === 0) {
    // C4 (2026-07-22, §S4): a historical outbreak row is built from the same
    // signal-reporting pipeline as the live signal panels — "no history"
    // reads as "nothing bad ever happened" when the honest read is "nobody
    // ever reported one". no-signal, not "all clear".
    return (
      <LnEmptyState
        icon="eye-off"
        nature="no-signal"
        title="Sin brotes registrados en MiMAR"
        description="La ausencia de registro no implica ausencia de brotes históricos — depende de que se haya reportado una señal en tu cobertura."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-ln-op-line">
      <table className="min-w-full text-[13px]">
        <caption className="sr-only">
          Historial de brotes por enfermedad, localidad y período
        </caption>
        <thead className="bg-ln-op-stripe">
          <tr className="text-left text-[11px] uppercase tracking-wider text-ln-op-mute">
            <th scope="col" className="px-4 py-2">
              Enfermedad
            </th>
            <th scope="col" className="px-3 py-2">
              Localidad
            </th>
            <th scope="col" className="px-3 py-2">
              Provincia
            </th>
            <th scope="col" className="px-3 py-2">
              Pico
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Señales
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ln-op-line-2">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas de historico sin ID unico; posicion es suficiente
            <tr key={i} className="odd:bg-ln-op-stripe">
              <td className="px-4 py-2">
                <OpPill tone="open">{row.diseaseName}</OpPill>
              </td>
              <td className="px-3 py-2 text-ln-op-ink">{row.locality || "—"}</td>
              <td className="px-3 py-2 text-ln-op-ink">{row.province || "—"}</td>
              <td className="px-3 py-2 text-ln-op-mute tabular-nums">
                {/* peakDate is a date_trunc('day') UTC bucket (midnight-UTC
                    ISO) — pin UTC so the label names the bucket's own calendar
                    day; an ambient- or AR-zone render shifts it a day back. */}
                {new Date(row.peakDate).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-ln-op-ink">
                {row.totalSignals}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
