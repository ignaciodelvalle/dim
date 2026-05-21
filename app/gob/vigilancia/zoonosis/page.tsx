import { Panel, PanelBody, PanelHeader, TimeSeriesChart } from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { fetchDiseaseSummary, fetchZoonosisTrend } from "@/lib/govt-dashboards";
import { DiseaseSummaryTable } from "../_components/DiseaseSummaryTable";

export default async function GobVigilanciazoonosisPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const [summary, trend] = await Promise.all([
    fetchDiseaseSummary(actor, jurisdictions),
    fetchZoonosisTrend(actor, jurisdictions),
  ]);

  const trendPoints = trend
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((t) => ({ x: t.x, y: t.y }));

  const panelTableId = "panel-zoonosis-tabla-titulo";
  const panelTrendId = "panel-zoonosis-trend-titulo";

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Zoonosis — enfermedades reportables
          </h1>
          <p className="text-sm text-gob-text-gray">
            Resumen por enfermedad y tendencia mensual en tu cobertura.
          </p>
        </header>

        {/* TODO(future): per-disease breakdown with filter chips */}

        <Panel aria-labelledby={panelTableId}>
          <PanelHeader title={<span id={panelTableId}>Resumen por enfermedad (30 días)</span>} />
          <PanelBody>
            <DiseaseSummaryTable summary={summary} />
          </PanelBody>
        </Panel>

        <Panel aria-labelledby={panelTrendId}>
          <PanelHeader
            title={
              <span id={panelTrendId}>
                Tendencia mensual de enfermedades reportables (12 meses)
              </span>
            }
          />
          <PanelBody>
            <TimeSeriesChart data={trendPoints} seriesLabel="Signals" />
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
