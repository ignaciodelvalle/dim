import Link from "next/link";

import { Icon } from "@/components/Icon";
import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpFilterBar,
  OpKpi,
  ViewScopeCaption,
} from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { resolveAnalyticsPeriod } from "@/lib/analytics/analytics-period";
import { formatDelta } from "@/lib/analytics/campaign-metrics";
import { aggregateChoroplethData, scopedChoroplethProps } from "@/lib/analytics/choropleth-data";
import {
  computeDiseaseSummary,
  fetchCasesPerLocality,
  fetchCasesPerSubregion,
  fetchPrevVaccinationsWeek,
  fetchSurveillanceSignals,
  fetchVigilanciaMetrics,
  fetchZoonosisTrend,
} from "@/lib/analytics/govt-dashboards";
import { fetchBiteEscalationGap } from "@/lib/analytics/govt-home-kpis";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchSurveillanceCompliance } from "@/lib/analytics/surveillance-metrics";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  buildProjectionContext,
  enoSlaHeadline,
  enoSlaTone,
  fetchKpiTrend,
  fetchMovementCorridors,
  rabiesComplianceHeadline,
  rabiesComplianceTone,
  windows,
} from "@/lib/metrics";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { findDisease } from "@/lib/reference/diseases";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import { pluralizeEs } from "@/lib/utils/format";
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

  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    selectedProvince,
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

  // C3 disclosure: caption when this page's filters narrow below the mandate.
  const narrowedView = describeNarrowedView({
    role: profile.role,
    mandateJurisdictions: jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    adminProvince,
    adminLocality,
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
  const complianceCtx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <ScreenHeader
      className="space-y-2"
      eyebrow="Vigilancia epidemiológica"
      title="Mapa de vigilancia"
      subtitle={
        <>
          {/* The universal claim yields to the narrowed-view caption (never both). */}
          {profile.role === "admin" ? (
            narrowedView ? null : (
              <p className="text-[var(--text-md)] text-ln-op-mute">
                Vista universal — todas las jurisdicciones.
              </p>
            )
          ) : (
            <p className="text-[var(--text-md)] text-ln-op-mute">
              Señales de zoonosis y enfermedades reportables detectadas en tu cobertura.
            </p>
          )}
          <ViewScopeCaption scope={narrowedView} />
        </>
      }
    />
  );

  // D2: bound the fetcher set with a deadline so a pathological query degrades
  // to an honest "tardando… reintentar" state instead of hanging the page.
  const load = await loadWithTimeout(
    Promise.all([
      fetchVigilanciaMetrics(actor, filteredJurisdictions, { adminProvince, adminLocality }),
      fetchSurveillanceSignals(actor, filteredJurisdictions, {
        since: since30d,
        adminProvince,
        adminLocality,
      }),
      fetchCasesPerLocality(actor, filteredJurisdictions, { adminProvince, adminLocality }),
      fetchZoonosisTrend(actor, filteredJurisdictions, { since, adminProvince, adminLocality }),
      periodMatchesSummary
        ? null
        : fetchSurveillanceSignals(actor, filteredJurisdictions, {
            since,
            adminProvince,
            adminLocality,
          }),
      // When a province is selected, fetch department/barrio-level case counts.
      // For the national view (no province), this is null and the choropleth
      // stays at province level (no behavior change).
      selectedProvinceIso
        ? fetchCasesPerSubregion(actor, filteredJurisdictions, selectedProvinceIso, {
            adminProvince,
            adminLocality,
          })
        : Promise.resolve(null),
      fetchSurveillanceCompliance(complianceCtx),
      // C1 (2026-07-22, §3g / red-team #6 "escalation gap"): bites reported
      // vs rabies observations still open — composes the SAME two catalogued
      // fetchers other tiles already use (bites_per_10k, open_rabies_
      // observations), no new query/definition. Reuses complianceCtx: both
      // component fetchers anchor their own fixed windows internally.
      fetchBiteEscalationGap(complianceCtx),
      // Sparklines for KPI tiles (Fase 0).
      fetchKpiTrend("outbreak_signal", complianceCtx),
      fetchKpiTrend("rabies_observation_started", complianceCtx),
      fetchKpiTrend("vaccination_administered", complianceCtx),
      // Movilidad jurisdiccional / CVI — mobility is an epidemiological vector
      // (a moved animal carries its exposure into a new jurisdiction).
      fetchMovementCorridors(complianceCtx),
      // fetchPrevVaccinationsWeek adds ONE new query (same scope, 7d window
      // shifted one week back) purely to power the "Vacunaciones (7d)" deltaV2
      // chip — mirrors campaign-metrics.ts' fetchPrevTotals pattern.
      fetchPrevVaccinationsWeek(actor, filteredJurisdictions, { adminProvince, adminLocality }),
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
    escalationGap,
    outbreakSparkline,
    rabiesSparkline,
    vacSparkline,
    movement,
    prevVaccinationsWeek,
  ] = load.value;

  const vaccinationsDelta = formatDelta(
    metrics.vaccinationsThisWeek,
    prevVaccinationsWeek,
    "vs semana anterior",
  );

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
    (value) => `${value} ${pluralizeEs(value, "caso")} ${pluralizeEs(value, "abierto")}`,
  );

  // Scope-aware choropleth drill (design/scoped-choropleth-drill): auto-drills
  // from province to department/barrio grain the moment a province is
  // selected, aggregating this screen's own subregionData with a k-anon floor.
  // Also fixes a latent bug: this call used to omit `level` entirely (always
  // defaulting to "province"), so the department/barrio codes were run through
  // the WRONG normalizer — an accidental self-consistent (but semantically
  // wrong) join. scopedChoroplethProps always emits the correct explicit level.
  const mapProps = scopedChoroplethProps(
    provinceChoroplethData,
    selectedProvinceIso,
    subregionData,
  );
  const mapCardTitle =
    mapProps.level === "barrio"
      ? "Casos abiertos por barrio — CABA"
      : mapProps.level === "department"
        ? `Casos abiertos por departamento — ${selectedProvince?.name ?? ""}`
        : "Casos abiertos por jurisdicción";

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
  // Coherence fix (qa-triage-2026-07-23, finding #12) — see enoSlaHeadline's
  // own doc comment (lib/metrics/targets.ts) for the full rationale.
  const enoSlaCopy = enoSlaHeadline(enoSla, pct);
  // K2 — same breach-aware headline swap, ported to the rabies-10d tile via
  // rabiesComplianceHeadline (lib/metrics/targets.ts): compliancePct alone
  // can read "100%" while openBreaches > 0, so the live count leads instead.
  const rabiesComplianceCopy = rabiesComplianceHeadline(rabiesCompliance, pct);
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

      {/* No-scope warning — a verified DB fact (0 jurisdiction assignments),
          not a surveillance signal gap: measured-zero. */}
      {noScope && (
        <OpCallout
          title="Sin localidades asignadas"
          body="Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos una."
          icon={<Icon name="alerta" decorative />}
          nature="measured-zero"
        />
      )}

      {/* Unified filter bar — period + jurisdiction, same rail as censo/perdidas/maltrato. */}
      <OpFilterBar
        period={{ defaultPreset: "30d" }}
        jurisdiction={{ allowedProvinces, localities }}
      />

      {/* 6 KPI tiles */}
      <section
        aria-label="Indicadores de vigilancia"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
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
          descriptorId="outbreak_active_signals"
        />
        <OpKpi
          label="Rábicas activas"
          value={String(metrics.rabiesActiveCount)}
          tone={metrics.rabiesActiveCount > 0 ? "danger" : "neutral"}
          sparkline={rabiesSparkline.points.map((p) => p.y)}
          // Jumps to the compliance card (panelComplianceId), not the disease-
          // signals card (panelRabiesId) — that card is per-disease SIGNAL
          // counts, not rabies-observation detail. The compliance card is
          // where the real open-breach count for THIS metric actually lives.
          href={`#${panelComplianceId}`}
          info={{
            definition:
              "Cantidad de casos de observación rábica (caseKind='rabies_observation') con estado 'open' en la jurisdicción.",
            formula: "COUNT(cases WHERE caseKind='rabies_observation' AND status='open')",
          }}
          descriptorId="rabies_observation_cases_open"
        />
        <OpKpi
          label={KPI_CATALOG.pets_registered_today.label}
          value={String(metrics.petsRegisteredToday)}
          info={{
            definition:
              "Mascotas registradas en el sistema desde las 00:00 hora local de hoy (Arg/Buenos Aires), scoped a la jurisdicción del operador.",
            formula: "COUNT(pets WHERE created_at >= today midnight ART)",
          }}
          descriptorId="pets_registered_today"
        />
        <OpKpi
          label="Vacunaciones (7d)"
          value={String(metrics.vaccinationsThisWeek)}
          tone="ok"
          deltaV2={metrics.vaccinationsThisWeek > 0 ? (vaccinationsDelta ?? undefined) : undefined}
          sparkline={vacSparkline.points.map((p) => p.y)}
          info={{
            definition:
              "Eventos vaccination_administered registrados en los últimos 7 días en la jurisdicción del operador.",
            formula: "COUNT(vaccination_administered, últimos 7d) scoped to jurisdiction",
          }}
          descriptorId="vaccinations_weekly"
          guardInput={{ priorBase: prevVaccinationsWeek }}
        />
        {/* Clickable KPI tile (v1 `href` — wraps the whole tile in an <a>,
            same pattern as "Brotes activos" above): replaces the former
            standalone "Investigaciones" CTA button. Reads as one of the
            strip's tiles and drills into the same investigations route on
            click. This is a live stock (cases currently under active
            investigation, right now) — no period delta on a snapshot. */}
        <OpKpi
          label={KPI_CATALOG.outbreak_investigations_active.label}
          value={String(metrics.investigationActiveCount)}
          tone={metrics.investigationActiveCount > 0 ? "warn" : "neutral"}
          href="/gob/vigilancia/investigaciones"
          info={{
            definition:
              "Cantidad de casos con caseKind='outbreak_investigation' y estado 'open' o 'escalated' en la jurisdicción — investigaciones de brote actualmente en curso.",
            formula:
              "COUNT(cases WHERE caseKind='outbreak_investigation' AND status IN ('open','escalated'))",
          }}
          descriptorId="outbreak_investigations_active"
        />
        {/* C1 (2026-07-22, §3g / red-team #6): the escalation gap — a
            jurisdiction can show 0 open rabies observations while carrying
            hundreds of unescalated bite reports; an empty queue reads as
            "controlado" when it may mean "sin escalar". Pair, not a ratio —
            semaphore: none (no target either number is judged against).
            C4 (same date): sub-copy aligned to the one epistemic phrasing
            pattern ("la ausencia de X no implica ausencia de Y") shared with
            LnEmptyState/OpCallout's nature="no-signal" copy below — one
            phrasing, not two.
            PO decision 7 (2026-07-23, "Vigilancia: acción primaria en los
            KPIs de alerta"): this is a genuinely actionable alert tile, so
            its primary action goes to where the escalation ACTUALLY happens
            — the open bite-incident case queue (/gob/casos?kind=
            bite_incident, both-role-accessible) — not an in-page anchor to a
            card that only shows rabies-OBSERVATION compliance numbers, never
            the bite side of the gap. */}
        <OpKpi
          label={KPI_CATALOG.bite_escalation_gap.label}
          value={String(escalationGap.bites12m)}
          sub={`vs ${escalationGap.openObservations} observaciones rábicas abiertas — la ausencia de escalamiento no implica ausencia de riesgo`}
          href="/gob/casos?kind=bite_incident"
          descriptorId="bite_escalation_gap"
        />
      </section>

      {/* Item 3 — compliance KPI row (A8 / A7 / A12) */}
      <section
        aria-label="Indicadores de cumplimiento sanitario"
        className="grid grid-cols-2 md:grid-cols-3 gap-3"
      >
        <OpKpi
          label="Cumplimiento observación 10d"
          value={rabiesComplianceCopy.value}
          // Painted against the STATUTORY target, per the descriptor's own
          // semaphore.paintAgainst = "target". The previous hand-rolled tone
          // returned "ok" whenever no breach was live, so 7,1% compliance on a
          // legal deadline rendered green (found live 2026-07-25).
          tone={rabiesComplianceTone(rabiesCompliance) ?? "neutral"}
          bar={
            rabiesCompliance.openBreaches > 0
              ? undefined
              : (rabiesCompliance.compliancePct ?? undefined)
          }
          sub={rabiesComplianceCopy.sub}
          info={{
            // Internal indicator codes (A8/A9 — plan-maestro numbering) removed
            // from operator-facing copy (qa-triage-2026-07-23, finding #8):
            // jerga interna que un funcionario no puede interpretar. Kept only
            // in code comments below for cross-reference.
            definition:
              "Porcentaje de observaciones rábicas cerradas dentro del plazo legal de 10 días calendario. Exigido por Ord. CABA 41.831 art. 9 y Decreto 4669/1973 PBA.",
            formula:
              "rabies_observation_ended con (ended_at − started_at) ≤ 10 días / total cerradas en período",
            caveat:
              "Las observaciones con más de 10 días sin cierre generan un incumplimiento vivo y activan el banner de alerta.",
          }}
          descriptorId="rabies_observation_compliance_10d"
          guardInput={{ n: rabiesCompliance.closed }}
        />
        {/* Coherence fix (qa-triage-2026-07-23, finding #12): this tile used
            to headline the HISTORICAL onTimePct ("100%", period-scoped over
            delivered rows only) while the CURRENT breach count sat in the sub
            line — the exact "100% vs 12 en incumplimiento" contradiction next
            to each other. Same fix already shipped for the admin twin
            (components/admin/AdminKpiStrip.tsx, Cowork A3/C1), now shared via
            lib/metrics/targets.ts's enoSlaHeadline: when there is an active
            breach, LEAD with the live "N vencidas ahora" and demote the
            historical % to a clearly labeled "(referencia)" sub-line — one
            coherent state per tile, current-truth first. */}
        <OpKpi
          label="SLA notificación ENO"
          value={enoSlaCopy.value}
          tone={enoSlaTone(enoSla)}
          bar={enoSla.breachedOpen > 0 ? undefined : (enoSla.onTimePct ?? undefined)}
          sub={enoSlaCopy.sub}
          info={getKpiInfo("eno_sla_compliance")}
          descriptorId="eno_sla_compliance"
        />
        <OpKpi
          label="Densidad ATM/AMR"
          value={amrDensity.per1000 === null ? "—" : String(amrDensity.per1000)}
          sub={
            // PO interview 2026-07-23, item 13: a bare "0" reading as
            // "antimicrobianos por 1.000 pets activos" implies a measured,
            // confirmed rate of zero — the honest read when NOTHING was
            // logged is no-signal, not an achieved zero (see the AMR card
            // below for the fuller no-signal treatment of the same case).
            amrDensity.activePets > 0 && amrDensity.antimicrobialCount === 0
              ? "sin datos de uso registrados"
              : amrDensity.provisionalUnclassified > 0
                ? `por 1.000 · ${amrDensity.provisionalUnclassified} sin clasificar (provisional)`
                : "antimicrobianos por 1.000 pets activos"
          }
          info={{
            // Internal indicator code (A12) removed from operator-facing copy
            // (qa-triage-2026-07-23, finding #8) — kept only in code comments.
            definition:
              "Densidad de uso de antimicrobianos: inicios de tratamiento antimicrobiano por cada 1.000 mascotas activas en la jurisdicción. Indicador de presión selectiva de resistencia antimicrobiana (AMR).",
            formula:
              "COUNT(medication_started donde drug_code ∈ catálogo antimicrobial) / activePets × 1.000",
            caveat:
              "Fármacos cuyo drug_code no está en el catálogo se reportan como 'sin clasificar' y NO se incluyen en la tasa (clasificación provisional).",
          }}
          descriptorId="amr_density"
        />
      </section>

      {/* A9 — live breach banner: rabies observations open past the legal 10-day window. */}
      {rabiesCompliance.openBreaches > 0 && (
        <OpBreach
          icon={<Icon name="alerta" decorative />}
          title={`${rabiesCompliance.openBreaches} ${pluralizeEs(rabiesCompliance.openBreaches, "observación rábica", "observaciones rábicas")} fuera del plazo legal de 10 días`}
          detail={
            // Only admins have an observation queue console; govt operators get
            // an in-page jump to the compliance card instead of a link that
            // would bounce off the /admin auth guard. That card (not the
            // disease-signals card) is where the real openBreaches count for
            // this banner lives.
            profile.role === "admin" ? (
              <Link href="/admin/observaciones" className="underline">
                Ver observaciones →
              </Link>
            ) : (
              <a href={`#${panelComplianceId}`} className="underline">
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
              {/* (A8) internal code dropped from copy — qa-triage-2026-07-23 #8 */}
              <dt className="text-ln-op-mute">Cumplimiento 10 días</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {pct(rabiesCompliance.compliancePct)}
              </dd>
              <dt className="text-ln-op-mute">Cerradas en el período</dt>
              <dd className="text-right font-semibold text-ln-op-ink">
                {rabiesCompliance.closedWithinWindow}/{rabiesCompliance.closed}
              </dd>
              {/* (A9) internal code dropped from copy — qa-triage-2026-07-23 #8 */}
              <dt className="text-ln-op-mute">Abiertas &gt; 10 días</dt>
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
              {/* (A7) internal code dropped from copy — qa-triage-2026-07-23 #8 */}
              <dt className="text-ln-op-mute">Entregadas en SLA</dt>
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
            {/* C2 language contract (2026-07-22): states reality instead of
                implying external delivery — the pipeline genuinely generates,
                queues, SLA-tracks and audit-logs every ENO notification;
                external transmission to the health authority awaits a
                receiving endpoint. Never "próximamente" (this pipeline is
                real and running today). */}
            <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
              Registrada y auditada — transmisión a la autoridad pendiente de endpoint receptor.
            </p>
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelEnfId}>
          <OpCardHead
            title={<span id={panelEnfId}>Enfermedades reportables (incidencia + lab)</span>}
          />
          <OpCardBody className="p-0">
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-ln-op-line-2">
              {/* (A10) internal code dropped from copy — qa-triage-2026-07-23 #8 */}
              <span className="text-sm text-ln-op-mute">Confirmación de laboratorio</span>
              <span className="font-semibold text-ln-op-ink">
                {pct(reportableIncidence.labConfirmationPct)}
              </span>
            </div>
            {reportableCells.length === 0 ? (
              <div className="px-4 py-3">
                {/* C4 (2026-07-22, §S4): a reportable-disease event only
                    exists in miMAR if a professional registered one — the
                    empty table can't tell "no reportable disease occurred"
                    apart from "nobody diagnosed/notified one". no-signal. */}
                <LnEmptyState
                  icon="eye-off"
                  nature="no-signal"
                  title="Sin notificaciones registradas en miMAR"
                  description="La ausencia de notificaciones no implica ausencia de enfermedades reportables — depende de que un profesional la registre."
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
            {/* PO interview 2026-07-23, item 13: "0 / 1.000" reads as a
                measured, confirmed zero (a good outcome) when the honest
                reading is "nobody logged a medication_started event of this
                kind in miMAR" — same no-signal epistemics as the Movilidad
                panel below (movement.total === 0). Only fires when there IS a
                denominator (activePets > 0); a zero denominator already
                renders "—" via per1000 === null, a different (correct) case. */}
            {amrDensity.activePets > 0 && amrDensity.antimicrobialCount === 0 ? (
              <LnEmptyState
                icon="eye-off"
                nature="no-signal"
                title="Sin datos de uso registrados"
                description="Ningún inicio de tratamiento antimicrobiano fue registrado en miMAR para este período — la ausencia de registro no implica ausencia de uso real."
              />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[var(--text-md)]">
                  {/* (A12) internal code dropped from copy — qa-triage-2026-07-23 #8 */}
                  <dt className="text-ln-op-mute">Densidad</dt>
                  <dd className="text-right font-semibold text-ln-op-ink">
                    {amrDensity.per1000 === null ? "—" : `${amrDensity.per1000} / 1.000 pets`}
                  </dd>
                  <dt className="text-ln-op-mute">Inicios antimicrobianos</dt>
                  <dd className="text-right font-semibold text-ln-op-ink">
                    {amrDensity.antimicrobialCount}
                  </dd>
                  <dt className="text-ln-op-mute">Pets activos (denominador)</dt>
                  <dd className="text-right font-semibold text-ln-op-ink">
                    {amrDensity.activePets}
                  </dd>
                </dl>
                {amrDensity.provisionalUnclassified > 0 && (
                  <p className="mt-3 text-[var(--text-sm)] text-ln-op-mute">
                    {amrDensity.provisionalUnclassified} evento(s) con fármaco sin clasificar —
                    conteo provisional (clasificación provisional), no incluido en la tasa.
                  </p>
                )}
              </>
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
            // C4 (2026-07-22, §S4): mobility is itself an epidemiological
            // vector (comment above — a moved animal carries its exposure
            // into a new jurisdiction) and every row here depends on someone
            // logging the transfer/CVI in miMAR — an unlogged movement reads
            // identically to zero. no-signal, not "all quiet".
            <LnEmptyState
              icon="eye-off"
              nature="no-signal"
              title="Sin movimientos registrados en miMAR"
              description="La ausencia de registro no implica ausencia de movimiento — depende de que se registre el traslado en la plataforma."
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
              // Camera lockdown (gob/map-zoom-lockdown, 2026-07-21): `level`/
              // `geojsonUrl`/`visibleCodes` only seed MapChoropleth's initial
              // state — a prop change alone does not re-init the map or
              // refit the (now non-pannable) camera. Keying on the resolved
              // scope forces a clean remount whenever the jurisdiction
              // filter changes, so the locked-down viewport always fitBounds
              // to the newly selected area instead of silently keeping the
              // old one. `selectedProvinceIso` is exactly what
              // scopedChoroplethProps (mapProps) was built from above.
              key={selectedProvinceIso ?? "national"}
              {...mapProps}
              fallbackTableLabel={mapCardTitle}
              scaleLabel="Casos abiertos"
              caption="Conteos absolutos por jurisdicción — no es una tasa poblacional."
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
                {/* C4 (2026-07-22, §S4 / red-team #10 "zeros=green"): a
                    disease signal only exists here if someone reported one —
                    "sin señales" reads as "todo tranquilo" when the honest
                    read is "miMAR no recibió señales". no-signal. */}
                <LnEmptyState
                  icon="eye-off"
                  nature="no-signal"
                  title="Sin señales registradas en miMAR"
                  description="La ausencia de señales no implica ausencia de enfermedad — nadie reportó un caso en este período."
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

      {/* Disease summary table — per-disease SIGNAL counts (outbreak_signal
          events), always over the trailing 30 days regardless of the period
          picker (see periodMatchesSummary above). This is NOT a count of open
          rabies observations (that's rabiesActiveCount / rabiesCompliance,
          rendered in the KPI tile and compliance card above) — the title
          must say what this table actually shows. */}
      <OpCard aria-labelledby={panelRabiesId}>
        <OpCardHead
          title={<span id={panelRabiesId}>Señales por enfermedad (últimos 30 días)</span>}
        />
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
