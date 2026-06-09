import Link from "next/link";

import { MapChoropleth } from "@/components/charts/MapChoropleth";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCallout, OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type DashboardJurisdiction,
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
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const sp = await searchParams;
  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Resolve selected province ISO code (e.g. "AR-B") → ProvinceCode + canonical name.
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  // Fetch localities for the selected province to populate <JurisdictionSwitcher>.
  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  // Resolve locality slug → Locality row so we can get the canonical localityName
  // that the data fetchers compare against jurisdictionLocality columns.
  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  // Narrow the jurisdictions array passed to data fetchers when a province and/or
  // locality filter is active. Fetchers accept DashboardJurisdiction[] where
  // province = canonical display name, locality = locality name (not slug).
  // Admin's empty [] means "universal scope" — we leave it unchanged for admin
  // because the scope clauses short-circuit on actor.role === "admin".
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      // Province + locality: intersect with the user's actual assignments so a
      // govt user cannot widen scope by crafting arbitrary ?province=&locality= params.
      // govtAssignments.jurisdictionLocality is NOT NULL (schema-enforced), so exact
      // match is correct — no null-locality province-level rows exist.
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      // Province only: keep the govt's assignments that belong to that province.
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  const [metrics, signals, mapData, trend, summary] = await Promise.all([
    fetchVigilanciaMetrics(actor, filteredJurisdictions),
    fetchSurveillanceSignals(actor, filteredJurisdictions, { since }),
    fetchCasesPerLocality(actor, filteredJurisdictions),
    fetchZoonosisTrend(actor, filteredJurisdictions),
    fetchDiseaseSummary(actor, filteredJurisdictions),
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
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia epidemiológica
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mapa de vigilancia</h1>
        <p className="text-[13px] text-ln-op-mute">
          Señales de zoonosis y enfermedades reportables detectadas en tu cobertura.
        </p>
      </header>

      {/* No-scope warning */}
      {noScope && (
        <OpCallout
          title="Sin localidades asignadas"
          body="Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos una."
          icon="⚠"
        />
      )}

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* 4 KPI tiles */}
      <section
        aria-label="Indicadores de vigilancia"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Brotes activos"
          value={String(metrics.outbreakActiveCount)}
          tone={metrics.outbreakActiveCount > 0 ? "warn" : "neutral"}
          href="/gob/vigilancia/brotes"
        />
        <OpKpi
          label="Rábicas activas"
          value={String(metrics.rabiesActiveCount)}
          tone={metrics.rabiesActiveCount > 0 ? "danger" : "neutral"}
        />
        <OpKpi label="Pets hoy" value={String(metrics.petsRegisteredToday)} />
        <OpKpi label="Vacunaciones (7d)" value={String(metrics.vaccinationsThisWeek)} tone="ok" />
      </section>

      {/* Map + signals panels side-by-side on desktop */}
      <div className="grid lg:grid-cols-2 gap-4">
        <OpCard aria-labelledby={panelMapId}>
          <OpCardHead title={<span id={panelMapId}>Casos abiertos por jurisdicción</span>} />
          <OpCardBody>
            <MapChoropleth data={choroplethData} />
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelSignalsId}>
          <OpCardHead
            title={<span id={panelSignalsId}>Signals recientes</span>}
            actions={
              <Link
                href="/gob/vigilancia/brotes"
                className="text-[12px] text-ln-op-azul hover:underline no-underline"
              >
                Ver todos →
              </Link>
            }
          />
          <OpCardBody className="p-0">
            {signals.length === 0 ? (
              <div className="px-4 py-3">
                <LnEmptyState
                  icon="shield-check"
                  title="Sin signals activos en este período"
                  description="No se detectaron señales de zoonosis en el rango seleccionado."
                />
              </div>
            ) : (
              <ul className="px-3">
                {signals.slice(0, 5).map((s) => (
                  <OutbreakSignalRow key={s.signalEventId} signal={s} />
                ))}
              </ul>
            )}
          </OpCardBody>
        </OpCard>
      </div>

      {/* Trend chart full width */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Tendencia de enfermedades reportables (12 meses)</span>}
        />
        <OpCardBody>
          <TimeSeriesChart data={trendPoints} seriesLabel="Signals" />
        </OpCardBody>
      </OpCard>

      {/* Disease summary table */}
      <OpCard aria-labelledby={panelRabiesId}>
        <OpCardHead title={<span id={panelRabiesId}>Observaciones rábicas en curso</span>} />
        <OpCardBody className="p-0">
          <div className="px-4 py-3">
            <DiseaseSummaryTable summary={summary} />
          </div>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
