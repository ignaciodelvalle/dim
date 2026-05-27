// 30-day rollup table grouped by disease, with sub-counts for 7d and 24h.
// Server component — receives the pre-computed summary from the page.

import type { DiseaseSummary } from "@/lib/govt-dashboards";

export function DiseaseSummaryTable({ summary }: { summary: DiseaseSummary[] }) {
  if (summary.length === 0) {
    return (
      <p className="text-sm text-gob-text-muted">
        No hay señales en los últimos 30 días en tu cobertura.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gob-border">
      <table className="min-w-full text-sm">
        <thead className="bg-gob-surface-alt">
          <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="px-4 py-2">Enfermedad</th>
            <th className="px-3 py-2 text-right">24h</th>
            <th className="px-3 py-2 text-right">7 días</th>
            <th className="px-3 py-2 text-right">30 días</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-border">
          {summary.map((row) => (
            <tr key={row.diseaseCode}>
              <td className="px-4 py-2 text-gob-text">{row.diseaseName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.count24h}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.count7d}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.count30d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
