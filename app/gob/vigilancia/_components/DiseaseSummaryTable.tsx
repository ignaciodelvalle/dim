// Period rollup table grouped by disease, with sub-counts for 7d and 24h.
// Server component — receives the pre-computed summary from the page.
// `windowDays` labels the total column (the fetch window); defaults to 30.

import { LnEmptyState } from "@/components/ui/EmptyState";
import type { DiseaseSummary } from "@/lib/govt-dashboards";

export function DiseaseSummaryTable({
  summary,
  windowDays = 30,
}: {
  summary: DiseaseSummary[];
  windowDays?: number;
}) {
  if (summary.length === 0) {
    return (
      <LnEmptyState
        icon="shield-check"
        title={`No hay señales en los últimos ${windowDays} días en tu cobertura.`}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-[6px] border border-ln-op-line">
      <table className="min-w-full text-[13px]">
        <caption className="sr-only">
          Resumen de señales por enfermedad en los últimos {windowDays} días
        </caption>
        <thead className="bg-ln-op-stripe">
          <tr className="text-left text-[10px] uppercase tracking-wider text-ln-op-mute">
            <th scope="col" className="px-4 py-2">
              Enfermedad
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              24h
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              7 días
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {windowDays} días
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ln-op-line-2">
          {summary.map((row) => (
            <tr key={row.diseaseCode}>
              <td className="px-4 py-2 text-ln-op-ink">{row.diseaseName}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ln-op-ink-2">{row.count24h}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ln-op-ink-2">{row.count7d}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-ln-op-ink">
                {row.count30d}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
