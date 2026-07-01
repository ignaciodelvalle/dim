// Cross-region ranking table for /gob/analytics (Item 22).
// Shows top/bottom 5 provinces by rabies vaccination coverage.
// A11y: <caption> + <th scope> per spec.

import type { RegionRankingRow } from "@/lib/analytics/analytics-ranking";

type Props = {
  top: RegionRankingRow[];
  bottom: RegionRankingRow[];
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
}: {
  rows: RegionRankingRow[];
  captionText: string;
  id: string;
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
            Cobertura antirrábica
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

export function RegionRankingTable({ top, bottom }: Props) {
  const hasData = top.length > 0 || bottom.length > 0;

  if (!hasData) {
    return null;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section aria-labelledby="ranking-top-title">
        <h3 id="ranking-top-title" className="text-sm font-semibold text-ln-op-ink mb-3">
          Mayor cobertura antirrábica
        </h3>
        <RankingHalf
          rows={top}
          captionText="Top 5 provincias por mayor cobertura antirrábica"
          id="cap-ranking-top"
        />
      </section>
      <section aria-labelledby="ranking-bottom-title">
        <h3 id="ranking-bottom-title" className="text-sm font-semibold text-ln-op-ink mb-3">
          Menor cobertura antirrábica
        </h3>
        <RankingHalf
          rows={bottom}
          captionText="Top 5 provincias por menor cobertura antirrábica"
          id="cap-ranking-bottom"
        />
      </section>
    </div>
  );
}
