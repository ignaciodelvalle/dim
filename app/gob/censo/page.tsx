// /gob/censo — Censo poblacional & salud del registro (Paquete E).
//
// Jurisdiction-scoped, period-aware gobierno screen answering:
// "¿Crece y está sano el registro de mascotas?"
//
// Layout (Op* design system):
//   KPI row      — total registradas · activas · dormant · perfiles incompletos
//   Altas nuevas — TimeSeriesChart (registrationTrend, pets.created_at)
//   Embudo       — horizontal bars in OpCard (mortalidad "Disposición" pattern)
//   Coropleta    — MapChoroplethDynamic (registryByProvince)
//   Freshness footer

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpFilterBar, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { toChoroplethData } from "@/lib/analytics/choropleth-data";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  DORMANT_MONTHS_DEFAULT,
  TARGETS,
  buildProjectionContext,
  funnelPercents,
  identificationFunnel,
  registrationTrend,
  registryByProvince,
  registryCounts,
  toneForTarget,
} from "@/lib/metrics";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { formatPercent } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function GobCensoPage({
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
          description="Tu rol no tiene acceso al censo. Pedile al admin que te asigne capabilities."
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
  const exportHref = `/gob/censo/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;

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

  const period = resolveAnalyticsPeriod(sp);
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Header + filters render in both the data and degraded (timeout) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Registro · Censo poblacional
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
        Censo y salud del registro
      </h1>
      <p className="text-[13px] text-ln-op-mute">
        {profile.role === "admin"
          ? "Vista universal — todas las jurisdicciones."
          : "Crecimiento del padrón, mascotas dormant y calidad de identificación en tu cobertura."}
      </p>
    </header>
  );
  // Unified filter bar — jurisdiction + period, with "Exportar CSV" rendered
  // via the bar's `actions` slot (header row) instead of floating beside it.
  const filtersRow = (
    <OpFilterBar
      period={{ defaultPreset: "trailing12m" }}
      jurisdiction={{ allowedProvinces, localities }}
      actions={
        <a href={exportHref} className="text-[var(--text-md)] text-ln-op-azul hover:underline">
          Exportar CSV →
        </a>
      }
    />
  );

  // Bound the fetcher set with a deadline so a degraded DB yields an honest
  // "reintentar" state instead of an unbounded hang (parity with /admin/censo).
  const load = await loadWithTimeout(
    Promise.all([
      registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
      registrationTrend(ctx),
      identificationFunnel(ctx),
      registryByProvince(ctx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        {filtersRow}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/censo", sp)}
        />
      </div>
    );
  }

  const [counts, trend, funnel, provinceRows] = load.value;

  const hasData = counts.total > 0;
  const hasTrend = trend.points.length > 0;

  const dormantPct = counts.total > 0 ? Math.round((counts.dormant / counts.total) * 100) : 0;
  const incompletePct = counts.total > 0 ? Math.round((counts.incomplete / counts.total) * 100) : 0;
  const chipPct = funnel.total > 0 ? Math.round((funnel.chipped / funnel.total) * 100) : 0;

  const fPct = funnelPercents(funnel);

  // task #31c dedup: shared toChoroplethData (same shaping as /gob/poblacion)
  const choroplethData = toChoroplethData(provinceRows, (r) => r.count);

  const maxFunnel = funnel.total;

  const panelTrendId = "panel-altas-titulo";
  const panelFunnelId = "panel-embudo-titulo";
  const panelMapId = "panel-mapa-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Filters row */}
      {filtersRow}

      {/* KPI row */}
      <section aria-label="Indicadores del censo" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpKpi
          label="Total registradas"
          value={hasData ? counts.total.toLocaleString("es-AR") : "—"}
          sub={hasData ? "mascotas activas o extraviadas" : "Sin datos en la cobertura"}
          tone={!hasData ? "neutral" : undefined}
          sparkline={hasTrend ? trend.points.map((p) => p.y) : undefined}
          info={{
            definition:
              "Total de mascotas con status 'active' o 'lost' en el scope de jurisdicción.",
            formula: "COUNT(pets) WHERE status IN ('active','lost') AND scope",
          }}
        />
        <OpKpi
          label="Activas"
          value={hasData ? counts.active.toLocaleString("es-AR") : "—"}
          sub={hasData ? "con status activo (excluye extraviadas)" : undefined}
          tone={!hasData ? "neutral" : undefined}
          info={{
            definition: "Mascotas con status='active' en scope (excluye 'lost').",
            formula: "COUNT(pets) WHERE status = 'active' AND scope",
          }}
        />
        <OpKpi
          label="Inactivas"
          value={hasData ? counts.dormant.toLocaleString("es-AR") : "—"}
          sub={`sin actividad >${TARGETS.DORMANT_MONTHS}m · ${dormantPct}% del total`}
          tone={
            hasData && dormantPct > 40 ? "danger" : hasData && dormantPct > 20 ? "warn" : undefined
          }
          info={{
            definition: `Mascotas activas/extraviadas sin ningún evento de actividad del propietario en los últimos ${TARGETS.DORMANT_MONTHS} meses. Mascotas sin ningún evento registrado también cuentan como dormant.`,
            formula: `NOT EXISTS (pet_events WHERE event_type <> 'credential_scanned' AND occurred_at >= now - ${TARGETS.DORMANT_MONTHS}m)`,
            caveat:
              "Los eventos credential_scanned se excluyen porque se purgan automáticamente a los 90 días y no representan actividad del propietario.",
          }}
        />
        <OpKpi
          label="Perfiles incompletos"
          value={hasData ? counts.incomplete.toLocaleString("es-AR") : "—"}
          sub={`${incompletePct}% del total · sin chip, sexo o localidad`}
          tone={
            hasData && incompletePct > 30
              ? "danger"
              : hasData && incompletePct > 15
                ? "warn"
                : undefined
          }
          info={{
            definition:
              "Mascotas activas/extraviadas que no tienen al menos uno de: chip ISO activo, sexo conocido (≠ 'unknown'), o localidad de jurisdicción.",
            formula:
              "NOT EXISTS active microchip_iso OR sex = 'unknown' OR jurisdiction_locality IS NULL",
          }}
        />
      </section>

      {/* Altas nuevas — registration trend */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Altas nuevas</span>}
          actions={
            trend.suppressedCount > 0 ? (
              <span className="text-sm font-normal text-ln-op-mute">
                {trend.suppressedCount}{" "}
                {trend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"} (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin altas en el período"
              description="No hay mascotas registradas en el rango y la cobertura seleccionados."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={trend.points}
              seriesLabel="Altas nuevas"
              yLabel="Mascotas registradas"
              variant="area"
              fallbackTableLabel={`Altas nuevas por ${trend.granularity === "month" ? "mes" : "semana"}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      {/* Embudo de identificación — horizontal bars (mortalidad Disposición pattern) */}
      <OpCard aria-labelledby={panelFunnelId}>
        <OpCardHead title={<span id={panelFunnelId}>Embudo de identificación</span>} />
        <OpCardBody>
          {funnel.total === 0 ? (
            <LnEmptyState
              icon="heart"
              title="Sin datos de identificación"
              description="No hay mascotas en la cobertura seleccionada."
            />
          ) : (
            <figure
              role="img"
              aria-label={`Embudo de identificación — ${funnel.total} mascotas en total.`}
            >
              <figcaption className="sr-only">
                Gráfico de barras horizontales: etapas del embudo de identificación de mascotas.
                Cada barra muestra el porcentaje de mascotas que alcanzan esa etapa del total.
              </figcaption>
              <ul className="space-y-2" aria-label="Etapas del embudo de identificación">
                {/* Stage 1: Total */}
                <li
                  className="flex items-center gap-3"
                  aria-label={`Total: ${funnel.total.toLocaleString("es-AR")} mascotas (100%)`}
                >
                  <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                    Total registradas
                  </span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div className="h-full rounded bg-ln-op-azul" style={{ width: "100%" }} />
                  </div>
                  <span
                    className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                    aria-hidden="true"
                  >
                    {funnel.total.toLocaleString("es-AR")} (100%)
                  </span>
                </li>

                {/* Stage 2: Chipped */}
                {(() => {
                  const pct = fPct.chipped;
                  const tone = toneForTarget(chipPct, TARGETS.MICROCHIP_PENETRATION_PCT);
                  const barColor =
                    tone === "ok"
                      ? "bg-ln-op-ok"
                      : tone === "warn"
                        ? "bg-ln-op-warn"
                        : "bg-ln-op-danger";
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`Con chip: ${funnel.chipped.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        Con chip ISO activo
                      </span>
                      <div
                        className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.chipped.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}

                {/* Stage 3: ISO válido */}
                {(() => {
                  const pct = fPct.isoValid;
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`ISO válido: ${funnel.isoValid.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        ISO 11784/11785 válido
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
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.isoValid.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}

                {/* Stage 4: Escaneada en el período */}
                {(() => {
                  const pct = fPct.scanned;
                  return (
                    <li
                      className="flex items-center gap-3"
                      aria-label={`Escaneada en el período: ${funnel.scanned.toLocaleString("es-AR")} mascotas (${formatPercent(pct)})`}
                    >
                      <span className="w-44 shrink-0 text-[13px] text-ln-op-ink">
                        Escaneada en el período
                        <span className="sr-only"> (eventos de los últimos 90 días solamente)</span>
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
                        className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink"
                        aria-hidden="true"
                      >
                        {funnel.scanned.toLocaleString("es-AR")} ({formatPercent(pct)})
                      </span>
                    </li>
                  );
                })()}
              </ul>
              <p className="mt-2 text-xs text-ln-op-mute">
                Meta chip: {TARGETS.MICROCHIP_PENETRATION_PCT}% · Escaneada en el período: solo
                últimos 90 días (los eventos se purgan automáticamente).
              </p>
            </figure>
          )}
        </OpCardBody>
      </OpCard>

      {/* Coropleta por provincia */}
      {choroplethData.length > 0 && (
        <OpCard aria-labelledby={panelMapId}>
          <OpCardHead title={<span id={panelMapId}>Distribución por provincia</span>} />
          <OpCardBody>
            <MapChoroplethDynamic
              data={choroplethData}
              level="province"
              scaleLabel="Mascotas registradas"
              fallbackTableLabel="Mascotas registradas por provincia"
              height={400}
            />
          </OpCardBody>
        </OpCard>
      )}

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
