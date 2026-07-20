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
//   Coropleta    — <PanoramaEmbed> (esterilización por provincia, capa panorama · #51)
//   Freshness footer
//
// PANORAMA NOTE: The Paquete G Panorama layer/preset (population-control map layer
// and preset in /gob/panorama) is deferred to a separate work unit. This page is
// the standalone jurisdiction dashboard — not the Panorama integration.

import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { PanoramaEmbed } from "@/components/panorama/PanoramaEmbed";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpCard,
  OpCardBody,
  OpCardHead,
  type OpFilterAxis,
  OpFilterBar,
  OpKpi,
} from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { formatDelta } from "@/lib/analytics/campaign-metrics";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchActivePregnancies,
  fetchDewormingCoverage,
  fetchNetGrowth,
  fetchPrevRegisteredBirths,
  fetchReproductiveOutcomes,
  fetchSterilizationCoverage,
  fetchSterilizationNatalidadRatio,
  fetchSterilizationTrend,
  toneForTarget,
} from "@/lib/metrics";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { formatPercent, formatRate } from "@/lib/utils/format";
import { gobEmbedView } from "@/src/modules/panorama/domain/embed-view";

export const dynamic = "force-dynamic";

// Species domain axis — mirrors /gob/perdidas' SPECIES_OPTIONS exactly.
// pets.species is free text ('dog' | 'cat' | 'other' in practice); "other" is
// the exact stored value the fetchers honor as-is (no query change).
const SPECIES_OPTIONS = [
  { value: "dog", label: "Perro" },
  { value: "cat", label: "Gato" },
  { value: "other", label: "Otra" },
];

export default async function GobPoblacionPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
    species?: string;
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

  // "Exportar CSV" always mirrors the active period + jurisdiction filters —
  // the export route re-derives filteredJurisdictions from the same params.
  const exportParams = new URLSearchParams();
  if (sp.period) exportParams.set("period", sp.period);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  if (sp.province) exportParams.set("province", sp.province);
  if (sp.locality) exportParams.set("locality", sp.locality);
  const exportHref = `/gob/poblacion/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;

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

  const period = resolveAnalyticsPeriod(sp);
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Header + filters render in both the data and degraded (timeout) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Registro · Control poblacional
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Control poblacional</h1>
      <p className="text-[13px] text-ln-op-mute">
        {profile.role === "admin"
          ? "Vista universal — todas las jurisdicciones."
          : "Cobertura de esterilización, reproducción activa y balance poblacional en tu cobertura."}
      </p>
    </header>
  );
  // Unified filter bar — jurisdiction + period, with "Exportar CSV" rendered
  // via the bar's `actions` slot (header row) instead of floating beside it.
  const filtersRow = (
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
            current: sp.species ?? null,
          },
        ] satisfies OpFilterAxis[]
      }
      actions={
        <a href={exportHref} className="text-[var(--text-md)] text-ln-op-azul hover:underline">
          Exportar CSV →
        </a>
      }
    />
  );

  // Bound the fetcher set with a deadline so a degraded DB yields an honest
  // "reintentar" state instead of an unbounded hang (parity with /admin/poblacion).
  // fetchPrevRegisteredBirths adds ONE new query (same scope, shifted one
  // period back) purely to power the "Nacimientos registrados" deltaV2 chip —
  // mirrors campaign-metrics.ts' fetchPrevTotals pattern.
  // species narrows every fetcher below identically so the KPI row, ratio
  // tile, net-growth breakdown, trend, and choropleth all agree (domain-axes work).
  const load = await loadWithTimeout(
    Promise.all([
      fetchSterilizationCoverage(ctx, { species }),
      fetchActivePregnancies(ctx, { species }),
      fetchReproductiveOutcomes(ctx, { species }),
      fetchNetGrowth(ctx, { species }),
      fetchSterilizationNatalidadRatio(ctx, { species }),
      fetchSterilizationTrend(ctx, { species }),
      fetchDewormingCoverage(ctx, { species }),
      fetchPrevRegisteredBirths(ctx, { species }),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        {filtersRow}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/poblacion", sp)}
        />
      </div>
    );
  }

  const [
    coverage,
    activePregnancies,
    outcomes,
    netGrowth,
    sterilNatalidadRatio,
    sterilTrend,
    deworming,
    prevRegisteredBirths,
  ] = load.value;

  const registeredBirthsDelta = formatDelta(
    outcomes.registeredBirths,
    prevRegisteredBirths,
    "vs período anterior",
  );

  const hasData = coverage.total > 0;
  const dewormingTone = toneForTarget(deworming.rate, TARGETS.STERILIZATION_COVERAGE_PCT);
  const hasTrend = sterilTrend.points.length > 0;

  const coverageTone = toneForTarget(coverage.rate, TARGETS.STERILIZATION_COVERAGE_PCT);

  // Net growth: directional only. Tone is neutral — sign alone is meaningful
  // but exact value is not because registeredBirths under-counts natalidad.
  const netTone = "neutral" as const;

  const panelTrendId = "panel-esterilizacion-titulo";
  const panelMapId = "panel-mapa-titulo";

  const natalidadCaveatText = "Solo partos en seguimiento — subestima la natalidad real";
  // metric-honesty 2026-07-09: the ratio's denominator (partos registrados)
  // under-counts real natalidad, so the ratio OVER-states population control.
  // Spell that out — the old sub-line only said the natalidad was under-counted,
  // never that the ratio itself therefore reads too optimistically.
  const ratioOverstatementCaveat =
    "Contexto, no indicador de decisión: el denominador (partos en seguimiento) subestima la natalidad real, por lo que este ratio SOBRESTIMA la contención poblacional.";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Filters row */}
      {filtersRow}

      {/* KPI row */}
      <section
        aria-label="Indicadores de control poblacional"
        className="grid grid-cols-2 md:grid-cols-5 gap-3"
      >
        {/* KPI 1: Sterilization coverage — with target bar + tone */}
        <OpKpi
          label="Cobertura de esterilización"
          value={hasData ? formatPercent(coverage.rate) : "—"}
          bar={hasData ? coverage.rate : undefined}
          tone={hasData ? coverageTone : "neutral"}
          sub={
            hasData
              ? `meta programática 70% · ${coverage.sterilized.toLocaleString("es-AR")} de ${coverage.total.toLocaleString("es-AR")}`
              : "Sin datos en la cobertura"
          }
          sparkline={hasTrend ? sterilTrend.points.map((p) => p.y) : undefined}
          info={getKpiInfo("sterilization_coverage_population")}
        />

        {/* KPI 1b: Deworming coverage — sanitary sibling of esterilización, 12m window */}
        <OpKpi
          label="Cobertura antiparasitaria"
          value={deworming.total > 0 ? formatPercent(deworming.rate) : "—"}
          bar={deworming.total > 0 ? deworming.rate : undefined}
          tone={deworming.total > 0 ? dewormingTone : "neutral"}
          sub={
            deworming.total > 0
              ? `últimos 12 meses · ${deworming.dewormed.toLocaleString("es-AR")} de ${deworming.total.toLocaleString("es-AR")}`
              : "Sin datos en la cobertura"
          }
          info={getKpiInfo("deworming_coverage_population")}
        />

        {/* KPI 2: Active pregnancies */}
        <OpKpi
          label="Preñeces activas"
          value={activePregnancies.toLocaleString("es-AR")}
          sub="preñez registrada y aún no cerrada"
          tone={activePregnancies > 0 ? "warn" : "neutral"}
          info={getKpiInfo("active_pregnancies")}
        />

        {/* KPI 3: Registered births — with natalidad caveat */}
        <OpKpi
          label="Nacimientos registrados"
          value={outcomes.registeredBirths.toLocaleString("es-AR")}
          sub={natalidadCaveatText}
          tone="neutral"
          deltaV2={registeredBirthsDelta ?? undefined}
          info={{
            definition:
              "Eventos clinical_info_logged con sub_kind='pregnancy', pregnancy_phase='ended' y outcome='live_birth' en el período seleccionado, en el scope de jurisdicción.",
            formula:
              "COUNT(clinical_info_logged WHERE sub_kind='pregnancy' AND pregnancy_phase='ended' AND outcome='live_birth' AND period AND scope)",
            caveat:
              "Solo cuenta partos de preñeces registradas en el sistema. Partos callejeros y camadas sin seguimiento son invisibles. Este número subestima la natalidad real — tratarlo como indicador direccional, no como dato exacto.",
          }}
        />

        {/* KPI 4: Net registry inflow — directional, neutral tone.
            demo-review M2: this read "Balance poblacional +3.619", which a
            funcionario reads as "the population grew by 3,619" — but "altas"
            is pets.created_at (new REGISTRATIONS in miMAR, including
            pre-existing animals just now onboarded), not new animals born.
            Relabeled to name what's actually summed; the caveat now says so
            explicitly instead of only warning about the natality undercount. */}
        <OpKpi
          label="Altas netas registradas"
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
              "INDICADOR DIRECCIONAL, NO EXACTO — no es crecimiento poblacional real. 'Altas nuevas' son mascotas RECIÉN REGISTRADAS en miMAR (pets.created_at), que en su mayoría ya existían y no representan nacimientos. Los nacimientos registrados solo cubren partos en seguimiento — callejero y camadas sin registro son invisibles. Un valor positivo refleja sobre todo ritmo de adopción del sistema, no necesariamente más mascotas vivas.",
          }}
        />
      </section>

      {/* Ratio esterilización/natalidad — CONTEXT tile (metric-honesty
          2026-07-09). Demoted out of the headline: it OVER-states population
          control because its denominator (partos en seguimiento) under-counts
          real natalidad. Smaller value + explicit "sobrestima" caveat so it
          never reads as a decision headline. */}
      {sterilNatalidadRatio !== null && (
        <section aria-label={KPI_CATALOG.sterilization_natalidad_ratio.label}>
          <div className="rounded-xl border border-ln-op-line bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ln-op-mute">
              Contexto · Ratio esterilización / natalidad registrada
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ln-op-ink">
              {formatRate(sterilNatalidadRatio, { decimals: 2 })}
            </p>
            <p className="mt-1 text-[11px] text-ln-op-mute">
              esterilizaciones del período por parto en seguimiento
            </p>
            <p className="mt-1 text-[11px] italic text-ln-op-mute">{ratioOverstatementCaveat}</p>
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
              description="No hay esterilizaciones registradas en el rango y la cobertura seleccionados."
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

      {/* Panorama embed (#51) — the SAME per-province sterilization ratePct
          choropleth, now rendered through the shared panorama surface. Data is
          byte-identical: the esterilizacion layer's province loader delegates to
          fetchSterilizationCoverage(...).byProvince — the very coverage value the
          KPI tile above already uses. A national frozen view keeps the province
          aggregation axis; /api/panorama/[layer] fences govt scope server-side. */}
      {coverage.byProvince.length > 0 && (
        <OpCard aria-labelledby={panelMapId}>
          <OpCardHead
            title={<span id={panelMapId}>Cobertura de esterilización por provincia</span>}
          />
          <OpCardBody>
            {profile.role !== "admin" && (sp.province || sp.locality) && (
              <p className="mb-2 text-[var(--text-sm)] text-ln-op-mute">
                El mapa muestra tu asignación completa; el filtro de jurisdicción no se aplica en
                esta vista.
              </p>
            )}
            <PanoramaEmbed viewState={gobEmbedView("esterilizacion", "trailing12m")} height={400} />
          </OpCardBody>
        </OpCard>
      )}

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
