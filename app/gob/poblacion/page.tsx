// /gob/poblacion — Control poblacional (Paquete G).
//
// Jurisdiction-scoped, period-aware gobierno screen answering:
// "¿Estamos conteniendo la población?"
//
// Layout (Op* design system):
//   KPI row      — cobertura esterilización (con meta 70%) · preñeces activas ·
//                  nacimientos registrados (caveat) · tasa neta de crecimiento (caveat)
//                  · ratio esterilización/natalidad (sub o tile 5)
//   Trend        — TimeSeriesChart (sterilization_performed trend)
//   Coropleta    — MapChoroplethDynamic (sterilización por provincia)
//   Freshness footer
//
// PANORAMA NOTE: The Paquete G Panorama layer/preset (population-control map layer
// and preset in /gob/panorama) is deferred to a separate work unit. This page is
// the standalone jurisdiction dashboard — not the Panorama integration.

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
} from "@/lib/govt-dashboards";
import {
  TARGETS,
  buildProjectionContext,
  fetchActivePregnancies,
  fetchNetGrowth,
  fetchReproductiveOutcomes,
  fetchSterilizationCoverage,
  fetchSterilizationNatalidadRatio,
  fetchSterilizationTrend,
  toneForTarget,
} from "@/lib/metrics";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";

export const dynamic = "force-dynamic";

export default async function GobPoblacionPage({
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
  const actor = { role: profile.role } as const;

  const hasAnalyticsRead =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAnalyticsRead) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso al control poblacional. Pedile al admin que te asigne capabilities."
        />
      </div>
    );
  }

  const sp = await searchParams;

  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  const period = resolveAnalyticsPeriod(sp);
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);

  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const [coverage, activePregnancies, outcomes, netGrowth, sterilNatalidadRatio, sterilTrend] =
    await Promise.all([
      fetchSterilizationCoverage(ctx),
      fetchActivePregnancies(ctx),
      fetchReproductiveOutcomes(ctx),
      fetchNetGrowth(ctx),
      fetchSterilizationNatalidadRatio(ctx),
      fetchSterilizationTrend(ctx),
    ]);

  const hasData = coverage.total > 0;
  const hasTrend = sterilTrend.points.length > 0;

  const coverageTone = toneForTarget(coverage.rate, TARGETS.STERILIZATION_COVERAGE_PCT);

  // Net growth: directional only. Tone is neutral — sign alone is meaningful
  // but exact value is not because registeredBirths under-counts natalidad.
  const netTone = "neutral" as const;

  // Choropleth: map byProvince rates to the standard format
  const choroplethData = coverage.byProvince.map((r) => ({
    code: PROVINCE_ISO_MAP[r.province] ?? r.province,
    value: r.ratePct,
    label: r.province,
  }));

  const panelTrendId = "panel-esterilizacion-titulo";
  const panelMapId = "panel-mapa-titulo";

  const natalidadCaveatText = "Solo partos en seguimiento — subestima la natalidad real";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Registro · Control poblacional
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Control poblacional</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Cobertura de esterilización, reproducción activa y balance poblacional en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="trailing12m" />
      </div>

      {/* KPI row */}
      <section
        aria-label="Indicadores de control poblacional"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {/* KPI 1: Sterilization coverage — with target bar + tone */}
        <OpKpi
          label="Cobertura de esterilización"
          value={hasData ? `${coverage.rate}%` : "—"}
          bar={hasData ? coverage.rate : undefined}
          tone={hasData ? coverageTone : "neutral"}
          sub={
            hasData
              ? `meta programática 70% · ${coverage.sterilized.toLocaleString("es-AR")} de ${coverage.total.toLocaleString("es-AR")}`
              : "Sin datos en la cobertura"
          }
          sparkline={hasTrend ? sterilTrend.points.map((p) => p.y) : undefined}
          info={{
            definition:
              "Fracción de mascotas activas/extraviadas en scope con al menos un evento sterilization_performed registrado.",
            formula:
              "COUNT(DISTINCT pets WHERE EXISTS sterilization_performed) / COUNT(active/lost pets) * 100",
            caveat:
              "Meta programática 70% (benchmark interno — no es mandato legal como la cobertura antirrábica).",
          }}
        />

        {/* KPI 2: Active pregnancies */}
        <OpKpi
          label="Preñeces activas"
          value={activePregnancies.toLocaleString("es-AR")}
          sub="mascotas con pregnancy_status='in_progress'"
          tone={activePregnancies > 0 ? "warn" : "neutral"}
          info={{
            definition:
              "Mascotas en scope con pregnancyStatus='in_progress' (preñez iniciada y aún no cerrada). Requiere que la preñez haya sido registrada por un veterinario.",
            formula: "COUNT(pets) WHERE pregnancy_status = 'in_progress' AND scope",
          }}
        />

        {/* KPI 3: Registered births — with natalidad caveat */}
        <OpKpi
          label="Nacimientos registrados"
          value={outcomes.registeredBirths.toLocaleString("es-AR")}
          sub={natalidadCaveatText}
          tone="neutral"
          info={{
            definition:
              "Eventos clinical_info_logged con sub_kind='pregnancy', pregnancy_phase='ended' y outcome='live_birth' en el período seleccionado, en el scope de jurisdicción.",
            formula:
              "COUNT(clinical_info_logged WHERE sub_kind='pregnancy' AND pregnancy_phase='ended' AND outcome='live_birth' AND period AND scope)",
            caveat:
              "Solo cuenta partos de preñeces registradas en el sistema. Partos callejeros y camadas sin seguimiento son invisibles. Este número subestima la natalidad real — tratarlo como indicador direccional, no como dato exacto.",
          }}
        />

        {/* KPI 4: Net growth rate — directional, neutral tone */}
        <OpKpi
          label="Balance poblacional"
          value={
            netGrowth.net > 0
              ? `+${netGrowth.net.toLocaleString("es-AR")}`
              : netGrowth.net.toLocaleString("es-AR")
          }
          sub={natalidadCaveatText}
          tone={netTone}
          info={{
            definition:
              "Altas nuevas en el período + nacimientos registrados − muertes registradas.",
            formula: "COUNT(altas) + COUNT(live_birth events) − COUNT(death_recorded events)",
            caveat:
              "INDICADOR DIRECCIONAL, NO EXACTO. Los nacimientos registrados solo cubren partos en seguimiento — callejero y camadas sin registro son invisibles. Un balance positivo no descarta contención; uno negativo es señal fuerte de que la población está contrayéndose.",
          }}
        />
      </section>

      {/* Ratio esterilización/natalidad — sub-KPI */}
      {sterilNatalidadRatio !== null && (
        <section aria-label="Ratio esterilización / natalidad registrada">
          <div className="rounded-xl border border-ln-op-line bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ln-op-mute">
              Ratio esterilización / natalidad registrada
            </p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums text-ln-op-ink">
              {sterilNatalidadRatio.toFixed(2)}
            </p>
            <p className="mt-1 text-[11px] text-ln-op-mute">
              esterilizaciones del período por parto en seguimiento ·{" "}
              <span className="italic">{natalidadCaveatText}</span>
            </p>
          </div>
        </section>
      )}

      {/* Net growth breakdown sub-section */}
      {hasData && (
        <div className="rounded-xl border border-ln-op-line bg-ln-op-stripe/30 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ln-op-mute mb-3">
            Componentes del balance
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[11px] text-ln-op-mute">Altas nuevas</p>
              <p className="text-lg font-semibold tabular-nums text-ln-op-ink">
                +{netGrowth.altas.toLocaleString("es-AR")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ln-op-mute">Nacimientos registrados</p>
              <p className="text-lg font-semibold tabular-nums text-ln-op-ink">
                +{netGrowth.registeredBirths.toLocaleString("es-AR")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ln-op-mute">Muertes registradas</p>
              <p className="text-lg font-semibold tabular-nums text-ln-op-ink">
                −{netGrowth.deaths.toLocaleString("es-AR")}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ln-op-mute text-center italic">{natalidadCaveatText}</p>
        </div>
      )}

      {/* Sterilization trend */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Tendencia de esterilizaciones</span>}
          actions={
            sterilTrend.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {sterilTrend.suppressedCount}{" "}
                {sterilTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin esterilizaciones en el período"
              description="No hay eventos sterilization_performed en el rango y la cobertura seleccionados."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={sterilTrend.points}
              seriesLabel="Esterilizaciones"
              yLabel="Eventos registrados"
              variant="area"
              fallbackTableLabel={`Esterilizaciones por ${sterilTrend.granularity === "month" ? "mes" : "semana"}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Choropleth — sterilization coverage by province */}
      {choroplethData.length > 0 && (
        <OpCard aria-labelledby={panelMapId}>
          <OpCardHead
            title={<span id={panelMapId}>Cobertura de esterilización por provincia</span>}
          />
          <OpCardBody>
            <MapChoroplethDynamic
              data={choroplethData}
              level="province"
              scaleMode="divergent"
              target={TARGETS.STERILIZATION_COVERAGE_PCT}
              scaleLabel="Cobertura de esterilización (%)"
              fallbackTableLabel="Cobertura de esterilización por provincia"
              height={400}
            />
          </OpCardBody>
        </OpCard>
      )}

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
