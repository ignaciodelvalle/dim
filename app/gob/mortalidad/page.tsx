// /gob/mortalidad — Mortality & disposal dashboard (Item 2).
//
// Standalone, jurisdiction-scoped, period-aware govt screen surfacing the
// disposal-traceability signal already captured by death_recorded (Ley CABA
// 5470). Pure projection: all data comes from fetchMortalityDisposition over the
// event log — no schema, no new event type (umbrella D1).
//
// Layout (Op* design system):
//   KPI row     — total deaths · B3 traceable rate · B4 unknown rate · B9 reportable share
//   OpBreach    — conditional, shown when B4 > 25% (low disposal traceability)
//   Disposición — B2 bucket bars
//   Contexto    — B7 splits (vet-confirmed / at-clinic / private crematorium)
//   Causas      — B1 cause-by-week
//   Distribución— B8 deaths by locality (k-anonymity suppressed)
//
// ProjectionContext is built once at this page boundary (like app/gob/page.tsx)
// and passed to the single fetcher.

import { StackedTimeSeriesChartDynamic } from "@/components/charts/StackedTimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpBreach,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpKpi,
  OpKpiSm,
} from "@/components/ui/dashboard";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { deathCauseLabel } from "@/lib/format";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
} from "@/lib/govt-dashboards";
import { buildProjectionContext, fetchDeathCausesTrend } from "@/lib/metrics";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { fetchMortalityDisposition } from "@/lib/mortality-metrics";

export const dynamic = "force-dynamic";

const UNKNOWN_DISPOSITION_BREACH_THRESHOLD = 25;

const BUCKET_LABELS: Record<string, string> = {
  cremation: "Cremación",
  burial: "Sepultura / cementerio",
  rendering: "Reciclaje sanitario",
  other: "Otro / sin especificar",
};

export default async function GobMortalidadPage({
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

  // Capability guard: analytics.read = admin OR (govt AND has assignments).
  const hasAnalyticsRead =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAnalyticsRead) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a mortalidad. Pedile al admin que te asigne capabilities."
        />
      </div>
    );
  }

  const sp = await searchParams;

  // Resolve selected province ISO code → Province object + localities list.
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

  // Narrow jurisdictions to the selected filter; admin short-circuits in scope.
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
  // Snapshot projection + the D1 cause-by-period trend run in parallel over the
  // same scoped death_recorded population.
  const [m, causesTrend] = await Promise.all([
    fetchMortalityDisposition(ctx),
    fetchDeathCausesTrend(ctx),
  ]);

  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const maxBucket = m.byBucket.reduce((acc, b) => Math.max(acc, b.count), 0);
  const localityCells = m.byLocality.value;
  const maxLocality = localityCells.reduce((acc, c) => Math.max(acc, c.count), 0);
  const showBreach = m.unknownRate > UNKNOWN_DISPOSITION_BREACH_THRESHOLD;

  const panelDispId = "panel-disposicion-titulo";
  const panelCtxId = "panel-contexto-titulo";
  const panelCauseId = "panel-causas-titulo";
  const panelLocId = "panel-localidad-titulo";

  // D1 — "Causas por semana" is now a stacked time-series. The bucket unit
  // follows the selected period (week for short windows, month for long ones).
  const causeBucketWord = causesTrend.granularity === "month" ? "mes" : "semana";
  const causesCardTitle = `Causas por ${causeBucketWord}`;
  const hasCausesTrend = causesTrend.series.points.length > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia sanitaria · Mortalidad y disposición
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mortalidad y disposición</h1>
        <p className="text-[13px] text-ln-op-mute">
          Trazabilidad de la disposición final de fallecimientos (Ley CABA 5470) en tu cobertura.
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* Conditional breach banner — low disposal traceability */}
      {showBreach && (
        <OpBreach
          title="Baja trazabilidad de disposición"
          detail={`${m.unknownRate}% de los fallecimientos no tienen método de disposición registrado (umbral ${UNKNOWN_DISPOSITION_BREACH_THRESHOLD}%).`}
        />
      )}

      {/* KPI row */}
      <section
        aria-label="Indicadores de mortalidad"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Muertes (período)"
          value={m.total.toLocaleString("es-AR")}
          sub="fallecimientos registrados"
          info={{
            definition:
              "Total de eventos death_recorded registrados en el período y jurisdicción seleccionados.",
            formula: "COUNT(death_recorded) en scope + período",
          }}
        />
        <OpKpi
          label="Trazabilidad de disposición"
          value={`${m.traceableRate}%`}
          tone={m.traceableRate >= 75 ? "ok" : m.traceableRate >= 50 ? "warn" : "danger"}
          bar={m.traceableRate}
          sub="método + instalación (B3 · Ley 5470)"
          info={{
            definition:
              "Porcentaje de fallecimientos con método de disposición conocido E instalación registrada. Mide el cumplimiento de trazabilidad exigido por la Ley CABA 5470.",
            formula: "deaths con (disposition_method ≠ null/unknown) AND (facility ≠ '') / total",
            caveat: "Umbral de alerta: < 75%. Valor < 50% se considera incumplimiento grave (B3).",
          }}
        />
        <OpKpi
          label="Disposición desconocida"
          value={`${m.unknownRate}%`}
          tone={m.unknownRate > UNKNOWN_DISPOSITION_BREACH_THRESHOLD ? "danger" : "neutral"}
          sub="sin método registrado (B4)"
          info={{
            definition:
              "Porcentaje de fallecimientos sin método de disposición registrado (campo disposition_method ausente o con valor 'unknown'). Es el complemento negativo de la trazabilidad (B4).",
            formula: "deaths con (disposition_method IS NULL OR = 'unknown') / total",
            caveat: `Se activa alerta visual cuando supera el ${UNKNOWN_DISPOSITION_BREACH_THRESHOLD}%.`,
          }}
        />
        <OpKpi
          label="Muertes notificables"
          value={`${m.reportableShare}%`}
          tone={m.reportableShare > 0 ? "warn" : undefined}
          sub="del total (B9)"
          info={{
            definition:
              "Porcentaje de fallecimientos que corresponden a enfermedades de notificación obligatoria (campo is_reportable = true). Un valor > 0 requiere notificación a la autoridad sanitaria (B9).",
            formula: "deaths con (is_reportable = true) / total",
            caveat:
              "Cualquier valor > 0% activa una indicación de atención: esos fallecimientos requieren notificación ENO.",
          }}
        />
      </section>

      {/* Disposición — B2 bucket bars + Contexto — B7 splits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpCard aria-labelledby={panelDispId}>
          <OpCardHead title={<span id={panelDispId}>Disposición</span>} />
          <OpCardBody>
            {m.byBucket.length === 0 ? (
              <LnEmptyState
                icon="heart"
                title="Sin datos de disposición"
                description="No hay fallecimientos en el período seleccionado en tu cobertura."
              />
            ) : (
              <figure
                role="img"
                aria-label={`Disposición final de fallecimientos — ${m.byBucket.length} método${m.byBucket.length !== 1 ? "s" : ""}. Máximo: ${maxBucket} fallecimiento${maxBucket !== 1 ? "s" : ""}.`}
              >
                <figcaption className="sr-only">
                  Gráfico de barras horizontales: distribución de fallecimientos por método de
                  disposición final. Los valores representan conteo de fallecimientos registrados en
                  el período seleccionado.
                </figcaption>
                <ul className="space-y-2" aria-label="Métodos de disposición">
                  {m.byBucket.map((b) => {
                    const pct = maxBucket > 0 ? (b.count / maxBucket) * 100 : 0;
                    const label = BUCKET_LABELS[b.bucket] ?? b.bucket;
                    return (
                      <li
                        key={b.bucket}
                        className="flex items-center gap-3"
                        aria-label={`${label}: ${b.count} fallecimiento${b.count !== 1 ? "s" : ""} (${Math.round(pct)}% del máximo)`}
                      >
                        <span className="w-40 shrink-0 text-[13px] text-ln-op-ink">{label}</span>
                        <div
                          className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded bg-ln-op-azul"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className="w-8 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                          aria-hidden="true"
                        >
                          {b.count}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-[10px] text-ln-op-mute">
                  Escala: 0 – {maxBucket} fallecimiento{maxBucket !== 1 ? "s" : ""} · cada barra
                  representa el total en el período.
                </p>
              </figure>
            )}
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelCtxId}>
          <OpCardHead title={<span id={panelCtxId}>Contexto del fallecimiento</span>} />
          <OpCardBody>
            <div className="grid grid-cols-3 gap-3">
              <OpKpiSm
                label="Confirmado por vet"
                value={`${m.contextSplits.vetConfirmedRate}%`}
                sub="del total"
              />
              <OpKpiSm
                label="En clínica"
                value={`${m.contextSplits.deathAtClinicRate}%`}
                sub="muertes en establecimiento"
              />
              <OpKpiSm
                label="Crematorio privado"
                value={`${m.contextSplits.privateCrematoriumRate}%`}
                sub="derivación del propietario"
              />
            </div>
          </OpCardBody>
        </OpCard>
      </div>

      {/* Causas — B1 cause-by-period (D1: stacked time-series, was a flat table) */}
      <OpCard aria-labelledby={panelCauseId}>
        <OpCardHead
          title={<span id={panelCauseId}>{causesCardTitle}</span>}
          actions={
            causesTrend.suppressedCount > 0 ? (
              <span className="text-[12px] font-normal text-ln-op-mute">
                {causesTrend.suppressedCount}{" "}
                {causesTrend.suppressedCount === 1 ? "celda oculta" : "celdas ocultas"} (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasCausesTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin fallecimientos en el período"
              description="No hay eventos de fallecimiento en el rango y la cobertura seleccionados."
            />
          ) : (
            <StackedTimeSeriesChartDynamic
              seriesKeys={causesTrend.series.seriesKeys}
              points={causesTrend.series.points}
              seriesLabel={deathCauseLabel}
              yLabel="Fallecimientos"
              fallbackTableLabel={`Fallecimientos por ${causeBucketWord} y causa`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Distribución — B8 deaths by locality (k-anonymity suppressed) */}
      <OpCard aria-labelledby={panelLocId}>
        <OpCardHead
          title={<span id={panelLocId}>Distribución por localidad</span>}
          actions={
            m.byLocality.suppressedCount > 0 ? (
              <span className="text-[12px] font-normal text-ln-op-mute">
                {m.byLocality.suppressedCount}{" "}
                {m.byLocality.suppressedCount === 1 ? "localidad oculta" : "localidades ocultas"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {localityCells.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">
              No hay localidades con fallecimientos visibles en el período.
            </p>
          ) : (
            <figure
              role="img"
              aria-label={`Fallecimientos por localidad — máximo: ${maxLocality} fallecimiento${maxLocality !== 1 ? "s" : ""}.`}
            >
              <figcaption className="sr-only">
                Gráfico de barras horizontales: distribución de fallecimientos por localidad.
                Localidades con menos de 5 fallecimientos están ocultas por privacidad
                (k-anonimato).
              </figcaption>
              <ul className="space-y-2" aria-label="Fallecimientos por localidad">
                {localityCells.map((c) => {
                  const pct = maxLocality > 0 ? (c.count / maxLocality) * 100 : 0;
                  return (
                    <li
                      key={c.key}
                      className="flex items-center gap-3"
                      aria-label={`${c.key}: ${c.count} fallecimiento${c.count !== 1 ? "s" : ""}`}
                    >
                      <span className="w-40 shrink-0 truncate text-[13px] text-ln-op-ink">
                        {c.key}
                      </span>
                      <div
                        className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded bg-ln-op-azul"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="w-8 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {c.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[10px] text-ln-op-mute">
                Escala: 0 – {maxLocality} fallecimiento{maxLocality !== 1 ? "s" : ""} · celdas &lt;
                5 ocultas (k-anonimato).
              </p>
            </figure>
          )}
        </OpCardBody>
      </OpCard>
    </div>
  );
}
