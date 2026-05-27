import Link from "next/link";

import {
  EmptyState,
  JurisdictionSwitcher,
  MapChoropleth,
  MetricCard,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
  TimeSeriesChart,
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  PROVINCE_ISO_MAP,
  fetchCasesPerLocality,
  fetchDiseaseSummary,
  fetchSurveillanceSignals,
  fetchVigilanciaMetrics,
  fetchZoonosisTrend,
} from "@/lib/govt-dashboards";
import { DiseaseSummaryTable } from "./_components/DiseaseSummaryTable";
import { OutbreakSignalRow } from "./_components/OutbreakSignalRow";

// All Argentine provinces in the GeoJSON placeholder. Admin users get this
// full list; govt users get the subset derived from their assigned jurisdictions.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
];

export default async function GobVigilanciaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  // searchParams are read here for future period-aware queries (E2 follow-up).
  // v1 note: fetchVigilanciaMetrics uses fixed windows (30d / 7d / today) per
  // metric semantic rather than the UI period. The PeriodPicker drives
  // fetchSurveillanceSignals so the signals panel and the drill-down route
  // respect the selected period. Aligning all metrics to a single period is a
  // planned E2-followup.
  const sp = await searchParams;
  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [metrics, signals, mapData, trend, summary] = await Promise.all([
    fetchVigilanciaMetrics(actor, jurisdictions),
    fetchSurveillanceSignals(actor, jurisdictions, { since }),
    fetchCasesPerLocality(actor, jurisdictions),
    fetchZoonosisTrend(actor, jurisdictions),
    fetchDiseaseSummary(actor, jurisdictions),
  ]);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Build allowedProvinces for <JurisdictionSwitcher>.
  // Admin: full list. Govt: derive unique province codes from assigned jurisdictions.
  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Shape map data into ChoroplethRegionDatum format (aggregate by province code).
  const codeToCount = new Map<string, number>();
  for (const row of mapData) {
    if (!row.code) continue;
    codeToCount.set(row.code, (codeToCount.get(row.code) ?? 0) + row.count);
  }
  const choroplethData = Array.from(codeToCount.entries()).map(([code, value]) => ({
    code,
    value,
    label: `${value} caso${value !== 1 ? "s" : ""} abierto${value !== 1 ? "s" : ""}`,
  }));

  // Shape trend data for TimeSeriesChart.
  const trendPoints = trend
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((t) => ({ x: t.x, y: t.y }));

  const panelMapId = "panel-mapa-titulo";
  const panelSignalsId = "panel-signals-titulo";
  const panelTrendId = "panel-trend-titulo";
  const panelRabiesId = "panel-rabies-titulo";

  return (
    <main className="px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Vigilancia epidemiológica
          </h1>
          <p className="text-sm text-gob-text-gray">
            Señales de zoonosis y enfermedades reportables detectadas en tu cobertura.
          </p>
        </header>

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-lg border border-gob-warning/30 bg-gob-warning/10 px-4 py-3 text-sm text-gob-warning-text">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          {/* localities is empty v1 — TODO(E2-followup): fetch localities for selected province */}
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Brotes activos"
            value={String(metrics.outbreakActiveCount)}
            tone={metrics.outbreakActiveCount > 0 ? "warning" : "neutral"}
            href="/gob/vigilancia/brotes"
          />
          <MetricCard
            label="Rábicas activas"
            value={String(metrics.rabiesActiveCount)}
            tone={metrics.rabiesActiveCount > 0 ? "danger" : "neutral"}
          />
          <MetricCard label="Pets hoy" value={String(metrics.petsRegisteredToday)} />
          <MetricCard
            label="Vacunaciones (7d)"
            value={String(metrics.vaccinationsThisWeek)}
            tone="success"
          />
        </div>

        {/* Map + signals panels side-by-side on desktop */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel aria-labelledby={panelMapId}>
            <PanelHeader title={<span id={panelMapId}>Casos abiertos por jurisdicción</span>} />
            <PanelBody>
              <MapChoropleth data={choroplethData} />
            </PanelBody>
          </Panel>

          <Panel aria-labelledby={panelSignalsId}>
            <PanelHeader
              title={<span id={panelSignalsId}>Signals recientes</span>}
              actions={
                <Link
                  href="/gob/vigilancia/brotes"
                  className="text-xs text-gob-primary hover:underline"
                >
                  Ver todos →
                </Link>
              }
            />
            <PanelBody>
              {signals.length === 0 ? (
                <EmptyState
                  icon="shield-check"
                  title="Sin signals activos en este período"
                  description="No se detectaron señales de zoonosis en el rango seleccionado."
                />
              ) : (
                <ul>
                  {signals.slice(0, 5).map((s) => (
                    <OutbreakSignalRow key={s.signalEventId} signal={s} />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>

        {/* Trend chart full width */}
        <Panel aria-labelledby={panelTrendId}>
          <PanelHeader
            title={<span id={panelTrendId}>Tendencia de enfermedades reportables (12 meses)</span>}
          />
          <PanelBody>
            <TimeSeriesChart data={trendPoints} seriesLabel="Signals" />
          </PanelBody>
        </Panel>

        {/* Rabies observations table */}
        <Panel aria-labelledby={panelRabiesId}>
          <PanelHeader title={<span id={panelRabiesId}>Observaciones rábicas en curso</span>} />
          <PanelBody>
            <DiseaseSummaryTable summary={summary} />
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
