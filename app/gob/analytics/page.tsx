import Link from "next/link";

import { MapChoropleth } from "@/components/charts/MapChoropleth";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { EmptyState } from "@/components/poncho";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
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

// All Argentine provinces in the GeoJSON placeholder -- mirrors /gob/vigilancia.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Cordoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucuman" },
  { code: "AR-E", name: "Entre Rios" },
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
      <div className="space-y-6">
        <EmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a analytics. Pedile al admin que te asigne capabilities."
        />
      </div>
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

  // Shape map data -- per-capita rate per province (casos por 10k hab., INDEC 2022).
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
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Analytics
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Analytics</h1>
        <p className="text-[13px] text-ln-op-mute">
          Metricas analiticas de salud animal y gestion de mascotas en tu cobertura.
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* 4 KPI tiles */}
      <section
        aria-label="Indicadores de analytics"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi label="Pets totales" value={String(metrics.totalPets)} sub="activos + perdidos" />
        <OpKpi
          label="Tasa de adopcion (12m)"
          value={`${metrics.adoptionRate}%`}
          tone={metrics.adoptionRate >= 20 ? "ok" : undefined}
          sub="del total de adquisiciones"
        />
        <OpKpi
          label="Cobertura antirrabica"
          value={`${metrics.rabiesVaccinationRate}%`}
          tone={
            metrics.rabiesVaccinationRate >= 70
              ? "ok"
              : metrics.rabiesVaccinationRate >= 40
                ? "warn"
                : "danger"
          }
          sub="pets con >= 1 vacuna antirrabica"
        />
        <OpKpi
          label="Disputas de custodia"
          value={String(metrics.custodyDisputes)}
          tone={metrics.custodyDisputes > 0 ? "warn" : undefined}
          sub="casos abiertos"
        />
      </section>

      {/* Acquisition trend + export */}
      <OpCard aria-labelledby={panelAcquisitionId}>
        <OpCardHead
          title={<span id={panelAcquisitionId}>Adquisicion por metodo</span>}
          actions={
            <Link
              href="/gob/analytics/export"
              className="text-[12px] text-ln-op-azul hover:underline no-underline"
            >
              {"Exportar CSV →"}
            </Link>
          }
        />
        <OpCardBody>
          {acquisitionTrend.length === 0 ? (
            <EmptyState
              icon="chart-line"
              title="Sin datos de adquisicion"
              description="No hay registros de mascotas con metodo de adquisicion en los ultimos 12 meses."
            />
          ) : (
            <AcquisitionChart data={acquisitionTrend} />
          )}
        </OpCardBody>
      </OpCard>

      {/* Geographic distribution -- cases as proxy for population. */}
      <OpCard aria-labelledby={panelMapId}>
        <OpCardHead
          title={
            <span id={panelMapId}>
              Distribucion geografica{" "}
              <span className="text-[11px] font-normal text-ln-op-mute">
                por 10.000 hab. (INDEC 2022)
              </span>
            </span>
          }
        />
        <OpCardBody>
          <MapChoropleth data={choroplethData} />
        </OpCardBody>
      </OpCard>

      {/* Top 10 death causes -- v1: simple HTML/CSS bars (spec B.6 doesn't mandate recharts here) */}
      <OpCard aria-labelledby={panelDeathId}>
        <OpCardHead title={<span id={panelDeathId}>Top 10 causas de muerte (12m)</span>} />
        <OpCardBody>
          {deathCauses.length === 0 ? (
            <EmptyState
              icon="heart"
              title="Sin datos de fallecimiento"
              description="No hay eventos de fallecimiento en los ultimos 12 meses en tu cobertura."
            />
          ) : (
            <ul className="space-y-2">
              {deathCauses.map((row) => (
                <li key={row.cause} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[13px] text-ln-op-ink capitalize">
                    {row.cause}
                  </span>
                  <div className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden">
                    <div
                      className="h-full rounded bg-ln-op-azul"
                      style={{
                        width: maxDeathCount > 0 ? `${(row.count / maxDeathCount) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* v1 uses HTML bars; full recharts BarChart can replace this in a follow-up */}
        </OpCardBody>
      </OpCard>

      {/* Outbreak history table */}
      <OpCard aria-labelledby={panelOutbreakId}>
        <OpCardHead title={<span id={panelOutbreakId}>Brotes historicos</span>} />
        <OpCardBody>
          <OutbreakHistoryTable rows={outbreakHistory} />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
