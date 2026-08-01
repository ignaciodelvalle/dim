// /gob home — C6b "THE BRIEFING" (docs/reviews/results/2026-07-22-plan-maestro-
// integridad.md §C6 "Capa 1"), revised per PO visual-validation batch B
// (2026-07-23). PO-locked structure, five blocks in strict order — hierarchy
// by ORDER + COLLAPSE + CONDITIONALITY, never tile-size:
//   1. Alertas priorizadas (hero, max 5) — lib/metrics/briefing-alerts.ts
//      composes these PURELY from metrics this page already fetches.
//   2. Brechas vs meta — the former KPI wall, demoted to "evidence" under the
//      alerts. Every tile in this strip is the SAME OpKpi primitive,
//      including mortalidad/disposición (folded in as two ordinary tiles,
//      2026-07-23 — it used to be its own oddly-shaped OpCard). Genuine
//      chart/trend content (mordeduras por período) lives in its own
//      chart-cards sub-row below the tile grid, never mixed into it.
//   3. Cola operativa — "de a 1": one OpKpi tile per queue (Aprobaciones,
//      Habilitación de organizaciones, Denuncias de maltrato,
//      Casos regulatorios, Pérdidas activas), ALL carrying a live count,
//      ALL the same primitive/size (2026-07-23 — replaces the former
//      condensed single-row of count+CTA chips, and "Habilitación" now
//      carries a count for the first time — see countVisiblePendingRequestsByType).
//   4. Mi trabajo asignado — same "de a 1" OpKpi-tile primitive as block 3.
//      Renders ONLY when non-empty.
//   5. Novedades — demoted into a collapsed <details> ("Actividad reciente"),
//      alongside the operator's own recent-action audit log (same content
//      that used to sit as a standalone "Actividad reciente" card).
//
// The header carries ONLY title + mandate chrome + ViewScopeCaption — no
// primary action (the former lone "Cola de aprobaciones" button felt out of
// place at the top; that queue is now just one of the block-3 cards).
// Filters go through the canonical OpFilterBar (jurisdiction-only, no period
// control — same as every other /gob screen's commit strategy), not a
// bespoke standalone <JurisdictionSwitcher>.
//
// Preserved from the pre-C6b /gob/page.tsx:
//   - fetchVisiblePendingRequests → cola count
//   - auditLog query → the collapsed "Actividad reciente" list
//   - requireAdminOrGovtOrRedirect → capability guard
//   - ViewScopeCaption / mandate chrome (C3) — untouched

import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { NovedadesCard } from "@/components/operator/NovedadesCard";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
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
import { fetchRabiesObservationCompliance } from "@/lib/analytics/surveillance-metrics";
import {
  countVisiblePendingRequests,
  countVisiblePendingRequestsByType,
} from "@/lib/infra/approval-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { countCasesForAdmin, countCasesForGovt } from "@/lib/infra/case-queries";
import {
  TARGETS,
  applyCensusCoverageGuard,
  buildProjectionContext,
  computeDeltaPct,
  fetchBitesTrend,
  fetchKpiTrend,
  resolveSemaphoreTone,
  toneForTarget,
} from "@/lib/metrics";
import {
  type BriefingAlertCandidate,
  type SurveillanceUrgencyCandidate,
  buildBriefingBoard,
  describeBriefingEmptyState,
} from "@/lib/metrics/briefing-alerts";
import { KPI_CATALOG, type KpiId, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { formatMetricLegalBasis } from "@/lib/metrics/metric-legal-basis";
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
  pluralizeEs,
  relativeDayLabel,
} from "@/lib/utils/format";
import { CASE_KINDS_ROUTED_ELSEWHERE } from "@/src/modules/cases/domain/case-kinds";

/**
 * The Casos-regulatorios queue predicate, verbatim from what /gob/casos
 * renders under its default filters (app/gob/casos/CasosScreen.tsx). The tile
 * and the screen it links to MUST count the same rows, and the only way to
 * guarantee that is to share the filter object rather than to reimplement it —
 * the previous pair of bespoke "preview" fetchers disagreed on both the status
 * predicate and the routed-away kinds, and the tile said 38 where the screen
 * said 32.
 *
 * `status: "open"` is the queue's default estado (closedAt IS NULL, which
 * covers escalated as well as open). `excludeKinds` drops custody disputes,
 * which the queue routes to its own screen — counting them here promised rows
 * the destination will not show.
 */
const CASOS_QUEUE_FILTERS = {
  status: "open",
  excludeKinds: CASE_KINDS_ROUTED_ELSEWHERE,
} as const;

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

  // Scope-resolved legal citations (red-team CRITICAL): a province's law is
  // only cited to an operator whose MANDATE (raw assignments, not the page's
  // narrowed filter) includes that province.
  //
  // Admin is universal, so it has no mandate to resolve against — but it DOES
  // have a view. An admin drilled into a province is looking at that
  // province's numbers, and the citation follows the numbers: this is the same
  // "the tile must scale with the jurisdiction" rule the queue counts obey.
  // It can never widen (admin's mandate contains every province). Undrilled,
  // the view is the whole country and the resolver qualifies a
  // provincial-only citation instead of passing it off as national — see
  // NATIONAL_VIEW_PROVINCIAL_ONLY_ES (demo review 2026-08-01: /gob told
  // national officials the obligation behind a country-wide microchip figure
  // was "Ley Prov. 14.107 (PBA)").
  const legalBasisProvinces =
    profile.role === "admin"
      ? adminProvince
        ? [adminProvince]
        : ("all" as const)
      : [...new Set(jurisdictions.map((j) => j.province))];
  const microchipLegalBasis = formatMetricLegalBasis("microchip_penetration", legalBasisProvinces);
  const pppLegalBasis = formatMetricLegalBasis("ppp_registry_compliance", legalBasisProvinces);
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
  // PO visual-validation (2026-07-23): the header keeps ONLY title + mandate
  // chrome + ViewScopeCaption. The old lone "Aprobaciones" (nee "Cola de
  // aprobaciones") action button felt out of place at the very top —
  // approvals now live as one of the individual cola-operativa cards below
  // (with its own live count), so the header carries no primary action at all.
  const header = (
    <ScreenHeader
      className="space-y-2"
      eyebrow={
        <>
          miMAR Gobierno · {roleLabel} · {scopeLabel}
        </>
      }
      title="Panel de jurisdicción"
      subtitle={<ViewScopeCaption scope={narrowedView} />}
    />
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
      // Pérdidas-activas tile, so the Panel widget can never read 0 while the
      // detail list shows N active (val-2-govt M2). filteredJurisdictions applies
      // the same province/locality narrowing the KPI strip uses.
      fetchPerdidasMetrics(actor, filteredJurisdictions, {
        countOnly: true,
        adminProvince,
        adminLocality,
      }),
      // Casos regulatorios — THE SAME COUNT /gob/casos itself renders, from
      // the same two functions with the same filter object (see
      // CASOS_QUEUE_FILTERS). This tile used to call
      // listOpenCasesForAdminPreview / listOpenCasesForGovtPreview, whose
      // predicate was subtly its own: status IN (open, escalated) instead of
      // "not closed", and NO CASE_KINDS_ROUTED_ELSEWHERE exclusion, so it
      // counted the custody disputes the queue deliberately routes to its own
      // screen — measured on staging as 38 here vs "32 casos" one click away
      // (10 vs 9 for a 5-locality operator). The admin variant also took no
      // jurisdiction argument at all, which is why the tile stayed frozen at
      // the national 543 under ?province=AR-B while every sibling tile in the
      // row moved. Counting through the queue's own functions is what makes
      // the two numbers the same number, not two opinions that happen to
      // agree today. It also drops a query: the 5-row preview was never
      // rendered.
      profile.role === "admin"
        ? countCasesForAdmin({
            ...CASOS_QUEUE_FILTERS,
            province: adminProvince ?? null,
            locality: adminLocality ?? null,
          })
        : countCasesForGovt(filteredJurisdictions, CASOS_QUEUE_FILTERS),
      // Novedades — session-start orientation feed. Reuses ctx12m for SCOPE only
      // (admin → universal; govt → its jurisdictions, narrowed by the active
      // switcher filter); the feed window is the per-user watermark, not the
      // ctx period. Bounded by the same loadWithTimeout deadline as the rest.
      fetchNovedadesGroupedFeed(ctx12m, user.id),
      // C6b block 3 ("Mi trabajo asignado") — the ONE cheap count query this
      // task allows: welfare reports assigned to the viewer, still actionable.
      // NOT fetchWelfareMetrics (that bundles 3 unused counts in one call).
      fetchMyAssignedWelfareCount(actor, filteredJurisdictions, user.id),
      // PO visual-validation (2026-07-23): "Habilitación de organizaciones" had
      // NO metric while every other cola-operativa card carried one. Reuses the
      // SAME scope predicate as countVisiblePendingRequests (visibleRequestsClause)
      // — the one new query this pass adds, scoped + bounded exactly like its
      // sibling COUNT above.
      countVisiblePendingRequestsByType(profile, jurisdictions, "organization_verification"),
      // Cursor red-team 2026-07-23 (claim #4) — the ONE new cheap query the
      // PO's sweep authorized for the briefing's surveillance-urgency alerts:
      // reuses the SAME catalogued fetcher /gob/vigilancia already calls, but
      // home only reads its `openBreaches` (A9, a live "now" snapshot of
      // observations already past the 10-day legal window) — the
      // escalation-gap candidate below costs ZERO new queries (bitesPer10k +
      // openRabiesObservations are both already fetched above).
      fetchRabiesObservationCompliance(ctx12m),
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
    openCasesTotal,
    novedades,
    myAssignedWelfareCount,
    orgVerificationPendingCount,
    rabiesObservationCompliance,
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

  // Shape the bites trend for TimeSeriesChart. The `suppressed` flag rides
  // ALONG — this map used to rebuild each point as a bare `{ x, y }`, dropping
  // it, so a k-anonymity mask (1..k-1, carried as `y: 0` + `suppressed`) was
  // republished as a measured zero: eleven "0 mordeduras" months in the "Ver
  // datos" table under a header that already said "11 períodos ocultos
  // (privacidad)", while the KPI above read 37 reportes. Suppressed ≠ cero —
  // a zero is an epidemiological claim, "oculto" is the absence of one, and
  // the Panorama CSV/PNG of the same fact already writes "Protegido (k<5)".
  const bitesTrendPoints = bitesTrend.points;
  const bitesBucketWord = bitesTrend.granularity === "month" ? "mes" : "semana";

  // -------------------------------------------------------------------------
  // C6b block 1 — Alertas priorizadas. Pure composition from metric values
  // this page ALREADY fetches (zero new query fan-out) — see
  // lib/metrics/briefing-alerts.ts for the guard/ranking contract. Candidates
  // that fail a guard (no target, small-N, zero-denominator, target already
  // met) never become alerts — but buildBriefingBoard now RECORDS which guard
  // dropped each one (BriefingCoverage), because the empty state has to say
  // which emptiness it is (A1, 2026-07-31) instead of painting every empty
  // list green.
  //
  // DROPPED FOR NEEDING A NEW QUERY (documented, not wired): reunification_rate
  // (this page only fetches perdidas' activeCount, not the reunification
  // ratio — that lives on /gob/perdidas), campaign_completion_rate,
  // eno_sla_compliance — none of their fetchers are part of this page's
  // bounded Promise.all today.
  // -------------------------------------------------------------------------
  const alertCandidates: BriefingAlertCandidate[] = [
    {
      // A1 (2026-07-31): this candidate used to be OMITTED from the array when
      // `!rabiesCoverage.hasData`, which made the metric invisible to the
      // briefing — the empty state could then claim "las métricas con meta
      // están dentro de rango" about a padrón with zero registered dogs.
      // Passing it unconditionally is behaviourally identical for ALERTING
      // (hasData is literally `totalDogs > 0` and registryDenominator is
      // `totalDogs`, so n===0 exactly when hasData is false, and the
      // descriptor's zeroDenominator guard drops it before any tone is
      // computed) — but now the engine SEES it and reports it as unmeasured.
      kpiId: "rabies_coverage_dogs_12m" as const,
      value: rabiesCoverage.current,
      n: rabiesCoverage.registryDenominator,
      auxPresent: rabiesCoverage.censusCoveragePct !== null,
    },
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
  // Claim #4 (cursor red-team 2026-07-23) — surveillance-urgency signals,
  // merged into the same ranked/capped alert list. Escalation gap reuses
  // fields already fetched above (bitesPer10k, openRabiesObservations) — zero
  // new queries; deadline_breach reads the ONE new query this pass adds.
  const urgencySignals: SurveillanceUrgencyCandidate[] = [
    {
      kind: "escalation_gap",
      bites12m: bitesPer10k.reports,
      openObservations: openRabiesObservations.count,
    },
    { kind: "deadline_breach", openBreaches: rabiesObservationCompliance.openBreaches },
  ];
  const { alerts, coverage: alertCoverage } = buildBriefingBoard(
    alertCandidates,
    urgencySignals,
    legalBasisProvinces,
  );
  // Only read when `alerts` is empty — the honest reading of WHY (see A1 in
  // briefing-alerts.ts). Computed here rather than inline in the JSX so the
  // headline and its detail lines come from the SAME coverage object.
  const emptyBriefing = describeBriefingEmptyState(alertCoverage);

  // Claim #1 (cursor red-team 2026-07-23) — "dual-denominator hero": the
  // registry % (rabiesCoverage.current) can read a confident 65% while the
  // padrón it's computed over covers a sliver of the census-estimated
  // population (e.g. ~0.4%) — that registry % must never paint an ok/warn/
  // danger verdict on its own when the padrón itself is this thin. Computed
  // once here (rather than inline in the JSX) so both the tone AND the
  // warning note derive from the SAME guard call.
  const rabiesCensusGuard = rabiesCoverage.hasData
    ? applyCensusCoverageGuard(KPI_CATALOG.rabies_coverage_dogs_12m, {
        censusCoveragePct: rabiesCoverage.censusCoveragePct,
        computedTone: toneForTarget(rabiesCoverage.current, TARGETS.RABIES_COVERAGE_PCT),
      })
    : null;

  // C6b block 3 — Cola operativa, "de a 1" (PO visual-validation, 2026-07-23:
  // the condensed count+CTA chip row read as one undifferentiated strip — the
  // PO wants individual cards, one per queue, ALL carrying a live count, ALL
  // the same primitive/size (OpKpi tiles with href — same primitive the
  // Brechas vs meta strip already uses, so the whole page reads as one
  // system). "Habilitación de organizaciones" used to be the one queue
  // WITHOUT a metric; it now carries orgVerificationPendingCount (the one new
  // query this pass adds — see countVisiblePendingRequestsByType above).
  // Aprobaciones (nee "Cola de aprobaciones") no longer duplicates as a
  // header button (removed, see `header` above) — this card is its single
  // occurrence now. Label renamed (PO interview 2026-07-23, item 5) to match
  // the nav rename — see components/layout/nav-presets.ts.
  // /gob/casos with the page's own jurisdiction filter attached — same param
  // names, same values, no re-derivation.
  const casosParams = new URLSearchParams();
  if (selectedProvinceIso) casosParams.set("province", selectedProvinceIso);
  if (selectedLocalitySlug) casosParams.set("locality", selectedLocalitySlug);
  const casosHref = casosParams.size > 0 ? `/gob/casos?${casosParams}` : "/gob/casos";

  const queueItems: Array<{ href: string; label: string; count: number; descriptorId?: KpiId }> = [
    {
      href: "/gob/cola",
      label: "Aprobaciones",
      count: pendingCount,
      descriptorId: "queue_pending_total",
    },
    {
      // F3+F7 fusion (2026-07-22): Organizaciones is now the Directorio hub's
      // "organizaciones" tab (the default) — link straight there instead of
      // through the old /gob/organizaciones redirect.
      href: "/gob/directorio?registro=organizaciones",
      label: "Habilitación de organizaciones",
      count: orgVerificationPendingCount,
    },
    {
      // F1 fusion (2026-07-22): Maltrato is now the Denuncias hub's "Triage"
      // stage — link straight there instead of through the old redirect.
      href: "/gob/denuncias?etapa=triage",
      label: openWelfareReports.count === 1 ? "Denuncia de maltrato" : "Denuncias de maltrato",
      count: openWelfareReports.count,
      descriptorId: "open_welfare_reports",
    },
    {
      // Carries the ACTIVE jurisdiction filter through to the queue, in the
      // canonical contract (province=ISO, locality=slug) /gob/casos now
      // speaks. A tile that counts one province and links to a national list
      // is the same lie told twice; the count above and this link are the two
      // halves of one claim.
      href: casosHref,
      label: "Casos regulatorios",
      count: openCasesTotal,
    },
    {
      href: "/gob/perdidas",
      label: perdidas.activeCount === 1 ? "Mascota perdida activa" : "Mascotas perdidas activas",
      count: perdidas.activeCount,
      descriptorId: "lost_pets_active_stock",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header — mandate chrome (C3) only, no primary action */}
      {header}

      {/* Filters — PO visual-validation (2026-07-23): the home rendered a
          bespoke standalone <JurisdictionSwitcher>, not the canonical filter
          component every other /gob screen commits through. The home has no
          period control (fixed trailing-12m ctx, no picker) and no
          screen-specific domain axes — jurisdiction-only, same as
          /gob/reglas's showPeriod={false} bar, same URL contract
          (province=ISO, locality=slug) and commit strategy
          (serverNavCommit) as every other screen. */}
      <OpFilterBar showPeriod={false} jurisdiction={{ allowedProvinces, localities }} />

      {/* ===================================================================
          BLOCK 1 — Alertas priorizadas (the hero, max 5)
          =================================================================== */}
      <section aria-label="Alertas priorizadas" className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Alertas priorizadas
        </h2>
        {alerts.length === 0 ? (
          <OpCard>
            {/* A1 (2026-07-31): this used to be a single hardcoded sentence —
                "las métricas con meta están dentro de rango" — rendered from
                `alerts.length === 0` alone. Every guard in the briefing engine
                drops its candidate silently, so a jurisdiction where NOTHING
                was measured produced the same empty list as one where every
                target was met, and the screen read it as a green verdict. The
                copy now comes from the coverage report: it names how many
                metrics were actually measured and met, and lists the ones that
                were not measured (or whose sample is too small to judge)
                separately. No accent tone here on purpose — this is a
                statement of fact, not an alarm. */}
            <OpCardBody className="space-y-1">
              <p className="text-md text-ln-op-mute">{emptyBriefing.headline}</p>
              {emptyBriefing.details.map((detail) => (
                <p key={detail} className="text-xs text-ln-op-mute">
                  {detail}
                </p>
              ))}
            </OpCardBody>
          </OpCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alerts.map((alert) => (
              <OpCard key={alert.id} accent={alert.severity === "alta" ? "danger" : "warn"}>
                <OpCardBody className="space-y-1.5">
                  <p className="text-md font-medium text-ln-op-ink">
                    <span className="sr-only">
                      {alert.severity === "alta" ? "Prioridad alta" : "Prioridad media"}:
                    </span>
                    {alert.title}
                  </p>
                  <p className="text-xs text-ln-op-mute">
                    Confianza: {alert.confidence} · n = {formatCount(alert.evidence.n)}
                    {/* PO decision 2 item 2: "faltan ~N dosis/cirugías/chips" —
                        undefined (nothing rendered) whenever the descriptor
                        has no resourceUnit or the engine has nothing honest
                        to say (met/no-denominator/negligible gap). */}
                    {alert.evidence.resourceLine && ` · ${alert.evidence.resourceLine}`}
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
            tone={rabiesCensusGuard?.tone ?? "neutral"}
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
                    /* Two different absences behind one number (demo review
                       2026-08-01). "grain-mismatch" means the estimate EXISTS
                       but describes a whole province while this view does not
                       — the honest read is "not answerable at this scale",
                       not "we have no data on you". The flat "Sin estimación
                       censal" that used to cover both would land on a
                       5-barrio municipality as if its data were missing. */
                    <span className="block">
                      {rabiesCoverage.censusUnavailableReason === "no-census-row"
                        ? "Sin estimación censal para esta provincia"
                        : "Sin estimación censal a esta escala — el censo poblacional es provincial"}
                    </span>
                  )}
                  <span className="block text-ln-op-mute">
                    {formatCount(rabiesCoverage.registryDenominator)}{" "}
                    {rabiesCoverage.registryDenominator === 1 ? "perro" : "perros"} en el padrón ·
                    meta {TARGETS.RABIES_COVERAGE_PCT}%
                  </span>
                  {/* Dual-lens disclosure (T1): the declared % stays the
                      headline; this names the vet-signed portion alongside. */}
                  <span className="block text-ln-op-mute">
                    {formatPercent(rabiesCoverage.signedPct)} firmado por matrícula
                  </span>
                  {/* Claim #1 — low-confidence warning: never silently forced
                      neutral, the tile states WHY. */}
                  {rabiesCensusGuard?.note && (
                    <span className="block text-[var(--color-st-warn)]">
                      {rabiesCensusGuard.note}
                    </span>
                  )}
                </span>
              ) : (
                "Sin datos en el período"
              )
            }
            sparkline={rabiesVaxTrend.points.map((p) => p.y)}
            // F9 (2026-08-01): was /gob/analytics — a generic destination that
            // does not render this KPI at all. What it DOES render is
            // rabies_vaccination_rate_all_species, the deliberately-distinct
            // all-species/no-window metric; sending a "perros, 12 meses" tile
            // there was the exact "same label, different number" confusion the
            // catalog warns about. The province-vs-target breakdown of THIS
            // definition (dogs only, 12m window — fetchCrossJurisdictionOutliers'
            // `rabies` rows reuse rabiesVaccinatedExists with ctx.period, same
            // predicate as fetchRabiesCoverage) is the Programa outliers table.
            href="/gob/programa?vista=resumen#gob-programa-outliers-titulo"
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
            // Dual-lens disclosure (T1): vet-signed portion alongside the
            // declared count (omitted at 0 events — no lens over nothing).
            sub={
              sterilizations.count > 0
                ? `${sterilizations.orgs} ${pluralizeEs(sterilizations.orgs, "organización", "organizaciones")} · ${formatPercent(sterilizations.signedPct)} firmado por matrícula`
                : `${sterilizations.orgs} ${pluralizeEs(sterilizations.orgs, "organización", "organizaciones")}`
            }
            // F9: the monthly breakdown of the SAME sterilization_performed
            // event stream this tile counts is the "Tendencia de
            // esterilizaciones" panel of the Padrón hub's Población vista.
            href="/gob/padron?vista=poblacion#panel-esterilizacion-titulo"
            descriptorId="sterilizations_per_month"
            guardInput={{ priorBase: sterilizations.prevCount }}
          />
          <OpKpi
            label={
              bitesPer10k.percapitaEligible ? "Mordeduras / 10k hab." : "Mordeduras (12 meses)"
            }
            value={
              !bitesPer10k.percapitaEligible
                ? formatCount(bitesPer10k.reports)
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
                    // Bad-when-up: a rising bite rate must never scan green.
                    valence: "goodWhenDown" as const,
                  }
                : undefined
            }
            sparkline={bitesTrend.points.map((p) => p.y)}
            sub={
              bitesPer10k.percapitaEligible
                ? `${formatCount(bitesPer10k.reports)} reportes`
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
                    // Bad-when-up: more open observations must never scan green.
                    valence: "goodWhenDown" as const,
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
            sub={
              notifiedDiseases.other > 0
                ? `${notifiedDiseases.lepto} lepto · ${notifiedDiseases.hidat} hidat. · ${notifiedDiseases.other} otras · últimos 30 días`
                : `${notifiedDiseases.lepto} lepto · ${notifiedDiseases.hidat} hidat. · últimos 30 días`
            }
            href="/gob/vigilancia"
            info={getKpiInfo("notified_diseases")}
            descriptorId="notified_diseases"
          />
          <OpKpi
            label={KPI_CATALOG.microchip_penetration.label}
            value={formatPercent(microchipPenetration.ratePct)}
            tone={toneForTarget(microchipPenetration.ratePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
            bar={microchipPenetration.ratePct}
            sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}% · ${microchipPenetration.chipped.toLocaleString("es-AR")} de ${microchipPenetration.active.toLocaleString("es-AR")} activas/perdidas${microchipLegalBasis ? ` · ${microchipLegalBasis}` : ""}`}
            // F9: the identification funnel ("Con chip ISO activo" measured
            // against this same TARGETS.MICROCHIP_PENETRATION_PCT, then ISO
            // validity and scan recency) lives in the Padrón hub's Censo
            // vista — the drill target /gob/programa's own Microchip tile
            // already uses.
            href="/gob/padron?vista=censo#panel-embudo-titulo"
            descriptorId="microchip_penetration"
            // Red-team 2026-07 #3: 0-pet padrón (e.g. out-of-mandate locality
            // filter) renders "—", not a fabricated 0%.
            guardInput={{ n: microchipPenetration.active }}
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
                ? `sin PPP en cobertura${pppLegalBasis ? ` · ${pppLegalBasis}` : ""}`
                : `${breedCompliance.attested} de ${breedCompliance.flaggedCount} atestadas en miMAR · no mide cumplimiento registral externo${pppLegalBasis ? ` · ${pppLegalBasis}` : ""}`
            }
            // F9: the weakest of the four re-points, and worth saying why.
            // NOTHING renders a PPP attestation breakdown in a server-rendered
            // panel — /gob/reglas configures the breed list and the accepted
            // registries but publishes no rate, and /gob/analytics never
            // mentioned PPP at all. The one surface that DOES break this exact
            // metric down is the Panorama `ppp` choropleth, fed by the same
            // fetchDangerousBreedCompliance this tile reads, opened by the
            // "Riesgo PPP" vista (base: ppp).
            href="/gob/panorama?preset=riesgo-ppp"
            descriptorId="ppp_registry_compliance"
          />

          {/* Mortalidad y disposición (§5 narrative) — the third citizen-
              traceable projection: death events + how traceable their
              disposition is. PO visual-validation (2026-07-23): these two
              numbers used to live in their own OpCard, unlike every neighbor
              tile in this strip — folded into the SAME OpKpi primitive here.
              Zero-denominator / small-N guarding is now the descriptor's own
              guard engine (guardInput.n) instead of a re-invented inline
              `mortalityHasDeaths` check — same guarantee, one fewer bespoke
              gate. Full view at /gob/mortalidad. */}
          <OpKpi
            label={KPI_CATALOG.mortality_deaths_12m.label}
            value={formatCount(mortality.total)}
            sub="últimos 12 meses"
            href="/gob/mortalidad"
            descriptorId="mortality_deaths_12m"
            guardInput={{ n: mortality.total }}
          />
          <OpKpi
            label={KPI_CATALOG.mortality_disposal_traceability.label}
            value={formatPercent(mortality.traceableRate)}
            tone={toneForTarget(mortality.traceableRate, TARGETS.DISPOSAL_TRACEABILITY_PCT)}
            sub="últimos 12 meses"
            href="/gob/mortalidad"
            descriptorId="mortality_disposal_traceability"
            guardInput={{ n: mortality.total }}
          />
        </div>

        {/* Chart-cards sub-row — PO visual-validation (2026-07-23): a tile
            that genuinely carries a chart/trend does NOT get squeezed into
            the OpKpi grid above; it gets its OWN row of matching chart-cards
            instead. Only one chart card exists on this page today (mordeduras
            por período); this row is where any future one joins it. */}
        {/* D1 — mordeduras por período (tendencia) */}
        <OpCard aria-labelledby="panel-bites-trend-titulo">
          <OpCardHead
            title={
              <span id="panel-bites-trend-titulo">
                Mordeduras por {bitesBucketWord}{" "}
                <span className="text-sm font-normal text-ln-op-mute">últimos 12 meses</span>
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
              <p className="text-md text-ln-op-mute">
                No hay incidentes de mordedura registrados en tu cobertura en el período.
              </p>
            ) : (
              <TimeSeriesChartDynamic
                data={bitesTrendPoints}
                seriesLabel="Mordeduras"
                variant="area"
                fallbackTableLabel={`Mordeduras por ${bitesBucketWord}`}
                // Without this the "todo suprimido" case renders an empty plot
                // that reads as a render failure or as "no hubo mordeduras" —
                // with it the chart states "Datos ocultos por privacidad (k<5)".
                suppressedCount={bitesTrend.suppressedCount}
              />
            )}
          </OpCardBody>
        </OpCard>
      </section>

      {/* ===================================================================
          BLOCK 3 — Cola operativa, "de a 1": one OpKpi tile per queue, all
          carrying a live count.
          =================================================================== */}
      <section aria-label="Cola operativa" className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Cola operativa
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {queueItems.map((item) => (
            // PO 2026-07-24 (G7): zero-count queues de-emphasize, order stays fixed.
            <div key={item.href} className={item.count === 0 ? "opacity-60" : undefined}>
              <OpKpi
                label={item.label}
                value={formatCount(item.count)}
                href={item.href}
                descriptorId={item.descriptorId}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ===================================================================
          BLOCK 4 — Mi trabajo asignado. Renders ONLY when non-empty — an
          operator with nothing assigned sees no empty "0" card here. Same
          "de a 1" OpKpi-tile primitive as Cola operativa above (PO
          visual-validation, 2026-07-23).
          =================================================================== */}
      {myAssignedWelfareCount > 0 && (
        <section aria-label="Mi trabajo asignado" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Mi trabajo asignado
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <OpKpi
              label={
                myAssignedWelfareCount === 1
                  ? "Denuncia de maltrato asignada"
                  : "Denuncias de maltrato asignadas"
              }
              value={formatCount(myAssignedWelfareCount)}
              sub="a vos"
              href="/gob/denuncias?etapa=triage&queue=mine"
              descriptorId="my_assigned_welfare_reports"
            />
          </div>
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
                // H17 (2026-07-30): a bare muted sentence left the operator
                // guessing whether the log was empty, unreachable, or simply
                // out of scope. This one IS a measured zero and says so
                // explicitly — the audit_log query runs unconditionally,
                // filtered only by the viewer's own user id and 7 days, with no
                // jurisdiction scope to come up empty. Declaring
                // nature="measured-zero" is the claim that it was measured, not
                // decoration (see components/ui/EmptyState.tsx).
                <div className="px-4 py-3">
                  <LnEmptyState
                    icon="circle-dot"
                    title="No tenés acciones registradas en los últimos 7 días"
                    description="Se consultó tu registro de auditoría: no hay acciones tuyas en la ventana. No es un error de carga."
                    nature="measured-zero"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {activityRows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                    >
                      <p className="text-md text-ln-op-ink">{activityRowLabel(row)}</p>
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
