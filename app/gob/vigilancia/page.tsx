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
          <div className="rounded-lg border border-gob-warning  bg-gob-warning/10  px-4 py-3 text-sm text-gob-warning-text ">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
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
