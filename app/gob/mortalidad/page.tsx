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
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpBreach,
  OpCard,
  OpCardBody,
  OpCardHead,
  type OpFilterAxis,
  OpFilterBar,
  OpKpi,
  OpKpiSm,
} from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { formatDelta } from "@/lib/analytics/campaign-metrics";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import {
  fetchMortalityDisposition,
  fetchPrevMortalityTotal,
} from "@/lib/analytics/mortality-metrics";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchDeathCausesTrend,
  fetchKpiTrend,
  toneForTarget,
} from "@/lib/metrics";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { deathCauseLabel, formatPercent, pluralizeEs } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const BUCKET_LABELS: Record<string, string> = {
  cremation: "Cremación",
  burial: "Sepultura / cementerio",
  rendering: "Reciclaje sanitario",
  other: "Otro / sin especificar",
};

// Species domain axis — mirrors /gob/perdidas' SPECIES_OPTIONS exactly.
// pets.species is free text ('dog' | 'cat' | 'other' in practice); "other" is
// the exact stored value the fetchers honor as-is (no query change).
const SPECIES_OPTIONS = [
  { value: "dog", label: "Perro" },
  { value: "cat", label: "Gato" },
  { value: "other", label: "Otra" },
];

// Death-cause domain axis — the deathRecorded event schema's `cause` enum
// (lib/events/event-schemas.ts) is a closed set; fetchMortalityDisposition
// already COALESCEs a missing cause to 'unknown', so that value is included
// here as a selectable option rather than only appearing unbidden in the chart.
const DEATH_CAUSE_VALUES = [
  "known",
  "unknown",
  "natural",
  "disease",
  "accident",
  "euthanasia",
  "sudden",
  "violent",
  "other",
] as const;
const CAUSE_OPTIONS = DEATH_CAUSE_VALUES.map((value) => ({
  value,
  label: deathCauseLabel(value),
}));

export default async function GobMortalidadPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
    species?: string;
    cause?: string;
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

  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });
  // Both undefined unless role === "admin" (resolveJurisdictionScope's guarantee) —
  // hoisted once so every fetcher below shares the identical admin-scope value
  // (same pattern as /gob/perdidas).
  const adminProvince = adminSelectedProvince ?? undefined;
  const adminLocality = adminSelectedLocality ?? undefined;
  const species = sp.species || undefined;
  // Validate against the closed cause enum so an invalid URL value never
  // drives the query (same discipline as /gob/perdidas' parseStatusFilter).
  const cause =
    sp.cause && (DEATH_CAUSE_VALUES as readonly string[]).includes(sp.cause) ? sp.cause : undefined;

  const period = resolveAnalyticsPeriod(sp);
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });
  // Snapshot projection + the D1 cause-by-period trend + death sparkline run in
  // parallel over the same scoped death_recorded population. fetchPrevMortalityTotal
  // adds ONE new query (same scope, shifted one period back) purely to power the
  // "Muertes (período)" deltaV2 chip — mirrors campaign-metrics.ts' fetchPrevTotals.
  //
  // species + cause narrow every fetcher below identically (fetchMortalityDisposition
  // shares ONE `where` across all its sub-queries) so the KPI row, disposition bars,
  // context splits, causes-by-week chart, and locality breakdown all agree. The
  // death sparkline (fetchKpiTrend) only takes species — "cause" is a
  // death_recorded-payload-specific field, not something the generic
  // event-type trend helper models; the sparkline is a decorative secondary
  // signal, not the headline tile, so this is an accepted minor inconsistency
  // when a cause filter is active.
  const [m, causesTrend, deathSparkline, prevTotal] = await Promise.all([
    fetchMortalityDisposition(ctx, { species, cause }),
    fetchDeathCausesTrend(ctx, { species, cause }),
    fetchKpiTrend("death_recorded", ctx, { species }),
    fetchPrevMortalityTotal(ctx, { species, cause }),
  ]);

  const deathsDelta = formatDelta(m.total, prevTotal, "vs período anterior");

  const maxBucket = m.byBucket.reduce((acc, b) => Math.max(acc, b.count), 0);
  const localityCells = m.byLocality.value;
  const maxLocality = localityCells.reduce((acc, c) => Math.max(acc, c.count), 0);
  const showBreach = m.unknownRate > TARGETS.DISPOSAL_UNKNOWN_BREACH_PCT;
  const hasDeaths = m.total > 0;

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
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia sanitaria · Mortalidad y disposición
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Mortalidad y disposición
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Trazabilidad de la disposición final de fallecimientos (Ley CABA 5470) en tu cobertura."}
        </p>
      </header>

      {/* Unified filter bar — jurisdiction + period + species/cause axes +
          active-filter chips. */}
      <OpFilterBar
        period={{ defaultPreset: "trailing12m" }}
        jurisdiction={{ allowedProvinces, localities }}
        axes={
          [
            {
              id: "species",
              label: "Especie",
              paramKey: "species",
              options: SPECIES_OPTIONS,
              current: species ?? null,
            },
            {
              id: "cause",
              label: "Causa",
              paramKey: "cause",
              options: CAUSE_OPTIONS,
              current: cause ?? null,
            },
          ] satisfies OpFilterAxis[]
        }
      />

      {/* Conditional breach banner — low disposal traceability */}
      {showBreach && (
        <OpBreach
          title="Baja trazabilidad de disposición"
          detail={`${formatPercent(m.unknownRate)} de los fallecimientos no tienen método de disposición registrado (umbral ${TARGETS.DISPOSAL_UNKNOWN_BREACH_PCT}%).`}
        />
      )}

      {/* KPI row */}
      <section
        aria-label="Indicadores de mortalidad"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Muertes (período)"
          value={hasDeaths ? m.total.toLocaleString("es-AR") : "—"}
          sub={hasDeaths ? "fallecimientos registrados" : "Sin datos en el período"}
          tone={!hasDeaths ? "neutral" : undefined}
          deltaV2={hasDeaths ? (deathsDelta ?? undefined) : undefined}
          sparkline={deathSparkline.points.map((p) => p.y)}
          info={{
            definition:
              "Total de eventos death_recorded registrados en el período y jurisdicción seleccionados.",
            formula: "COUNT(death_recorded) en scope + período",
          }}
          descriptorId="mortality_deaths_period"
          guardInput={{ n: m.total, priorBase: prevTotal }}
        />
        <OpKpi
          label="Trazabilidad de disposición"
          // Honesty (backlog H1): with no deaths in scope every rate is 0/0 → 0%,
          // which toneForTarget paints RED (false alarm) / GREEN (false success).
          // Gate the rate tiles on hasDeaths → "—" neutral, like the count tile.
          value={hasDeaths ? formatPercent(m.traceableRate) : "—"}
          tone={
            hasDeaths
              ? toneForTarget(m.traceableRate, TARGETS.DISPOSAL_TRACEABILITY_PCT)
              : "neutral"
          }
          bar={hasDeaths ? m.traceableRate : undefined}
          sub={`meta ${TARGETS.DISPOSAL_TRACEABILITY_PCT}% · método + instalación (B3 · Ley 5470)`}
          info={getKpiInfo("mortality_disposal_traceability")}
          descriptorId="mortality_disposal_traceability"
          guardInput={{ n: m.total }}
        />
        <OpKpi
          label={KPI_CATALOG.mortality_unknown_disposal_rate.label}
          value={hasDeaths ? formatPercent(m.unknownRate) : "—"}
          tone={
            hasDeaths
              ? toneForTarget(m.unknownRate, TARGETS.DISPOSAL_UNKNOWN_BREACH_PCT, {
                  higherIsBetter: false,
                })
              : "neutral"
          }
          sub="sin método registrado (B4)"
          info={{
            definition:
              "Porcentaje de fallecimientos sin método de disposición registrado (campo disposition_method ausente o con valor 'unknown'). Es el complemento negativo de la trazabilidad (B4).",
            formula: "deaths con (disposition_method IS NULL OR = 'unknown') / total",
            caveat: `Se activa alerta visual cuando supera el ${TARGETS.DISPOSAL_UNKNOWN_BREACH_PCT}%.`,
          }}
          descriptorId="mortality_unknown_disposal_rate"
          guardInput={{ n: m.total }}
        />
        <OpKpi
          label={KPI_CATALOG.mortality_reportable_share.label}
          value={hasDeaths ? formatPercent(m.reportableShare) : "—"}
          tone={hasDeaths && m.reportableShare > 0 ? "warn" : undefined}
          sub="del total (B9)"
          info={{
            definition:
              "Porcentaje de fallecimientos que corresponden a enfermedades de notificación obligatoria (campo is_reportable = true). Un valor > 0 requiere notificación a la autoridad sanitaria (B9).",
            formula: "deaths con (is_reportable = true) / total",
            caveat:
              "Cualquier valor > 0% activa una indicación de atención: esos fallecimientos requieren notificación ENO.",
          }}
          descriptorId="mortality_reportable_share"
          guardInput={{ n: m.total }}
        />
      </section>

      {/* Disposición — B2 bucket bars + Contexto — B7 splits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpCard aria-labelledby={panelDispId}>
          <OpCardHead title={<span id={panelDispId}>Disposición</span>} />
          <OpCardBody>
            {m.byBucket.length === 0 ? (
              // C4 (2026-07-22, §S4): death_recorded only exists in MiMAR if
              // an owner/vet logs it — a physical death that's never logged
              // reads identically to "no deaths". no-signal, not "all clear".
              <LnEmptyState
                icon="eye-off"
                nature="no-signal"
                title="Sin fallecimientos registrados en MiMAR"
                description="La ausencia de registro no implica ausencia de mortalidad en tu cobertura — depende de que un dueño o profesional lo registre."
              />
            ) : (
              <figure
                role="img"
                aria-label={`Disposición final de fallecimientos — ${m.byBucket.length} ${pluralizeEs(
                  m.byBucket.length,
                  "método",
                )}. Máximo: ${maxBucket} ${pluralizeEs(maxBucket, "fallecimiento")}.`}
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
                        aria-label={`${label}: ${b.count} ${pluralizeEs(b.count, "fallecimiento")} (${Math.round(pct)}% del máximo)`}
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
                <p className="mt-1.5 text-xs text-ln-op-mute">
                  Escala: 0 – {maxBucket} {pluralizeEs(maxBucket, "fallecimiento")} · cada barra
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
                value={hasDeaths ? formatPercent(m.contextSplits.vetConfirmedRate) : "—"}
                sub="del total"
              />
              <OpKpiSm
                label="En clínica"
                value={hasDeaths ? formatPercent(m.contextSplits.deathAtClinicRate) : "—"}
                sub="muertes en establecimiento"
              />
              <OpKpiSm
                label="Crematorio privado"
                value={hasDeaths ? formatPercent(m.contextSplits.privateCrematoriumRate) : "—"}
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
              <span className="text-sm font-normal text-ln-op-mute">
                {causesTrend.suppressedCount}{" "}
                {causesTrend.suppressedCount === 1 ? "celda oculta" : "celdas ocultas"} (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasCausesTrend ? (
            // C4 (2026-07-22, §S4): same reporting dependency as the
            // disposal panel above — no-signal, not "all clear".
            <LnEmptyState
              icon="eye-off"
              nature="no-signal"
              title="Sin fallecimientos registrados en MiMAR"
              description="La ausencia de registro no implica ausencia de mortalidad — depende de que un dueño o profesional lo registre en el rango y la cobertura seleccionados."
            />
          ) : (
            <StackedTimeSeriesChartDynamic
              seriesKeys={causesTrend.series.seriesKeys}
              points={causesTrend.series.points}
              seriesLabels={Object.fromEntries(
                causesTrend.series.seriesKeys.map((key) => [key, deathCauseLabel(key)]),
              )}
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
              <span className="text-sm font-normal text-ln-op-mute">
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
              aria-label={`Fallecimientos por localidad — máximo: ${maxLocality} ${pluralizeEs(maxLocality, "fallecimiento")}.`}
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
                      aria-label={`${c.key}: ${c.count} ${pluralizeEs(c.count, "fallecimiento")}`}
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
              <p className="mt-1.5 text-xs text-ln-op-mute">
                Escala: 0 – {maxLocality} {pluralizeEs(maxLocality, "fallecimiento")} · celdas &lt;
                5 ocultas (k-anonimato).
              </p>
            </figure>
          )}
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
