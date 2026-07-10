// Cross-region ranking table for /gob/analytics (Item 22).
// Shows top/bottom 5 provinces by rabies vaccination coverage.
// A11y: <caption> + <th scope> per spec.
//
// metric-disambiguation (2026-07-10): this ranks the ALL-SPECIES, no-window
// coverage (RABIES_VACCINATION_RATE_LABEL_ES — "todas las mascotas, histórico"),
// which is a DIFFERENT metric from the Panorama compliance figure ("perros,
// últimos 12 meses"). The two used to share the bare name "Cobertura
// antirrábica" and could never be reconciled in a meeting; every label here now
// carries the species + window so the difference is legible on this surface.

import type { RegionRankingRow } from "@/lib/analytics/analytics-ranking";

type Props = {
  top: RegionRankingRow[];
  bottom: RegionRankingRow[];
  /**
   * Fully-disambiguated es-AR label for the ranked measure (species + window),
   * threaded from the page so it stays identical to the KPI tile above — passed
   * as RABIES_VACCINATION_RATE_LABEL_ES.
   */
  coverageLabel: string;
};

function CoverageBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded bg-ln-op-stripe overflow-hidden">
        <div
          className="h-full rounded bg-ln-op-azul"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ln-op-ink">{pct}%</span>
    </div>
  );
}

function RankingHalf({
  rows,
  captionText,
  id,
  columnLabel,
}: {
  rows: RegionRankingRow[];
  captionText: string;
  id: string;
  columnLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-ln-op-mute italic">Sin datos suficientes para el ranking.</p>
    );
  }

  return (
    <table className="w-full text-[13px]" aria-labelledby={id}>
      <caption id={id} className="sr-only">
        {captionText}
      </caption>
      <thead>
        <tr className="border-b border-ln-op-line">
          <th scope="col" className="text-left py-1.5 pr-2 font-semibold text-ln-op-mute w-8">
            #
          </th>
          <th scope="col" className="text-left py-1.5 pr-4 font-semibold text-ln-op-mute">
            Provincia
          </th>
          <th scope="col" className="text-left py-1.5 font-semibold text-ln-op-mute">
            {columnLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.code || row.province} className="border-b border-ln-op-line last:border-0">
            <td className="py-2 pr-2 tabular-nums text-ln-op-mute">{row.rank}</td>
            <td className="py-2 pr-4 text-ln-op-ink">{row.province}</td>
            <td className="py-2 min-w-[120px]">
              <CoverageBar pct={row.coveragePct ?? 0} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RegionRankingTable({ top, bottom, coverageLabel }: Props) {
  const hasData = top.length > 0 || bottom.length > 0;

  if (!hasData) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-6">
        <section aria-labelledby="ranking-top-title">
          <h3 id="ranking-top-title" className="text-sm font-semibold text-ln-op-ink mb-3">
            Mayor {coverageLabel}
          </h3>
          <RankingHalf
            rows={top}
            columnLabel={coverageLabel}
            captionText={`Provincias por mayor ${coverageLabel}`}
            id="cap-ranking-top"
          />
        </section>
        <section aria-labelledby="ranking-bottom-title">
          <h3 id="ranking-bottom-title" className="text-sm font-semibold text-ln-op-ink mb-3">
            Menor {coverageLabel}
          </h3>
          <RankingHalf
            rows={bottom}
            columnLabel={coverageLabel}
            captionText={`Provincias por menor ${coverageLabel}`}
            id="cap-ranking-bottom"
          />
        </section>
      </div>
      {/* metric-disambiguation (2026-07-10): make the difference from the
          Panorama compliance figure legible right here, so the two rabies
          numbers can be reconciled instead of read as contradictory. */}
      <p className="text-[11px] text-ln-op-mute">
        Métrica histórica de toda especie con ≥1 dosis registrada. Distinta de la cobertura de
        cumplimiento del Panel/Panorama (perros con dosis en los últimos 12 meses, Ley 22.953).
      </p>
    </div>
  );
}
