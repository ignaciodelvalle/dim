// ---------------------------------------------------------------------------
// DEFERRED BY DESIGN (audit-internal-roles-pages PR2/9 — 2026-05-26)
//
// This page exists but is NOT reachable from any nav or dashboard CTA. The
// underlying flow (analytics dashboard for govt role) is not yet wired
// end-to-end. Keep this page intact — when the flow lands, add a nav entry
// in `components/poncho/Layout/nav-presets.ts` or a CTA on the gob dashboard.
//
// Wire when KPI/analytics work returns to the roadmap; currently exploratory.
// Note: /gob/analytics/export is a child of this page — both are unreachable
// from nav until this parent page is wired.
//
// Audited: 2026-05-26. Re-evaluate during next role audit.
// ---------------------------------------------------------------------------

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
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  PROVINCE_ISO_MAP,
  fetchAcquisitionTrend,
  fetchAnalyticsMetrics,
  fetchCasesPerCapita,
  fetchDeathCauses,
  fetchOutbreakHistory,
} from "@/lib/govt-dashboards";
import { AcquisitionChart } from "./_components/AcquisitionChart";
import { OutbreakHistoryTable } from "./_components/OutbreakHistoryTable";

// All Argentine provinces in the GeoJSON placeholder — mirrors /gob/vigilancia.
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

export default async function GobAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  // Capability guard: analytics.read = admin OR (govt AND has assignments).
  // v1 derives capability from role + jurisdictions; no dedicated capability column.
  const hasAnalyticsRead =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAnalyticsRead) {
    return (
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <EmptyState
            icon="lock"
            title="Sin acceso"
            description="Tu rol no tiene acceso a analytics. Pedile al admin que te asigne capabilities."
          />
        </div>
      </main>
    );
  }

  // searchParams are consumed for PeriodPicker persistence; fetchers v1 use
  // fixed windows per spec (12m rolling). Period-aware queries are a follow-up.
  void searchParams;

  const [metrics, acquisitionTrend, deathCauses, outbreakHistory, casesPerCapita] =
    await Promise.all([
      fetchAnalyticsMetrics(actor, jurisdictions),
      fetchAcquisitionTrend(actor, jurisdictions),
      fetchDeathCauses(actor, jurisdictions),
      fetchOutbreakHistory(actor, jurisdictions),
      fetchCasesPerCapita(actor, jurisdictions),
    ]);

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Shape map data — per-capita rate per province (casos por 10k hab., INDEC 2022).
  // Falls back to raw count label when census row is absent for a province.
  const choroplethData = casesPerCapita
    .filter((row) => row.code !== "")
    .map((row) => ({
      code: row.code,
      value: row.ratePer10k ?? row.count,
      label:
        row.ratePer10k !== null
          ? `${row.ratePer10k.toFixed(1)} casos por 10k hab.`
          : `${row.count} caso${row.count !== 1 ? "s" : ""} abierto${row.count !== 1 ? "s" : ""}`,
    }));

  // Compute bar chart max for death causes.
  const maxDeathCount = deathCauses.reduce((m, r) => Math.max(m, r.count), 0);

  const panelAcquisitionId = "panel-acquisition-titulo";
  const panelMapId = "panel-mapa-analytics-titulo";
  const panelDeathId = "panel-death-titulo";
  const panelOutbreakId = "panel-outbreak-titulo";

  return (
    <main className="px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">Analytics</h1>
          <p className="text-sm text-gob-text-gray">
            Métricas analíticas de salud animal y gestión de mascotas en tu cobertura.
          </p>
        </header>

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Pets totales"
            value={String(metrics.totalPets)}
            subline="activos + perdidos"
          />
          <MetricCard
            label="Tasa de adopción (12m)"
            value={`${metrics.adoptionRate}%`}
            tone={metrics.adoptionRate >= 20 ? "success" : "neutral"}
            subline="del total de adquisiciones"
          />
          <MetricCard
            label="Cobertura antirrábica"
            value={`${metrics.rabiesVaccinationRate}%`}
            tone={
              metrics.rabiesVaccinationRate >= 70
                ? "success"
                : metrics.rabiesVaccinationRate >= 40
                  ? "warning"
                  : "danger"
            }
            subline="pets con ≥1 vacuna antirrábica"
          />
          <MetricCard
            label="Disputas de custodia"
            value={String(metrics.custodyDisputes)}
            tone={metrics.custodyDisputes > 0 ? "warning" : "neutral"}
            subline="casos abiertos"
          />
        </div>

        {/* Acquisition trend + export */}
        <Panel aria-labelledby={panelAcquisitionId}>
          <PanelHeader
            title={<span id={panelAcquisitionId}>Adquisición por método</span>}
            actions={
              <Link
                href="/gob/analytics/export"
                className="text-xs text-gob-primary hover:underline"
              >
                Exportar CSV →
              </Link>
            }
          />
          <PanelBody>
            {acquisitionTrend.length === 0 ? (
              <EmptyState
                icon="chart-line"
                title="Sin datos de adquisición"
                description="No hay registros de mascotas con método de adquisición en los últimos 12 meses."
              />
            ) : (
              <AcquisitionChart data={acquisitionTrend} />
            )}
          </PanelBody>
        </Panel>

        {/* Geographic distribution — cases as proxy for population. */}
        <Panel aria-labelledby={panelMapId}>
          <PanelHeader
            title={
              <span id={panelMapId}>
                Distribución geográfica{" "}
                <span className="text-xs font-normal text-gob-text-muted">
                  por 10.000 hab. (INDEC 2022)
                </span>
              </span>
            }
          />
          <PanelBody>
            <MapChoropleth data={choroplethData} />
          </PanelBody>
        </Panel>

        {/* Top 10 death causes — v1: simple HTML/CSS bars (spec §B.6 doesn't mandate recharts here) */}
        <Panel aria-labelledby={panelDeathId}>
          <PanelHeader title={<span id={panelDeathId}>Top 10 causas de muerte (12m)</span>} />
          <PanelBody>
            {deathCauses.length === 0 ? (
              <EmptyState
                icon="heart"
                title="Sin datos de fallecimiento"
                description="No hay eventos de fallecimiento en los últimos 12 meses en tu cobertura."
              />
            ) : (
              <ul className="space-y-2">
                {deathCauses.map((row) => (
                  <li key={row.cause} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm text-gob-text capitalize">
                      {row.cause}
                    </span>
                    <div className="flex-1 h-4 rounded bg-gob-surface-alt overflow-hidden">
                      <div
                        className="h-full rounded bg-gob-primary"
                        style={{
                          width: maxDeathCount > 0 ? `${(row.count / maxDeathCount) * 100}%` : "0%",
                        }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm tabular-nums text-gob-text">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* v1 uses HTML bars; full recharts BarChart can replace this in a follow-up */}
          </PanelBody>
        </Panel>

        {/* Outbreak history table */}
        <Panel aria-labelledby={panelOutbreakId}>
          <PanelHeader title={<span id={panelOutbreakId}>Brotes históricos</span>} />
          <PanelBody>
            <OutbreakHistoryTable rows={outbreakHistory} />
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
