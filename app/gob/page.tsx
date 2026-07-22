// /gob home — C6b "THE BRIEFING" (docs/reviews/results/2026-07-22-plan-maestro-
// integridad.md §C6 "Capa 1"). PO-locked structure, four blocks in strict
// order — hierarchy by ORDER + COLLAPSE + CONDITIONALITY, never tile-size:
//   1. Alertas priorizadas (hero, max 5) — lib/metrics/briefing-alerts.ts
//      composes these PURELY from metrics this page already fetches.
//   2. Brechas vs meta — the former KPI wall, demoted to "evidence" under the
//      alerts (same OpKpi tiles, same descriptorIds — no new visual language).
//   3. Cola operativa condensada — one compact row of counts+CTAs, absorbing
//      the old header's 3 action buttons + the old Cola/Denuncias/Casos/
//      Pérdidas cards (deduplicated: Denuncias existed as BOTH a header
//      button and its own "Denuncias ciudadanas" card before this pass).
//   4. Mi trabajo asignado — renders ONLY when non-empty.
//   5. Novedades — demoted into a collapsed <details> ("Actividad reciente"),
//      alongside the operator's own recent-action audit log (same content
//      that used to sit as a standalone "Actividad reciente" card).
//
// Preserved from the pre-C6b /gob/page.tsx:
//   - fetchVisiblePendingRequests → cola count
//   - auditLog query → the collapsed "Actividad reciente" list
//   - requireAdminOrGovtOrRedirect → capability guard
//   - ViewScopeCaption / mandate chrome (C3) — untouched

import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { NovedadesCard } from "@/components/operator/NovedadesCard";
import { OpCard, OpCardBody, OpCardHead, OpKpi, ViewScopeCaption } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { auditLog, db } from "@/db";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import {
  fetchDangerousBreedCompliance,
  fetchMicrochipPenetration,
} from "@/lib/analytics/compliance-metrics";
import { fetchMyAssignedWelfareCount, fetchPerdidasMetrics } from "@/lib/analytics/govt-dashboards";
import {
  fetchBitesPer10k,
  fetchNotifiedDiseases,
  fetchOpenBiteCases,
  fetchOpenRabiesObservations,
  fetchOpenWelfareReportsCount,
  fetchRabiesCoverage,
  fetchSterilizationMetrics,
} from "@/lib/analytics/govt-home-kpis";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchMortalityHeadline } from "@/lib/analytics/mortality-metrics";
import { countVisiblePendingRequests } from "@/lib/infra/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  listOpenCasesForAdminPreview,
  listOpenCasesForGovtPreview,
} from "@/lib/infra/case-queries";
import {
  TARGETS,
  buildProjectionContext,
  computeDeltaPct,
  fetchBitesTrend,
  fetchKpiTrend,
  resolveSemaphoreTone,
  toneForTarget,
  zeroDenominatorGate,
} from "@/lib/metrics";
import { type BriefingAlertCandidate, buildBriefingAlerts } from "@/lib/metrics/briefing-alerts";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { fetchNovedadesGroupedFeed } from "@/lib/metrics/novedades-feed";
import { windows } from "@/lib/metrics/period";
import { type ActivityFeedRow, collapseActivityFeed } from "@/lib/ui/activity-feed";
import { auditActionLabel } from "@/lib/ui/audit-action-labels";
import { describeMandate } from "@/lib/ui/scope-chrome";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import {
  AR_TIME_ZONE,
  formatCount,
  formatPercent,
  formatRate,
  relativeDayLabel,
} from "@/lib/utils/format";

export default async function GobiernoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const sp = await searchParams;

  // --- Jurisdiction filter resolution -------------------------------------
  // Uses the SAME URL contract as every /gob sub-page (JurisdictionSwitcher):
  // province = ISO 3166-2 code, locality = slug. This is what closed the
  // scope-reset-on-drill-down bug — the home previously wrote province=slug,
  // which every sub-page (reading province=ISO) silently dropped.
  const selectedProvinceIso = typeof sp.province === "string" ? sp.province : null;
  const selectedLocalitySlug = typeof sp.locality === "string" ? sp.locality : null;

  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: selectedProvinceIso, locality: selectedLocalitySlug },
  });
  // Both undefined unless role === "admin" (resolveJurisdictionScope's guarantee) —
  // hoisted once so every fetcher below shares the identical admin-scope value
  // (same pattern as /gob/perdidas).
  const adminProvince = adminSelectedProvince ?? undefined;
  const adminLocality = adminSelectedLocality ?? undefined;

  // --- Scope label --------------------------------------------------------

  // es-AR label for the operator's role — the raw enum ("govt"/"admin") must
  // never render in the header chrome.
  const roleLabel = profile.role === "admin" ? "Administrador/a" : "Gobierno";

  // C3 (ONE VIEWSCOPE): this header describes the operator's MANDATE (raw
  // session assignments), matching the shared /gob layout badge — never the
  // page's filtered view. When the URL's province/locality filter narrows
  // BELOW that mandate, `narrowedView` (rendered as a ViewScopeCaption right
  // below) discloses the actual scope in view, fed from the SAME resolved
  // values (filteredJurisdictions/adminProvince/adminLocality) the KPI ctx
  // below already computed — never re-derived.
  const scopeLabel = profile.role === "admin" ? "Nacional" : describeMandate(jurisdictions);
  const narrowedView = describeNarrowedView({
    role: profile.role,
    mandateJurisdictions: jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    adminProvince,
    adminLocality,
  });

  // --- All live queries in one bounded Promise.all (19-way, D2) ----------
  // pending, recentDecisions, the KPI queries, the casos-regulatorios preview
  // and the C6b "mi trabajo" count are all independent — merged into one
  // fetcher set bounded by loadWithTimeout so a degraded pooler renders an
  // honest fallback instead of hanging the whole page (task #74 death-spiral
  // class).

  const actor = { role: profile.role } as const;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Build one ProjectionContext for all KPI tiles. Uses trailing-12m as the
  // default window (the home dashboard has no period picker). Trailing-30d is
  // passed to fetchSterilizationMetrics separately via ctx.period.since.
  const ctx12m = buildProjectionContext(actor, filteredJurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
  });
  const ctx30d = buildProjectionContext(actor, filteredJurisdictions, windows.trailing30d(), {
    adminProvince,
    adminLocality,
  });

  // Page header — rendered in both the data and degraded (D2) branches.
  // C6b: the header keeps AT MOST ONE primary action (the PO-locked "no
  // duplication" rule) — "Habilitación" and "Denuncias de maltrato" fold into
  // the condensed queue row (block 3) below instead of living here too.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        miMAR Gobierno · {roleLabel} · {scopeLabel}
      </p>
      <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
        Panel de jurisdicción
      </h1>
      <ViewScopeCaption scope={narrowedView} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href="/gob/cola"
          className="rounded-[var(--radius-md)] bg-ln-op-azul px-3 py-1.5 text-[var(--text-md)] font-medium text-white hover:bg-ln-op-azul-700 transition-colors no-underline"
        >
          Cola de aprobaciones
        </Link>
      </div>
    </header>
  );

  // D2: bound the fetcher set with a deadline so a pathological query degrades
  // to an honest "tardando… reintentar" state instead of hanging the page.
  const load = await loadWithTimeout(
    Promise.all([
      // Headline count only — a real scoped COUNT(*), so a queue larger than any
      // list cap still shows its true size (the card renders the number, not rows).
      countVisiblePendingRequests(profile, jurisdictions),
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          performedAt: auditLog.performedAt,
        })
        .from(auditLog)
        .where(and(eq(auditLog.actorUserId, user.id), gte(auditLog.performedAt, sevenDaysAgo)))
        .orderBy(desc(auditLog.performedAt))
        .limit(10),
      fetchRabiesCoverage(ctx12m),
      fetchSterilizationMetrics(ctx30d),
      fetchBitesPer10k(ctx12m),
      // "Zoonosis activas" composite decomposed (PO-ratified) into 3 legible signals.
      fetchOpenRabiesObservations(ctx12m),
      fetchOpenBiteCases(ctx12m),
      fetchNotifiedDiseases(ctx12m),
      fetchOpenWelfareReportsCount(ctx12m),
      // Item 4 compliance headline KPIs (C1 microchip penetration, C7 PPP registry).
      // Penetration/compliance are population-state metrics ("now"); the 12m window
      // is carried for ctx consistency but not used as a numerator filter.
      fetchMicrochipPenetration(ctx12m),
      fetchDangerousBreedCompliance(ctx12m),
      // D1 — mordeduras por período (trend), so the operator sees direction, not
      // just the "Mordeduras / 10k hab." snapshot KPI above. Reuses the 12m ctx.
      fetchBitesTrend(ctx12m),
      // Sparklines for KPI tiles (Fase 0).
      fetchKpiTrend("sterilization_performed", ctx30d),
      fetchKpiTrend("rabies_observation_started", ctx12m),
      fetchKpiTrend("vaccination_administered", ctx12m),
      // §5 narrative: mortality & disposition — the third citizen-traceable
      // projection (death_recorded events + how traceable their disposition is).
      // Home shows only total + traceableRate → the headline-only fetcher (qw#2).
      fetchMortalityHeadline(ctx12m),
      // Pérdidas activas — SAME fetcher + scope as /gob/perdidas and the Panorama
      // "Pérdidas activas" tile, so the Panel widget can never read 0 while the
      // detail list shows N active (val-2-govt M2). filteredJurisdictions applies
      // the same province/locality narrowing the KPI strip uses.
      fetchPerdidasMetrics(actor, filteredJurisdictions, {
        countOnly: true,
        adminProvince,
        adminLocality,
      }),
      // Casos regulatorios (open/escalated) — status filter + LIMIT 5 pushed
      // into SQL; C6b's condensed queue row only renders the total count, not
      // the row preview, so this could shrink to a COUNT-only fetch in a
      // future pass — kept as-is here (zero NEW query, same call as before).
      profile.role === "admin"
        ? listOpenCasesForAdminPreview(5)
        : listOpenCasesForGovtPreview(filteredJurisdictions, 5),
      // Novedades — session-start orientation feed. Reuses ctx12m for SCOPE only
      // (admin → universal; govt → its jurisdictions, narrowed by the active
      // switcher filter); the feed window is the per-user watermark, not the
      // ctx period. Bounded by the same loadWithTimeout deadline as the rest.
      fetchNovedadesGroupedFeed(ctx12m, user.id),
      // C6b block 3 ("Mi trabajo asignado") — the ONE cheap count query this
      // task allows: welfare reports assigned to the viewer, still actionable.
      // NOT fetchWelfareMetrics (that bundles 3 unused counts in one call).
      fetchMyAssignedWelfareCount(actor, filteredJurisdictions, user.id),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob", {
            province: selectedProvinceIso ?? undefined,
            locality: selectedLocalitySlug ?? undefined,
          })}
        />
      </div>
    );
  }

  const [
    pendingCount,
    recentDecisions,
    rabiesCoverage,
    sterilizations,
    bitesPer10k,
    openRabiesObservations,
    openBiteCases,
    notifiedDiseases,
    openWelfareReports,
    microchipPenetration,
    breedCompliance,
    bitesTrend,
    sterilizationTrend,
    zoonosisTrend,
    rabiesVaxTrend,
    mortality,
    perdidas,
    openCasesPreview,
    novedades,
    myAssignedWelfareCount,
  ] = load.value;

  // G3: collapse the recent-activity feed's repeated PII-search rows into a
  // single per-day counted row so real decisions aren't buried. Display-only —
  // the audit_log is unchanged (append-only). `relativeDayLabel` renders the
  // group's AR day as "hoy" / "ayer" / a compact "d/M".
  const activityRows = collapseActivityFeed(recentDecisions);
  const activityRowLabel = (row: ActivityFeedRow): string =>
    row.count > 1 && row.day
      ? `${row.count} búsquedas de información personal · ${relativeDayLabel(row.day)}`
      : auditActionLabel(row.action);

  // Shape the bites trend for TimeSeriesChart (x/y points).
  const bitesTrendPoints = bitesTrend.points.map((p) => ({ x: p.x, y: p.y }));
  const bitesBucketWord = bitesTrend.granularity === "month" ? "mes" : "semana";

  const openCasesTotal = openCasesPreview.total;

  // C1 (2026-07-22, plan-maestro §3a): 0 deaths → mortality.traceableRate is a
  // 0/0 ratio that reads "0%" as if disposition tracing had FAILED, when it
  // simply never had a death to trace (the latent 0/0 the /gob/mortalidad
  // page already gates on `hasDeaths`). Mirrors that same gate here via the
  // descriptor's guard, not a re-invented inline check.
  const mortalityHasDeaths = !zeroDenominatorGate(
    KPI_CATALOG.mortality_deaths_12m,
    mortality.total,
  );

  // -------------------------------------------------------------------------
  // C6b block 1 — Alertas priorizadas. Pure composition from metric values
  // this page ALREADY fetches (zero new query fan-out) — see
  // lib/metrics/briefing-alerts.ts for the guard/ranking contract. Candidates
  // that fail a guard (no target, small-N, zero-denominator, target already
  // met) are silently dropped by buildBriefingAlerts, never rendered.
  //
  // DROPPED FOR NEEDING A NEW QUERY (documented, not wired): reunification_rate
  // (this page only fetches perdidas' activeCount, not the reunification
  // ratio — that lives on /gob/perdidas), campaign_completion_rate,
  // rabies_observation_compliance_10d, eno_sla_compliance — none of their
  // fetchers are part of this page's bounded Promise.all today.
  // -------------------------------------------------------------------------
  const alertCandidates: BriefingAlertCandidate[] = [
    ...(rabiesCoverage.hasData
      ? [
          {
            kpiId: "rabies_coverage_dogs_12m" as const,
            value: rabiesCoverage.current,
            n: rabiesCoverage.registryDenominator,
            auxPresent: rabiesCoverage.censusCoveragePct !== null,
          },
        ]
      : []),
    {
      kpiId: "microchip_penetration" as const,
      value: microchipPenetration.ratePct,
      n: microchipPenetration.active,
    },
    {
      kpiId: "mortality_disposal_traceability" as const,
      value: mortality.traceableRate,
      n: mortality.total,
    },
  ];
  const alerts = buildBriefingAlerts(alertCandidates);

  // C6b block 3 — Cola operativa condensada. Absorbs the old header's
  // "Habilitación"/"Denuncias de maltrato" buttons + the old Casos
  // regulatorios/Denuncias ciudadanas/Pérdidas cards into ONE row of
  // count+CTA chips. Denuncias previously existed as BOTH a header button
  // AND a "Denuncias ciudadanas" card reading the SAME count — this row is
  // its single occurrence now. Cola de aprobaciones keeps its header button
  // (the page's one primary action) AND appears here with its live count —
  // that pairing (button = quick top-of-page shortcut, row = queue depth) is
  // the same one the page already used before this pass, not a new duplicate.
  const queueItems: Array<{ href: string; label: string; count?: number }> = [
    { href: "/gob/cola", label: "Cola de aprobaciones", count: pendingCount },
    {
      // F3+F7 fusion (2026-07-22): Organizaciones is now the Directorio hub's
      // "organizaciones" tab (the default) — link straight there instead of
      // through the old /gob/organizaciones redirect.
      href: "/gob/directorio?registro=organizaciones",
      label: "Habilitación de organizaciones",
    },
    {
      // F1 fusion (2026-07-22): Maltrato is now the Denuncias hub's "Triage"
      // stage — link straight there instead of through the old redirect.
      href: "/gob/denuncias?etapa=triage",
      label: openWelfareReports.count === 1 ? "Denuncia de maltrato" : "Denuncias de maltrato",
      count: openWelfareReports.count,
    },
    { href: "/gob/casos", label: "Casos regulatorios", count: openCasesTotal },
    {
      href: "/gob/perdidas",
      label: perdidas.activeCount === 1 ? "Mascota perdida activa" : "Mascotas perdidas activas",
      count: perdidas.activeCount,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header — mandate chrome (C3) + the one primary action */}
      {header}

      {/* Jurisdiction filter — same URL contract (province=ISO, locality=slug)
          as every /gob sub-page, so scope carries across drill-downs. */}
      <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />

      {/* ===================================================================
          BLOCK 1 — Alertas priorizadas (the hero, max 5)
          =================================================================== */}
      <section aria-label="Alertas priorizadas" className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Alertas priorizadas
        </h2>
        {alerts.length === 0 ? (
          <OpCard>
            <OpCardBody>
              <p className="text-[var(--text-md)] text-ln-op-mute">
                Sin alertas activas — las métricas con meta están dentro de rango.
              </p>
            </OpCardBody>
          </OpCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alerts.map((alert) => (
              <OpCard key={alert.id} accent={alert.severity === "alta" ? "danger" : "warn"}>
                <OpCardBody className="space-y-1.5">
                  <p className="text-[var(--text-md)] font-medium text-ln-op-ink">
                    <span className="sr-only">
                      {alert.severity === "alta" ? "Prioridad alta" : "Prioridad media"}:
                    </span>
                    {alert.title}
                  </p>
                  <p className="text-xs text-ln-op-mute">
                    Confianza: {alert.confidence} · n = {alert.evidence.n}
                  </p>
                  <Link
                    href={alert.actionHref}
                    className="text-sm text-ln-op-azul hover:underline no-underline"
                  >
                    {alert.actionLabel} →
                  </Link>
                </OpCardBody>
              </OpCard>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================================
          Brechas vs meta — the former KPI wall, demoted to EVIDENCE under
          the alerts (the alerts are the interpretation; this strip is the
          evidence). Same OpKpi tiles, same descriptorIds — no new visual
          language. Ops-only tiles (queue depths) do NOT live here — they
          fold into block 3 below.
          =================================================================== */}
      <section aria-label="Brechas vs meta" className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Brechas vs meta
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OpKpi
            label="Cobertura antirrábica (perros, 12m)"
            value={rabiesCoverage.hasData ? formatPercent(rabiesCoverage.current) : "—"}
            tone={
              !rabiesCoverage.hasData
                ? "neutral"
                : toneForTarget(rabiesCoverage.current, TARGETS.RABIES_COVERAGE_PCT)
            }
            bar={rabiesCoverage.hasData ? rabiesCoverage.current : undefined}
            sub={
              rabiesCoverage.hasData ? (
                <span className="block space-y-0.5">
                  {rabiesCoverage.censusCoveragePct !== null ? (
                    <span className="block font-semibold text-ln-op-ink">
                      {formatPercent(rabiesCoverage.censusCoveragePct)} del padrón sobre la
                      población canina estimada
                    </span>
                  ) : (
                    <span className="block">Sin estimación censal</span>
                  )}
                  <span className="block text-ln-op-mute">
                    {formatCount(rabiesCoverage.registryDenominator)}{" "}
                    {rabiesCoverage.registryDenominator === 1 ? "perro" : "perros"} en el padrón ·
                    meta {TARGETS.RABIES_COVERAGE_PCT}%
                  </span>
                </span>
              ) : (
                "Sin datos en el período"
              )
            }
            sparkline={rabiesVaxTrend.points.map((p) => p.y)}
            href="/gob/analytics"
            info={getKpiInfo("rabies_coverage_dogs_12m")}
            descriptorId="rabies_coverage_dogs_12m"
          />
          <OpKpi
            label={KPI_CATALOG.sterilizations_per_month.label}
            value={sterilizations.count.toLocaleString("es-AR")}
            deltaV2={
              sterilizations.deltaPct !== 0
                ? { value: sterilizations.deltaPct, period: "vs mes ant." }
                : undefined
            }
            sparkline={sterilizationTrend.points.map((p) => p.y)}
            sub={`${sterilizations.orgs} organizaciones`}
            href="/gob/analytics"
            descriptorId="sterilizations_per_month"
            guardInput={{ priorBase: sterilizations.prevCount }}
          />
          <OpKpi
            label={
              bitesPer10k.percapitaEligible ? "Mordeduras / 10k hab." : "Mordeduras (12 meses)"
            }
            value={
              !bitesPer10k.percapitaEligible
                ? String(bitesPer10k.reports)
                : bitesPer10k.reports > 0 && formatRate(bitesPer10k.rate) === formatRate(0)
                  ? "<0,1"
                  : formatRate(bitesPer10k.rate)
            }
            tone={bitesPer10k.reports > 0 ? "warn" : "neutral"}
            deltaV2={
              bitesPer10k.percapitaEligible && bitesPer10k.delta !== 0
                ? {
                    value: computeDeltaPct(bitesPer10k.rate, bitesPer10k.rate - bitesPer10k.delta),
                    period: "vs año ant.",
                  }
                : undefined
            }
            sparkline={bitesTrend.points.map((p) => p.y)}
            sub={
              bitesPer10k.percapitaEligible
                ? `${bitesPer10k.reports} reportes`
                : "sin padrón censal local"
            }
            href="/gob/vigilancia"
            info={getKpiInfo("bites_per_10k")}
            descriptorId="bites_per_10k"
          />
          <OpKpi
            label={KPI_CATALOG.open_rabies_observations.label}
            value={openRabiesObservations.count}
            tone={openRabiesObservations.count > 0 ? "danger" : "neutral"}
            deltaV2={
              openRabiesObservations.deltaWeek !== 0
                ? {
                    value: openRabiesObservations.deltaWeek,
                    period: "vs semana ant.",
                    unit: "count",
                  }
                : undefined
            }
            sparkline={zoonosisTrend.points.map((p) => p.y)}
            sub="observaciones en curso"
            href="/gob/vigilancia"
            info={getKpiInfo("open_rabies_observations")}
            descriptorId="open_rabies_observations"
          />
          <OpKpi
            label={KPI_CATALOG.open_bite_cases.label}
            value={openBiteCases.count}
            tone={openBiteCases.count > 0 ? "warn" : "neutral"}
            sub={openBiteCases.count === 1 ? "caso abierto" : "casos abiertos"}
            href="/gob/vigilancia"
            info={getKpiInfo("open_bite_cases")}
            descriptorId="open_bite_cases"
          />
          <OpKpi
            label={KPI_CATALOG.notified_diseases.label}
            value={notifiedDiseases.count}
            tone={notifiedDiseases.count > 0 ? "danger" : "neutral"}
            sub={`${notifiedDiseases.lepto} lepto · ${notifiedDiseases.hidat} hidat. · últimos 30 días`}
            href="/gob/vigilancia"
            info={getKpiInfo("notified_diseases")}
            descriptorId="notified_diseases"
          />
          <OpKpi
            label={KPI_CATALOG.microchip_penetration.label}
            value={formatPercent(microchipPenetration.ratePct)}
            tone={toneForTarget(microchipPenetration.ratePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
            bar={microchipPenetration.ratePct}
            sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}% · ${microchipPenetration.chipped.toLocaleString("es-AR")} de ${microchipPenetration.active.toLocaleString("es-AR")} activas/perdidas · Ley 14.107`}
            href="/gob/analytics"
            descriptorId="microchip_penetration"
          />
          <OpKpi
            label={KPI_CATALOG.ppp_registry_compliance.label}
            value={
              breedCompliance.flaggedCount === 0 ? "—" : formatPercent(breedCompliance.ratePct)
            }
            tone={
              breedCompliance.flaggedCount === 0
                ? "neutral"
                : resolveSemaphoreTone(
                    KPI_CATALOG.ppp_registry_compliance,
                    toneForTarget(breedCompliance.ratePct, TARGETS.PPP_ATTESTATION_PCT),
                  )
            }
            bar={breedCompliance.flaggedCount === 0 ? undefined : breedCompliance.ratePct}
            sub={
              breedCompliance.flaggedCount === 0
                ? "sin PPP en cobertura · Ley 4078"
                : `${breedCompliance.attested} de ${breedCompliance.flaggedCount} atestadas en miMAR · no mide cumplimiento registral externo · Ley 4078`
            }
            href="/gob/analytics"
            descriptorId="ppp_registry_compliance"
          />
        </div>

        {/* Mortalidad y disposición (§5 narrative) — the third citizen-
            traceable projection: death events + how traceable their
            disposition is. Full view at /gob/mortalidad. */}
        <OpCard aria-labelledby="panel-mortalidad-titulo">
          <OpCardHead
            title={
              <span id="panel-mortalidad-titulo">
                Mortalidad y disposición{" "}
                <span className="text-xs font-normal text-ln-op-mute">últimos 12 meses</span>
              </span>
            }
            actions={
              <Link
                href="/gob/mortalidad"
                className="text-sm text-ln-op-azul hover:underline no-underline"
              >
                Ver detalle →
              </Link>
            }
          />
          <OpCardBody>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ln-op-ink">
                  {mortalityHasDeaths ? mortality.total : "—"}
                </p>
                <p className="text-xs text-ln-op-mute">Fallecimientos registrados</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ln-op-ink">
                  {mortalityHasDeaths ? formatPercent(mortality.traceableRate) : "—"}
                </p>
                <p className="text-xs text-ln-op-mute">Disposición trazable</p>
              </div>
            </div>
          </OpCardBody>
        </OpCard>

        {/* D1 — mordeduras por período (tendencia) */}
        <OpCard aria-labelledby="panel-bites-trend-titulo">
          <OpCardHead
            title={
              <span id="panel-bites-trend-titulo">
                Mordeduras por {bitesBucketWord}{" "}
                <span className="text-[var(--text-sm)] font-normal text-ln-op-mute">
                  últimos 12 meses
                </span>
              </span>
            }
            actions={
              bitesTrend.suppressedCount > 0 ? (
                <span className="text-sm font-normal text-ln-op-mute">
                  {bitesTrend.suppressedCount}{" "}
                  {bitesTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                  (privacidad)
                </span>
              ) : null
            }
          />
          <OpCardBody>
            {bitesTrendPoints.length === 0 ? (
              <p className="text-[var(--text-md)] text-ln-op-mute">
                No hay incidentes de mordedura registrados en tu cobertura en el período.
              </p>
            ) : (
              <TimeSeriesChartDynamic
                data={bitesTrendPoints}
                seriesLabel="Mordeduras"
                variant="area"
                fallbackTableLabel={`Mordeduras por ${bitesBucketWord}`}
              />
            )}
          </OpCardBody>
        </OpCard>
      </section>

      {/* ===================================================================
          BLOCK 3 — Cola operativa condensada: one compact row of counts+CTAs
          =================================================================== */}
      <section aria-label="Cola operativa" className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Cola operativa
        </h2>
        <OpCard>
          <OpCardBody className="flex flex-wrap gap-x-8 gap-y-3">
            {queueItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-w-[120px] flex-col gap-0.5 no-underline text-inherit"
              >
                {item.count !== undefined && (
                  <span className="font-ln-serif text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ln-op-ink">
                    {item.count.toLocaleString("es-AR")}
                  </span>
                )}
                <span className="text-sm text-ln-op-azul hover:underline">{item.label} →</span>
              </Link>
            ))}
          </OpCardBody>
        </OpCard>
      </section>

      {/* ===================================================================
          BLOCK 4 — Mi trabajo asignado. Renders ONLY when non-empty — an
          operator with nothing assigned sees no empty "0" card here.
          =================================================================== */}
      {myAssignedWelfareCount > 0 && (
        <section aria-label="Mi trabajo asignado" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Mi trabajo asignado
          </h2>
          <OpCard>
            <OpCardBody>
              <Link
                href="/gob/denuncias?etapa=triage&queue=mine"
                className="flex items-baseline gap-2 no-underline text-inherit hover:underline"
              >
                <span className="font-ln-serif text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ln-op-ink">
                  {myAssignedWelfareCount}
                </span>
                <span className="text-sm text-ln-op-azul">
                  {myAssignedWelfareCount === 1
                    ? "denuncia de maltrato asignada a vos"
                    : "denuncias de maltrato asignadas a vos"}{" "}
                  →
                </span>
              </Link>
            </OpCardBody>
          </OpCard>
        </section>
      )}

      {/* ===================================================================
          BLOCK 5 — Novedades, demoted into a collapsed <details> alongside
          the operator's own recent-action log (the old standalone "Actividad
          reciente" card). Reuses NovedadesCard as-is — not rebuilt.
          =================================================================== */}
      <details className="group">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ln-op-ink-2 hover:text-ln-op-ink">
          Actividad reciente
        </summary>
        <div className="mt-4 space-y-4">
          <NovedadesCard feed={novedades} />

          <OpCard>
            <OpCardHead
              title="Mi actividad"
              actions={
                recentDecisions.length > 0 ? (
                  <span className="text-sm text-ln-op-mute">últimos 7 días</span>
                ) : null
              }
            />
            <OpCardBody className="p-0">
              {activityRows.length === 0 ? (
                <p className="px-4 py-3 text-[var(--text-md)] text-ln-op-mute">
                  No tenés acciones registradas en los últimos 7 días.
                </p>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {activityRows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                    >
                      <p className="text-[var(--text-md)] text-ln-op-ink">
                        {activityRowLabel(row)}
                      </p>
                      <time className="text-sm text-ln-op-mute tabular-nums whitespace-nowrap">
                        {new Date(row.performedAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: AR_TIME_ZONE,
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </OpCardBody>
          </OpCard>
        </div>
      </details>

      <DashboardFreshnessFooter ctx={ctx12m} />
    </div>
  );
}

export const dynamic = "force-dynamic";
