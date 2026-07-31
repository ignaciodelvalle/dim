// Casos abiertos por 10.000 habitantes — per-capita epi ranking (E1, harvest
// ola4-facades-2026-07-21). Surfaces fetchCasesPerCapita (lib/analytics/
// dashboards/surveillance.ts) — INDEC-2022-adjusted, fully built and unit
// tested, previously wired to zero callers anywhere in app/.
//
// Placed on /gob/analytics rather than /gob/vigilancia: vigilancia already
// shows the RAW open-case count via its choropleth (and was flagged as the
// portal's densest KPI screen in the 2026-07-21 decision-density audit), so a
// second raw view there would just duplicate it. This is the population-
// normalized companion the page's own comment (above the vaccination ranking
// card) said was "demoted per PO review" as a CHOROPLETH — the map form was
// cut, not the metric. A compact ranking table matches this page's existing
// "Ranking" vocabulary without adding another map.
//
// Provinces with no census row (ratePer10k === null) are never silently
// dropped — they're listed in a footnote with their raw count instead, per
// the project's no-silent-omission convention.

import type { ProvinceCasesPerCapita } from "@/lib/analytics/govt-dashboards";

type Props = {
  rows: ProvinceCasesPerCapita[];
};

export function CasesPerCapitaTable({ rows }: Props) {
  const ranked = rows
    .filter((r) => r.ratePer10k !== null && r.count > 0)
    .sort((a, b) => (b.ratePer10k as number) - (a.ratePer10k as number))
    .slice(0, 5);
  const noCensus = rows.filter((r) => r.ratePer10k === null && r.count > 0);

  if (ranked.length === 0 && noCensus.length === 0) {
    return (
      <p className="text-md text-ln-op-mute italic">
        Sin casos abiertos en la cobertura seleccionada.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {ranked.length > 0 && (
        <table className="w-full text-md" aria-labelledby="cap-percapita-title">
          <caption id="cap-percapita-title" className="sr-only">
            Provincias con mayor cantidad de casos abiertos por cada 10.000 habitantes
          </caption>
          <thead>
            <tr className="border-b border-ln-op-line">
              <th scope="col" className="text-left py-1.5 pr-2 font-semibold text-ln-op-mute w-8">
                #
              </th>
              <th scope="col" className="text-left py-1.5 pr-4 font-semibold text-ln-op-mute">
                Provincia
              </th>
              <th scope="col" className="text-right py-1.5 pr-4 font-semibold text-ln-op-mute">
                Casos / 10.000 hab.
              </th>
              <th scope="col" className="text-right py-1.5 font-semibold text-ln-op-mute">
                Casos abiertos
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => (
              <tr
                key={row.code || row.province}
                className="border-b border-ln-op-line last:border-0"
              >
                <td className="py-2 pr-2 tabular-nums text-ln-op-mute">{i + 1}</td>
                <td className="py-2 pr-4 text-ln-op-ink">{row.province}</td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-ln-op-ink">
                  {row.ratePer10k?.toLocaleString("es-AR")}
                </td>
                <td className="py-2 text-right tabular-nums text-ln-op-mute">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {noCensus.length > 0 && (
        <p className="text-sm text-ln-op-mute">
          Sin dato de población censal (INDEC 2022) — se muestra el conteo bruto:{" "}
          {noCensus.map((r) => `${r.province} (${r.count})`).join(", ")}.
        </p>
      )}
    </div>
  );
}
