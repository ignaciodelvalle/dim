import { TimeSeriesChart } from "@/components/poncho";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia · Zoonosis
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Enfermedades reportables</h1>
        <p className="text-[13px] text-ln-op-mute">
          Resumen por enfermedad y tendencia mensual en tu cobertura.
        </p>
      </header>

      {/* TODO(future): per-disease breakdown with filter chips */}

      <OpCard aria-labelledby={panelTableId}>
        <OpCardHead title={<span id={panelTableId}>Resumen por enfermedad (30 días)</span>} />
        <OpCardBody className="p-0">
          <div className="px-4 py-3">
            <DiseaseSummaryTable summary={summary} />
          </div>
        </OpCardBody>
      </OpCard>

      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={
            <span id={panelTrendId}>Tendencia mensual de enfermedades reportables (12 meses)</span>
          }
        />
        <OpCardBody>
          <TimeSeriesChart data={trendPoints} seriesLabel="Signals" />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
