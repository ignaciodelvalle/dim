// /gob home — v2 layout (Chunk L swap).
//
// KPI tiles are live data queries scoped to the viewer's jurisdiction.
// Fetchers live in lib/govt-home-kpis.ts (L-followup sprint).
//
// Preserved from old /gob/page.tsx:
//   - fetchVisiblePendingRequests → cola count + preview cards
//   - auditLog query → "Actividad reciente" aside card
//   - requireAdminOrGovtOrRedirect → capability guard

import { and, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { CaseBadge } from "@/components/CaseBadge";
import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { auditLog, db } from "@/db";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import {
  fetchDangerousBreedCompliance,
  fetchMicrochipPenetration,
} from "@/lib/analytics/compliance-metrics";
import { fetchPerdidasMetrics } from "@/lib/analytics/govt-dashboards";
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
import { fetchMortalityDisposition } from "@/lib/analytics/mortality-metrics";
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
  toneForTarget,
} from "@/lib/metrics";
import { getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { auditActionLabel } from "@/lib/ui/audit-action-labels";
import { formatCount, formatDate, formatPercent, formatRate } from "@/lib/utils/format";

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

  const { filteredJurisdictions, localities, allowedProvinces } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: selectedProvinceIso, locality: selectedLocalitySlug },
  });

  // --- Scope label --------------------------------------------------------

  // es-AR label for the operator's role — the raw enum ("govt"/"admin") must
  // never render in the header chrome.
  const roleLabel = profile.role === "admin" ? "Administrador/a" : "Gobierno";

  const scopeLabel =
    profile.role === "admin"
      ? "Universal"
      : jurisdictions.length === 0
        ? "Sin localidades asignadas"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} localidades`;

  // --- All live queries in one bounded Promise.all (18-way, D2) ----------
  // pending, recentDecisions, the KPI queries, and the casos-regulatorios
  // preview are all independent — merged into one fetcher set bounded by
  // loadWithTimeout so a degraded pooler renders an honest fallback instead
  // of hanging the whole page (task #74 death-spiral class).

  const actor = { role: profile.role } as const;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Build one ProjectionContext for all KPI tiles. Uses trailing-12m as the
  // default window (the home dashboard has no period picker). Trailing-30d is
  // passed to fetchSterilizationMetrics separately via ctx.period.since.
  const ctx12m = buildProjectionContext(actor, filteredJurisdictions, windows.trailing12m());
  const ctx30d = buildProjectionContext(actor, filteredJurisdictions, windows.trailing30d());

  // Page header — rendered in both the data and degraded (D2) branches.
  const header = (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
        MiMAR Gobierno · {roleLabel} · {scopeLabel}
      </p>
      <h1 className="text-[var(--text-2xl)] font-semibold text-ln-op-ink">Panel de jurisdicción</h1>

      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href="/gob/cola"
          className="rounded-[var(--radius-md)] bg-ln-op-azul px-3 py-1.5 text-[var(--text-md)] font-medium text-white hover:bg-ln-op-azul-700 transition-colors no-underline"
        >
          Cola de aprobaciones
        </Link>
        <Link
          href="/gob/organizaciones"
          className="rounded-[var(--radius-md)] border border-ln-op-line px-3 py-1.5 text-[var(--text-md)] font-medium text-ln-op-azul hover:bg-ln-op-stripe transition-colors no-underline"
        >
          Habilitación
        </Link>
        <Link
          href="/gob/maltrato"
          className="rounded-[var(--radius-md)] border border-ln-op-danger px-3 py-1.5 text-[var(--text-md)] font-medium text-ln-op-danger hover:bg-ln-op-danger-bg transition-colors no-underline"
        >
          Acta de infracción
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
      fetchMortalityDisposition(ctx12m),
      // Pérdidas activas — SAME fetcher + scope as /gob/perdidas and the Panorama
      // "Pérdidas activas" tile, so the Panel widget can never read 0 while the
      // detail list shows N active (val-2-govt M2). filteredJurisdictions applies
      // the same province/locality narrowing the KPI strip uses.
      fetchPerdidasMetrics(actor, filteredJurisdictions),
      // Casos regulatorios (open/escalated, top 5) — status filter + LIMIT 5
      // are pushed into SQL: admin sees universal scope, govt is
      // jurisdiction-scoped. Previously this loaded up to 500/300 rows and
      // sliced 5 in JS — a full table scan on every dashboard render.
      profile.role === "admin"
        ? listOpenCasesForAdminPreview(5)
        : listOpenCasesForGovtPreview(filteredJurisdictions, 5),
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
  ] = load.value;

  // Shape the bites trend for TimeSeriesChart (x/y points).
  const bitesTrendPoints = bitesTrend.points.map((p) => ({ x: p.x, y: p.y }));
  const bitesBucketWord = bitesTrend.granularity === "month" ? "mes" : "semana";

  const openCases = openCasesPreview.items;
  const openCasesTotal = openCasesPreview.total;

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Jurisdiction filter — same URL contract (province=ISO, locality=slug)
          as every /gob sub-page, so scope carries across drill-downs. */}
      <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />

      {/* KPI strip */}
      <section
        aria-label="Indicadores de jurisdicción"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
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
            rabiesCoverage.hasData
              ? // task #79 — double denominator: name the registry count this % is
                // computed against, then how much of the estimated canine population
                // the padrón covers (or "sin estimación censal" with no census row).
                `${formatCount(rabiesCoverage.registryDenominator)} ${
                  rabiesCoverage.registryDenominator === 1 ? "perro" : "perros"
                } en el padrón · ${
                  rabiesCoverage.censusCoveragePct !== null
                    ? `el padrón cubre ${formatPercent(rabiesCoverage.censusCoveragePct)} de la población canina estimada`
                    : "sin estimación censal"
                } · meta ${TARGETS.RABIES_COVERAGE_PCT}%`
              : "Sin datos en el período"
          }
          sparkline={rabiesVaxTrend.points.map((p) => p.y)}
          href="/gob/analytics"
          info={getKpiInfo("rabies_coverage_dogs_12m")}
        />
        <OpKpi
          label="Esterilizaciones / mes"
          value={sterilizations.count.toLocaleString("es-AR")}
          deltaV2={
            sterilizations.deltaPct !== 0
              ? { value: sterilizations.deltaPct, period: "vs mes ant." }
              : undefined
          }
          sparkline={sterilizationTrend.points.map((p) => p.y)}
          sub={`${sterilizations.orgs} organizaciones`}
          href="/gob/analytics"
          info={getKpiInfo("sterilizations_per_month")}
        />
        <OpKpi
          label="Mordeduras / 10k hab."
          value={formatRate(bitesPer10k.rate)}
          tone="warn"
          deltaV2={
            bitesPer10k.delta !== 0
              ? {
                  value: computeDeltaPct(bitesPer10k.rate, bitesPer10k.rate - bitesPer10k.delta),
                  period: "vs año ant.",
                }
              : undefined
          }
          sparkline={bitesTrend.points.map((p) => p.y)}
          sub={`${bitesPer10k.reports} reportes`}
          href="/gob/vigilancia"
          info={getKpiInfo("bites_per_10k")}
        />
        {/* Zoonosis activas — descompuesto (PO) en 3 señales legibles en vez de
            un único número opaco: observación rábica abierta, mordeduras abiertas
            y enfermedades notificadas. */}
        <OpKpi
          label="Observaciones rábicas abiertas"
          value={openRabiesObservations.count}
          tone={openRabiesObservations.count > 0 ? "danger" : "neutral"}
          deltaV2={
            openRabiesObservations.deltaWeek !== 0
              ? {
                  value: openRabiesObservations.deltaWeek,
                  period: "vs semana ant.",
                  // deltaWeek is a raw net-change count (thisWeek - lastWeek
                  // opens), not a percentage — demo-review M5 caught it
                  // rendering as "+1%" on a count of 1.
                  unit: "count",
                }
              : undefined
          }
          sparkline={zoonosisTrend.points.map((p) => p.y)}
          sub="observaciones en curso"
          href="/gob/vigilancia"
          info={getKpiInfo("open_rabies_observations")}
        />
        <OpKpi
          label="Mordeduras abiertas"
          value={openBiteCases.count}
          tone={openBiteCases.count > 0 ? "warn" : "neutral"}
          sub={openBiteCases.count === 1 ? "caso abierto" : "casos abiertos"}
          href="/gob/vigilancia"
          info={getKpiInfo("open_bite_cases")}
        />
        <OpKpi
          label="Enfermedades notificadas"
          value={notifiedDiseases.count}
          tone={notifiedDiseases.count > 0 ? "danger" : "neutral"}
          sub={`${notifiedDiseases.lepto} lepto · ${notifiedDiseases.hidat} hidat. · últimos 30 días`}
          href="/gob/vigilancia"
          info={getKpiInfo("notified_diseases")}
        />
      </section>

      {/* Mortalidad y disposición (§5 narrative): the third citizen-traceable
          projection, led high so the ledger→dashboard story reads — death events
          and how traceable their disposition is. Full view at /gob/mortalidad. */}
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
                {mortality.total}
              </p>
              <p className="text-xs text-ln-op-mute">Fallecimientos registrados</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ln-op-ink">
                {formatPercent(mortality.traceableRate)}
              </p>
              <p className="text-xs text-ln-op-mute">Disposición trazable</p>
            </div>
          </div>
        </OpCardBody>
      </OpCard>

      {/* Compliance KPI strip (Item 4) — the two headline "¿se cumple la ley?"
          numbers: microchip penetration (C1, Ley Prov 14.107) and PPP registry
          compliance (C7, Ley CABA 4078 / Prov 14.107). C7 reads the honest
          adoption rate — 0% until the attestation form ships is a real signal. */}
      <section
        aria-label="Indicadores de cumplimiento"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <OpKpi
          label="Penetración de microchip"
          value={formatPercent(microchipPenetration.ratePct)}
          tone={toneForTarget(microchipPenetration.ratePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          bar={microchipPenetration.ratePct}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}% · ${microchipPenetration.chipped.toLocaleString("es-AR")} de ${microchipPenetration.active.toLocaleString("es-AR")} activas · Ley 14.107`}
          href="/gob/analytics"
          info={getKpiInfo("microchip_penetration")}
        />
        <OpKpi
          label="Registro PPP"
          value={breedCompliance.flaggedCount === 0 ? "—" : formatPercent(breedCompliance.ratePct)}
          tone={
            breedCompliance.flaggedCount === 0
              ? "neutral"
              : toneForTarget(breedCompliance.ratePct, TARGETS.PPP_ATTESTATION_PCT)
          }
          bar={breedCompliance.flaggedCount === 0 ? undefined : breedCompliance.ratePct}
          sub={
            breedCompliance.flaggedCount === 0
              ? "sin PPP en cobertura · Ley 4078"
              : `${breedCompliance.attested} de ${breedCompliance.flaggedCount} atestadas · Ley 4078`
          }
          href="/gob/analytics"
          info={getKpiInfo("ppp_registry_compliance")}
        />
      </section>

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

      {/* Main 2-col grid */}
      {/* items-start (#52a): without it, CSS Grid's default align-items:stretch
          forces the aside column to match the taller left column's height,
          leaving visible dead space below its last card (Pérdidas) since a
          plain block div doesn't grow to fill that height itself. Sizing each
          column to its own content removes the gap. No admin-home aside
          pattern exists to mirror — app/admin/page.tsx is single-column with
          no rail/quick-links component — so this is the minimal fix rather
          than inventing new aside content. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Left column */}
        <div className="space-y-4">
          {/* Cola de aprobaciones */}
          <OpCard>
            <OpCardHead
              title="Cola de aprobaciones"
              actions={
                <Link
                  href="/gob/cola"
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Ver cola →
                </Link>
              }
            />
            <OpCardBody>
              {pendingCount === 0 ? (
                <p className="text-[var(--text-md)] text-ln-op-mute">
                  No hay solicitudes pendientes.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-ln-op-ink">
                    {pendingCount.toLocaleString("es-AR")}
                  </p>
                  <p className="text-sm text-ln-op-mute">
                    {pendingCount === 1
                      ? "solicitud esperando revisión"
                      : "solicitudes esperando revisión"}
                  </p>
                </div>
              )}
            </OpCardBody>
          </OpCard>

          {/* Actividad reciente */}
          <OpCard>
            <OpCardHead
              title="Actividad reciente"
              actions={
                recentDecisions.length > 0 ? (
                  <span className="text-sm text-ln-op-mute">últimos 7 días</span>
                ) : null
              }
            />
            <OpCardBody className="p-0">
              {recentDecisions.length === 0 ? (
                <p className="px-4 py-3 text-[var(--text-md)] text-ln-op-mute">
                  No tenés acciones registradas en los últimos 7 días.
                </p>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {recentDecisions.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
                    >
                      <p className="text-[var(--text-md)] text-ln-op-ink">
                        {auditActionLabel(entry.action)}
                      </p>
                      <time className="text-sm text-ln-op-mute tabular-nums whitespace-nowrap">
                        {new Date(entry.performedAt).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </OpCardBody>
          </OpCard>

          {/* Casos regulatorios */}
          <OpCard>
            <OpCardHead
              title="Casos regulatorios"
              actions={
                <Link
                  href="/gob/casos"
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  {openCasesTotal > openCases.length
                    ? `Ver todos (${openCasesTotal}) →`
                    : "Ver todos →"}
                </Link>
              }
            />
            <OpCardBody className="p-0">
              {profile.role !== "admin" && jurisdictions.length === 0 ? (
                <p className="px-4 py-3 text-[var(--text-md)] text-ln-op-mute">
                  Sin jurisdicciones asignadas todavía.
                </p>
              ) : openCases.length === 0 ? (
                <p className="px-4 py-3 text-[var(--text-md)] text-ln-op-mute">
                  Sin casos abiertos{" "}
                  {profile.role === "admin" ? "en el sistema" : "en tu jurisdicción"}.
                </p>
              ) : (
                <ul className="divide-y divide-ln-op-line-2">
                  {openCases.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 px-4 py-2.5 odd:bg-ln-op-stripe">
                      <div className="flex items-center justify-between gap-2">
                        <CaseBadge
                          publicCode={c.publicCode}
                          caseKind={c.caseKind}
                          status={c.status}
                          size="sm"
                        />
                        <time className="text-sm text-ln-op-mute tabular-nums whitespace-nowrap">
                          {formatDate(c.openedAt)}
                        </time>
                      </div>
                      {c.primaryPetPublicToken && c.primaryPetName ? (
                        <Link
                          href={`/mis-mascotas/${c.primaryPetPublicToken}`}
                          className="text-sm text-ln-op-mute hover:underline no-underline"
                        >
                          🐾 {c.primaryPetName}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </OpCardBody>
          </OpCard>
        </div>

        {/* Right aside column */}
        <div className="space-y-4">
          {/* The "Vigilancia" link-only placeholder card was removed here —
              it duplicated the "Casos zoonosis activos" KPI tile (with live
              count, delta, sparkline) already in the strip above and added
              no data of its own. /gob/vigilancia stays reachable from the
              KPI tile's href and from the main nav. */}

          {/* Denuncias ciudadanas */}
          <OpCard>
            <OpCardHead
              title="Denuncias ciudadanas"
              actions={
                <Link
                  href="/gob/maltrato"
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Ver bandeja →
                </Link>
              }
            />
            <OpCardBody>
              {openWelfareReports.count === 0 ? (
                <p className="text-[var(--text-md)] text-ln-op-mute">
                  No hay denuncias activas en tu jurisdicción.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-ln-op-ink">
                    {openWelfareReports.count}
                  </p>
                  <p className="text-sm text-ln-op-mute">
                    {openWelfareReports.count === 1 ? "denuncia activa" : "denuncias activas"}
                  </p>
                </div>
              )}
            </OpCardBody>
          </OpCard>

          {/* Pérdidas */}
          <OpCard>
            <OpCardHead
              title="Pérdidas"
              actions={
                <Link
                  href="/gob/perdidas"
                  className="text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Ver →
                </Link>
              }
            />
            <OpCardBody>
              {perdidas.activeCount === 0 ? (
                <p className="text-[var(--text-md)] text-ln-op-mute">
                  No hay mascotas perdidas en tu cobertura.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-ln-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-ln-op-ink">
                    {perdidas.activeCount}
                  </p>
                  <p className="text-sm text-ln-op-mute">
                    {perdidas.activeCount === 1
                      ? "mascota perdida activa"
                      : "mascotas perdidas activas"}
                  </p>
                </div>
              )}
            </OpCardBody>
          </OpCard>
        </div>
      </div>

      <DashboardFreshnessFooter ctx={ctx12m} />
    </div>
  );
}

export const dynamic = "force-dynamic";
