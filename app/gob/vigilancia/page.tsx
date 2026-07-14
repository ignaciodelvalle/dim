import Link from "next/link";

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpKpi,
} from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { aggregateChoroplethData } from "@/lib/analytics/choropleth-data";
import {
  computeDiseaseSummary,
  fetchCasesPerLocality,
  fetchCasesPerSubregion,
  fetchSurveillanceSignals,
  fetchVigilanciaMetrics,
  fetchZoonosisTrend,
} from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchSurveillanceCompliance } from "@/lib/analytics/surveillance-metrics";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  buildProjectionContext,
  fetchKpiTrend,
  fetchMovementCorridors,
  windows,
} from "@/lib/metrics";
import { getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { findDisease } from "@/lib/reference/diseases";
import { DiseaseSummaryTable } from "./_components/DiseaseSummaryTable";
import { OutbreakSignalRow } from "./_components/OutbreakSignalRow";

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
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing30d();
  const { since } = period;

  const { filteredJurisdictions, localities, allowedProvinces, selectedProvince } =
    await resolveJurisdictionScope({
      role: profile.role,
      jurisdictions,
      params: { province: sp.province, locality: sp.locality },
    });

  // Raw selected province ISO gates the sub-region (department/barrio) choropleth
  // drill below — passed as an explicit predicate to fetchCasesPerSubregion.
  const selectedProvinceIso = sp.province ?? null;

  // The disease summary always covers the last 30 days regardless of the
  // period picker. When the period picker is also 30d, signals30d doubles
  // as the signals panel data — no second DB round-trip needed.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const periodMatchesSummary = sp.period === "30d" || !sp.period;

  // Item 3 — surveillance compliance projections (ENO SLA A7, rabies 10-day
  // compliance A8/A9, AMR density A12, reportable incidence + lab-confirmation
  // A6/A10). Built on lib/metrics ProjectionContext (jurisdiction-scoped,
  // period-aware, k-anonymity enforced). Server fetch; the cards below are
  // presentational.
  const complianceCtx = buildProjectionContext(actor, filteredJurisdictions, period);

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        Vigilancia epidemiológica
      </p>
      <h1 className="text-[var(--text-2xl)] font-semibold text-ln-op-ink">Mapa de vigilancia</h1>
      <p className="text-[var(--text-md)] text-ln-op-mute">
        {profile.role === "admin"
          ? "Vista universal — todas las jurisdicciones."
          : "Señales de zoonosis y enfermedades reportables detectadas en tu cobertura."}
      </p>
    </header>
  );

  // D2: bound the fetcher set with a deadline so a pathological query degrades
  // to an honest "tardando… reintentar" state instead of hanging the page.
  const load = await loadWithTimeout(
    Promise.all([
      fetchVigilanciaMetrics(actor, filteredJurisdictions),
      fetchSurveillanceSignals(actor, filteredJurisdictions, { since: since30d }),
      fetchCasesPerLocality(actor, filteredJurisdictions),
      fetchZoonosisTrend(actor, filteredJurisdictions, { since }),
      periodMatchesSummary
        ? null
        : fetchSurveillanceSignals(actor, filteredJurisdictions, { since }),
      // When a province is selected, fetch department/barrio-level case counts.
      // For the national view (no province), this is null and the choropleth
      // stays at province level (no behavior change).
      selectedProvinceIso
        ? fetchCasesPerSubregion(actor, filteredJurisdictions, selectedProvinceIso)
        : Promise.resolve(null),
      fetchSurveillanceCompliance(complianceCtx),
      // Sparklines for KPI tiles (Fase 0).
      fetchKpiTrend("outbreak_signal", complianceCtx),
      fetchKpiTrend("rabies_observation_started", complianceCtx),
      fetchKpiTrend("vaccination_administered", complianceCtx),
      // Movilidad jurisdiccional / CVI — mobility is an epidemiological vector
      // (a moved animal carries its exposure into a new jurisdiction).
      fetchMovementCorridors(complianceCtx),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/vigilancia", sp)}
        />
      </div>
    );
  }

  const [
    metrics,
    signals30d,
    mapData,
    trend,
    signalsPeriod,
    subregionData,
    compliance,
    outbreakSparkline,
    rabiesSparkline,
    vacSparkline,
    movement,
  ] = load.value;

  const signals = signalsPeriod ?? signals30d;
  const summary = computeDiseaseSummary(signals30d);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Shape map data into ChoroplethRegionDatum format (aggregate by province
  // code) — shared aggregateChoroplethData, same fold as /gob/perdidas
  // (task #31c dedup).
  const provinceChoroplethData = aggregateChoroplethData(
    mapData,
    (row) => row.code,
    (row) => row.count,
    (value) => `${value} caso${value !== 1 ? "s" : ""} abierto${value !== 1 ? "s" : ""}`,
  );

  // When a province is drilled into, build the sub-region choropleth.
  //
  // fetchCasesPerSubregion now returns the FULL sub-region set for the province
  // (every department / every barrio, with 0-default counts). So:
  //   - visibleCodes = every sub-region code → MapChoropleth filters the national
  //     GeoJSON to ONLY those polygons and frames the viewport to that province.
  //   - data = sub-regions WITH cases (count > 0) plus SUPPRESSED cells →
  //     0-case sub-regions fall through to the missing-color (grey) branch
  //     instead of the lightest scale color, so "no cases" reads as grey, not
  //     "few cases".
  //   - suppressed cells (1..4 cases, k-anon redacted at the fetcher) render
  //     with the hatch pattern and a privacy tooltip — never a number.
  let choroplethData = provinceChoroplethData;
  let mapGeojsonUrl: string | undefined = undefined;
  let mapVisibleCodes: string[] | undefined = undefined;
  let mapCardTitle = "Casos abiertos por jurisdicción";

  if (selectedProvinceIso && subregionData !== null) {
    mapVisibleCodes = subregionData.map((r) => r.code);
    choroplethData = subregionData
      .filter((r) => r.count > 0 || r.suppressed)
      .map((r) =>
        r.suppressed
          ? {
              code: r.code,
              value: 0,
              suppressed: true,
              label: `${r.name}: suprimido por privacidad (menos de 5 casos)`,
            }
          : {
              code: r.code,
              value: r.count,
              label: `${r.name}: ${r.count} caso${r.count !== 1 ? "s" : ""}`,
            },
      );
    if (selectedProvinceIso === "AR-C") {
      mapGeojsonUrl = "/geo/caba-barrios.geojson";
      mapCardTitle = "Casos abiertos por barrio — CABA";
    } else {
      mapGeojsonUrl = "/geo/ar-departments.geojson";
      mapCardTitle = `Casos abiertos por departamento — ${selectedProvince?.name ?? ""}`;
    }
  }

  // Shape trend data for TimeSeriesChart.
  const trendPoints = trend
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((t) => ({ x: t.x, y: t.y }));

  const panelMapId = "panel-mapa-titulo";
  const panelSignalsId = "panel-signals-titulo";
  const panelTrendId = "panel-trend-titulo";
  const panelRabiesId = "panel-rabies-titulo";
  const panelComplianceId = "panel-compliance-titulo";
  const panelEnoId = "panel-eno-titulo";
  const panelEnfId = "panel-enf-titulo";
  const panelAmrId = "panel-amr-titulo";
  const panelMovementId = "panel-movilidad-titulo";

  // Item 3 presentational helpers — render a metric or an em-dash placeholder.
  const { enoSla, rabiesCompliance, amrDensity, reportableIncidence } = compliance;
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  // byDisease.value is the branded SuppressedCells (Cell[]); the fetcher built
  // each cell with the extra `confirmed` field, so widen via unknown.
  const reportableCells = reportableIncidence.byDisease.value as unknown as ReadonlyArray<{
    key: string;
    count: number;
    confirmed: number;
  }>;

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* No-scope warning */}
      {noScope && (
        <OpCallout
          title="Sin localidades asignadas"
          body="Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos una."
          icon="⚠"
        />
      )}

      {/* Quick-access CTA: investigaciones. The former "Zoonosis" CTA (→
          /gob/vigilancia/zoonosis) was removed — that screen was a
          near-duplicate of this page's own disease-summary + trend panels
          below and the route now redirects here. */}
      <div className="grid grid-cols-1 sm:max-w-xs gap-3">
        <Link
          href="/gob/vigilancia/investigaciones"
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-4 py-3 no-underline transition-colors hover:bg-ln-op-stripe"
        >
          <span className="text-[var(--text-2xl)]" aria-hidden="true">
            🔬
          </span>
          <div>
            <p className="text-[var(--text-md)] font-semibold text-ln-op-ink">Investigaciones</p>
            <p className="text-[var(--text-sm)] text-ln-op-mute">Casos bajo investigación activa</p>
          </div>
        </Link>
      </div>

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
          sparkline={outbreakSparkline.points.map((p) => p.y)}
          href="/gob/vigilancia/brotes"
          info={{
            definition:
              "Cantidad de señales de brote (outbreak_signal) con estado 'open' en la jurisdicción en los últimos 30 días.",
            formula: "COUNT(outbreak_signal_opened events, últimos 30d) scoped to jurisdiction",
          }}
        />
        <OpKpi
          label="Rábicas activas"
          value={String(metrics.rabiesActiveCount)}
          tone={metrics.rabiesActiveCount > 0 ? "danger" : "neutral"}
          sparkline={rabiesSparkline.points.map((p) => p.y)}
          href={`#${panelRabiesId}`}
          info={{
            definition:
              "Cantidad de casos de observación rábica (caseKind='rabies_observation') con estado 'open' en la jurisdicción.",
            formula: "COUNT(cases WHERE caseKind='rabies_observation' AND status='open')",
          }}
        />
        <OpKpi
          label="Altas registradas hoy"
          value={String(metrics.petsRegisteredToday)}
          info={{
            definition:
              "Mascotas registradas en el sistema desde las 00:00 hora local de hoy (Arg/Buenos Aires), scoped a la jurisdicción del operador.",
            formula: "COUNT(pets WHERE created_at >= today midnight ART)",
          }}
        />
        <OpKpi
          label="Vacunaciones (7d)"
          value={String(metrics.vaccinationsThisWeek)}
          tone="ok"
          sparkline={vacSparkline.points.map((p) => p.y)}
          info={{
            definition:
              "Eventos vaccination_administered registrados en los últimos 7 días en la jurisdicción del operador.",
            formula: "COUNT(vaccination_administered, últimos 7d) scoped to jurisdiction",
          }}
        />
      </section>

      {/* Item 3 — compliance KPI row (A8 / A7 / A12) */}
      <section
        aria-label="Indicadores de cumplimiento sanitario"
        className="grid grid-cols-2 md:grid-cols-3 gap-3"
      >
        <OpKpi
          label="Cumplimiento observación 10d"
          value={pct(rabiesCompliance.compliancePct)}
          tone={
            rabiesCompliance.openBreaches > 0
              ? "danger"
              : rabiesCompliance.compliancePct === null
                ? "neutral"
                : "ok"
          }
          bar={rabiesCompliance.compliancePct ?? undefined}
          sub={
            rabiesCompliance.openBreaches > 0
              ? `${rabiesCompliance.openBreaches} abierta(s) > 10 días`
              : `${rabiesCompliance.closed} cerrada(s) en el período`
          }
          info={{
            definition:
              "Porcentaje de observaciones rábicas cerradas dentro del plazo legal de 10 días calendario (A8). Exigido por Ord. CABA 41.831 art. 9 y Decreto 4669/1973 PBA.",
            formula:
              "rabies_observation_ended con (ended_at − started_at) ≤ 10 días / total cerradas en período",
            caveat:
              "Las observaciones con más de 10 días sin cierre generan un incumplimiento vivo (A9) y activan el banner de alerta.",
          }}
        />
        <OpKpi
          label="SLA notificación ENO"
          value={pct(enoSla.onTimePct)}
          tone={enoSla.breachedOpen > 0 ? "warn" : enoSla.onTimePct === null ? "neutral" : "ok"}
          bar={enoSla.onTimePct ?? undefined}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} fuera de SLA`
              : enoSla.medianLatencyHours !== null
                ? `Mediana ${enoSla.medianLatencyHours} h`
                : "Sin entregas en el período"
          }
          info={getKpiInfo("eno_sla_compliance")}
        />
        <OpKpi
          label="Densidad ATM/AMR"
          value={amrDensity.per1000 === null ? "—" : String(amrDensity.per1000)}
          sub={
            amrDensity.provisionalUnclassified > 0
              ? `por 1.000 · ${amrDensity.provisionalUnclassified} sin clasificar (provisional)`
              : "antimicrobianos por 1.000 pets activos"
          }
          info={{
            definition:
              "Densidad de uso de antimicrobianos: inicios de tratamiento antimicrobiano por cada 1.000 mascotas activas en la jurisdicción (A12). Indicador de presión selectiva de resistencia antimicrobiana (AMR).",
            formula:
              "COUNT(medication_started donde drug_code ∈ catálogo antimicrobial) / activePets × 1.000",
            caveat:
              "Fármacos cuyo drug_code no está en el catálogo se reportan como 'sin clasificar' y NO se incluyen en la tasa (clasificación provisional).",
          }}
        />
      </section>

      {/* A9 — live breach banner: rabies observations open past the legal 10-day window. */}
      {rabiesCompliance.openBreaches > 0 && (
        <OpBreach
          icon="⚠"
          title={`${rabiesCompliance.openBreaches} observación(es) rábica(s) fuera del plazo legal de 10 días`}
          detail={
            // Only admins have an observation queue console; govt operators get
            // the in-page "Observaciones rábicas en curso" card instead of a
            // link that would bounce off the /admin auth guard.
            profile.role === "admin" ? (
              <Link href="/admin/observaciones" className="underline">
                Ver observaciones →
              </Link>
            ) : (
              <a href={`#${panelRabiesId}`} className="underline">
                Ver observaciones en curso ↓
              </a>
            )
          }
        />
      )}

      {/* Item 3 — compliance cards: legal compliance, ENO, diseases, AMR. */}
      <div className="grid lg:grid-cols-2 gap-4">
        <OpCard aria-labelledby={panelComplianceId}>
          <OpCardHead
            title={<span id={panelComplianceId}>Cumplimiento legal — observación rábica</span>}
          />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[var(--text-md)]">
              <dt className="text-ln-op-mute">Cumplimiento 10 días (A8)</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {pct(rabiesCompliance.compliancePct)}
              </dd>
              <dt className="text-ln-op-mute">Cerradas en el período</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {rabiesCompliance.closedWithinWindow}/{rabiesCompliance.closed}
              </dd>
              <dt className="text-ln-op-mute">Abiertas &gt; 10 días (A9)</dt>
              <dd
                className={`text-right font-semibold ${
                  rabiesCompliance.openBreaches > 0 ? "text-ln-op-danger" : "text-ln-op-ink"
                }`}
              >
                {rabiesCompliance.openBreaches}
              </dd>
            </dl>
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelEnoId}>
          <OpCardHead
            title={<span id={panelEnoId}>Notificación ENO (SLA de la bandeja de salida)</span>}
            actions={
              <Link
                href="/gob/outbox"
                className="text-sm text-ln-op-azul hover:underline no-underline"
              >
                Ver bandeja de salida →
              </Link>
            }
          />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[var(--text-md)]">
              <dt className="text-ln-op-mute">Entregadas en SLA (A7)</dt>
              <dd className="text-right font-semibold text-ln-op-ink">{pct(enoSla.onTimePct)}</dd>
              <dt className="text-ln-op-mute">Fuera de SLA (abiertas)</dt>
              <dd
                className={`text-right font-semibold ${
                  enoSla.breachedOpen > 0 ? "text-ln-op-warn" : "text-ln-op-ink"
                }`}
              >
                {enoSla.breachedOpen}
              </dd>
              <dt className="text-ln-op-mute">Mediana de latencia</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {enoSla.medianLatencyHours === null ? "—" : `${enoSla.medianLatencyHours} h`}
              </dd>
            </dl>
            <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
              Mide nuestra cola de notificación interna, no la entrega externa.
            </p>
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelEnfId}>
          <OpCardHead
            title={<span id={panelEnfId}>Enfermedades reportables (incidencia + lab)</span>}
          />
          <OpCardBody className="p-0">
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-ln-op-line-2">
              <span className="text-sm text-ln-op-mute">Confirmación de laboratorio (A10)</span>
              <span className="font-semibold text-ln-op-ink">
                {pct(reportableIncidence.labConfirmationPct)}
              </span>
            </div>
            {reportableCells.length === 0 ? (
              <div className="px-4 py-3">
                <LnEmptyState
                  icon="shield-check"
                  title="Sin enfermedades reportables en el período"
                  description="No se registraron eventos reportables en el rango seleccionado."
                />
              </div>
            ) : (
              <ul className="px-4 py-2 text-[var(--text-md)]">
                {reportableCells.map((c) => (
                  <li
                    key={c.key}
                    className="flex items-center justify-between border-b border-ln-op-line-2 py-1.5 last:border-0"
                  >
                    <span className="text-ln-op-ink">{findDisease(c.key)?.label ?? c.key}</span>
                    <span className="text-ln-op-mute">
                      {c.count} ({c.confirmed} lab)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {reportableIncidence.byDisease.suppressedCount > 0 && (
              <p className="px-4 pb-3 text-[var(--text-sm)] text-ln-op-mute">
                {reportableIncidence.byDisease.suppressedCount} celda(s) ocultas por privacidad
                (k-anonimato).
              </p>
            )}
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelAmrId}>
          <OpCardHead title={<span id={panelAmrId}>AMR — densidad de antimicrobianos</span>} />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[var(--text-md)]">
              <dt className="text-ln-op-mute">Densidad (A12)</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {amrDensity.per1000 === null ? "—" : `${amrDensity.per1000} / 1.000 pets`}
              </dd>
              <dt className="text-ln-op-mute">Inicios antimicrobianos</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {amrDensity.antimicrobialCount}
              </dd>
              <dt className="text-ln-op-mute">Pets activos (denominador)</dt>
              <dd className="text-right font-semibold text-ln-op-ink">{amrDensity.activePets}</dd>
            </dl>
            {amrDensity.provisionalUnclassified > 0 && (
              <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
                {amrDensity.provisionalUnclassified} evento(s) con fármaco sin clasificar — conteo
                provisional (clasificación provisional), no incluido en la tasa.
              </p>
            )}
          </OpCardBody>
        </OpCard>
      </div>

      {/* Movilidad jurisdiccional — mobility volume from movement_recorded.
          Epidemiological vector: a moved animal carries its exposure into a new
          jurisdiction. Scoped by the pet's home jurisdiction; sub-kinds decompose
          domestic relocations, CVI emissions and cross-border transport. */}
      <OpCard aria-labelledby={panelMovementId}>
        <OpCardHead title={<span id={panelMovementId}>Movilidad registrada (período)</span>} />
        <OpCardBody>
          {movement.total === 0 ? (
            <LnEmptyState
              icon="shield-check"
              title="Sin movimientos en el período"
              description="No se registraron movimientos de mascotas en el rango y la cobertura seleccionados."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-xl font-semibold text-ln-op-ink tabular-nums">
                    {movement.total.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[var(--text-sm)] text-ln-op-mute mt-0.5">
                    Movimientos totales
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-ln-op-ink tabular-nums">
                    {movement.jurisdictionChanged.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[var(--text-sm)] text-ln-op-mute mt-0.5">
                    Cambios de jurisdicción
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-ln-op-ink tabular-nums">
                    {movement.cviIssued.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[var(--text-sm)] text-ln-op-mute mt-0.5">CVI emitidos</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-ln-op-ink tabular-nums">
                    {movement.transportRecorded.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[var(--text-sm)] text-ln-op-mute mt-0.5">
                    Transportes registrados
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
                Eventos movement_recorded en el período, scoped a la jurisdicción de origen de la
                mascota. Un cambio de jurisdicción reasigna el hogar de la mascota al destino.
              </p>
            </>
          )}
        </OpCardBody>
      </OpCard>

      {/* Map + signals panels side-by-side on desktop */}
      <div className="grid lg:grid-cols-2 gap-4">
        <OpCard aria-labelledby={panelMapId}>
          <OpCardHead title={<span id={panelMapId}>{mapCardTitle}</span>} />
          <OpCardBody>
            <MapChoroplethDynamic
              data={choroplethData}
              {...(mapGeojsonUrl ? { geojsonUrl: mapGeojsonUrl } : {})}
              {...(mapVisibleCodes ? { visibleCodes: mapVisibleCodes } : {})}
              fallbackTableLabel={mapCardTitle}
              scaleLabel="Casos abiertos"
              cartography="panorama"
            />
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelSignalsId}>
          <OpCardHead
            title={<span id={panelSignalsId}>Señales recientes</span>}
            actions={
              <Link
                href="/gob/vigilancia/brotes"
                className="text-sm text-ln-op-azul hover:underline no-underline"
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
                  title="Sin señales activas en este período"
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
          title={
            <span id={panelTrendId}>
              Tendencia de enfermedades reportables (período seleccionado)
            </span>
          }
        />
        <OpCardBody>
          <TimeSeriesChartDynamic data={trendPoints} seriesLabel="Señales" />
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

      <DashboardFreshnessFooter ctx={complianceCtx} />
    </div>
  );
}
