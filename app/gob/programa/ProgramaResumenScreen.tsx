// ProgramaResumenScreen — the "Resumen" vista of the Programa hub, and its
// DEFAULT: the executive outcome-vs-target read, scoped to jurisdiction (govt
// view of /admin/programa).
//
// F9 fusion (2026-08-01): the hub ABSORBS Analítica as a second vista
// (`?vista=resumen|analitica`). This body is a RELOCATION of the former
// app/gob/programa/page.tsx, not a redesign — the only edits are the three a
// hub tab owns instead of the screen: `export const dynamic` (now on the hub
// page), the eyebrow/h1 (suppressed via ScreenHeader's `underHub`), and the
// prop shape (searchParams arrives already-resolved from the hub).
//
// Division of labour between the two vistas: this one answers "¿vamos bien
// contra la meta?" (KPI strip, provinces vs target, data quality, queue);
// Analítica answers "¿qué hay debajo?" (adquisición por método, señales por
// mes, acceso veterinario, causas de muerte, brotes históricos). A number that
// already appears here is LINKED from Analítica, never restated there.
//
// What's kept vs. admin/programa:
//   KEEP: registryCounts, fetchSterilizationCoverage, fetchMicrochipPenetration,
//         fetchEnoSla, fetchDataQuality, fetchCrossJurisdictionOutliers (relabeled
//         "Tus provincias" — returns only the govt's assigned provinces),
//         fetchPiiOversight (scoped to govt actors in their jurisdiction).
//   REPLACE: fetchQueueHealth() → fetchQueueHealthScoped(filteredJurisdictions)
//   DROP: fetchCronRuns() — platform infra, admin-meta, not gov data.
//
// MOVED (2026-07-21): the embedded "Alertas y suscripciones" panel
// (evaluateAlertSubscriptions + create/toggle/delete) was promoted to its own
// page at /gob/suscripciones — see that file for the full rationale. This
// page keeps only a discovery link to it.
//
// Fold from /gob/sistema (2026-07-09 audit, PO-ratified): for a govt operator,
// /gob/sistema's KPIs (ENO SLA %, scoped queue aging) were already rendered
// here from the same fetchers. The one figure that was NOT already here —
// enoSla.total, the notification count backing the SLA % — is now surfaced
// in the "SLA ENO" KPI sub-line below. /gob/sistema now redirects govt here;
// see app/gob/sistema/page.tsx.
//
// Privacy invariant: all fetchers receive a scoped ctx or filteredJurisdictions —
// a govt can never see data outside their assigned localities.

import { inArray } from "drizzle-orm";

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
import { db, profiles } from "@/db";
import { fetchQueueHealthScoped } from "@/lib/analytics/admin-metrics";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { fetchMicrochipPenetration } from "@/lib/analytics/compliance-metrics";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { govtProvinceHref } from "@/lib/infra/admin-province-link";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  NO_CENSUS_NOTE,
  type OutlierMetric,
  TARGETS,
  buildProjectionContext,
  countAlertedProvinces,
  enoSlaTone,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  formatImpactUnits,
  formatTopImpactLine,
  rankByImpact,
  resourceGap,
  scopeTotalSuppressionNotice,
  summarizeTopImpact,
  toneForTarget,
  totalImpactByJurisdiction,
} from "@/lib/metrics";
import {
  DORMANT_MONTHS_DEFAULT,
  estimateDogPopulation,
  getCensusPopulationsCached,
  registryCounts,
} from "@/lib/metrics/census";
import { KPI_CATALOG, getKpiInfo } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { resolveAnalyticsPeriod } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { auditActionLabel } from "@/lib/ui/audit-action-labels";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import { formatDateShort, formatPercent, pluralizeEs } from "@/lib/utils/format";

const METRIC_LABEL: Record<string, string> = {
  rabies: "Antirrábica",
  sterilization: "Esterilización",
  microchip: "Microchip",
};

// PO-interview decision 2, item 1 — the honest unit per metric for the
// impact-ranking column: "~N perros sin vacunar", never an abstract score.
const IMPACT_UNIT_LABEL: Record<OutlierMetric, string> = {
  rabies: "perros sin vacunar",
  sterilization: "mascotas sin esterilizar",
  microchip: "mascotas sin chip",
};

// es-AR labels for the PII-oversight "surface" dimension (operator search origin).
// Mirrors SURFACE_LABEL in app/admin/programa — the gob twin previously leaked the
// raw enum code into the operator UI.
const SURFACE_LABEL: Record<string, string> = {
  users: "Usuarios",
  organizations: "Organizaciones",
  omnibox: "Buscador",
};

export type ProgramaResumenScreenProps = {
  searchParams: {
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
  };
  /**
   * True when rendered as the Programa hub's "Resumen" tab (app/gob/programa/
   * page.tsx) — see components/ui/dashboard/ScreenHeader.tsx.
   */
  underHub?: boolean;
};

export async function ProgramaResumenScreen({
  searchParams: sp,
  underHub = false,
}: ProgramaResumenScreenProps) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role } as const;

  // Capability guard: exec summary requires admin OR (govt AND has assignments).
  const hasAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso al resumen ejecutivo. Pedile al admin que te asigne jurisdicciones."
        />
      </div>
    );
  }

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

  // C3 disclosure: caption when this page's filters narrow below the mandate.
  const narrowedView = describeNarrowedView({
    role: profile.role,
    mandateJurisdictions: jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    adminProvince,
    adminLocality,
  });

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();
  const ctx = buildProjectionContext(actor, filteredJurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // Header + filters render in both the data and degraded (timeout) branches.
  const header = (
    <ScreenHeader
      underHub={underHub}
      className="space-y-2"
      eyebrow="Gobierno"
      title="Resumen ejecutivo — tu jurisdicción"
      subtitle={
        <>
          {/* The universal claim yields to the narrowed-view caption (never both). */}
          {profile.role === "admin" ? (
            narrowedView ? null : (
              <p className="text-md text-ln-op-mute">Vista universal — todas las jurisdicciones.</p>
            )
          ) : (
            <p className="text-md text-ln-op-mute">
              KPIs principales, valores atípicos por jurisdicción, calidad de datos y supervisión de
              PII en tu cobertura asignada.
            </p>
          )}
          <a
            href="/gob/suscripciones"
            className="inline-block text-sm font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
          >
            Alertas y suscripciones →
          </a>
          <ViewScopeCaption scope={narrowedView} />
        </>
      }
    />
  );
  const filtersRow = (
    <OpFilterBar
      period={{ defaultPreset: "trailing12m" }}
      jurisdiction={{ allowedProvinces, localities }}
    />
  );

  // Bound the fetcher set with a deadline so a degraded DB yields an honest
  // "reintentar" state instead of an unbounded hang (parity with /admin/programa).
  // getCensusPopulationsCached is a process-lifetime cache (lib/metrics/census.ts)
  // — ZERO new fan-out on every render after the first; added here (not fetched
  // ad-hoc below) so the same timeout guard protects a cold cache too.
  const load = await loadWithTimeout(
    Promise.all([
      registryCounts(ctx, DORMANT_MONTHS_DEFAULT),
      fetchSterilizationCoverage(ctx),
      fetchMicrochipPenetration(ctx),
      fetchEnoSla(ctx),
      fetchQueueHealthScoped(filteredJurisdictions, { adminProvince, adminLocality }),
      fetchDataQuality(ctx),
      fetchCrossJurisdictionOutliers(ctx),
      fetchPiiOversight(ctx),
      getCensusPopulationsCached(),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        {filtersRow}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/gob/programa", sp)}
        />
      </div>
    );
  }

  const [
    registry,
    sterilization,
    microchip,
    enoSla,
    queue,
    dataQuality,
    outliers,
    piiOversight,
    censusPopulations,
  ] = load.value;

  // THE HEADLINE OBEYS THE SAME VERDICT AS THE ROWS (RA-3 finding C1, third
  // instance). This page accepts `?province=` (above), and for an admin that
  // drill narrows `ctx` through `petsScopeClause` — so with
  // `/gob/programa?province=AR-V` EVERY figure below is counted over a single
  // foreign jurisdiction: "Total registradas" IS that province's withheld cell,
  // the esterilización tile is its rate over the same base (and `forecast`
  // multiplies the two back into the numerator), microchip/SLA/cola/calidad are
  // the same three animals seen from other angles. So the page withholds them
  // together rather than tile by tile — an executive summary with one honest
  // tile and five withheld ones is not a summary.
  //
  // ONE decision point: `fetchSterilizationCoverage` handed down
  // `scopeTotalPublishable` from the same `planProvinceDisclosure` call that
  // decided its province rows, and its per-province denominator is `count(pets)`
  // over `activePetsCondition` — the SAME base `registryCounts(ctx).total`
  // counts. Nothing is re-derived here; a second decision point is the bug this
  // class keeps producing.
  //
  // D.10 SURVIVES: a govt operator's own province is never a suppression
  // candidate (`isOwnJurisdictionProvince`), so their scope total is never
  // withheld — they keep their real number at 3 pets.
  const scopeNotice = scopeTotalSuppressionNotice(sterilization.scopeTotalPublishable);
  if (scopeNotice) {
    return (
      <div className="space-y-6">
        {header}
        {filtersRow}
        <LnEmptyState
          icon="lock"
          title="Datos insuficientes (privacidad)"
          description={scopeNotice}
        />
      </div>
    );
  }

  // outlierCount is a COMBINATION count (provincia × métrica) — correct for the
  // outliers table caption below ("N de M combinaciones bajo meta"), but NOT
  // honest as the value behind a KPI literally labeled Provincias en alerta
  // (a province can contribute several rows here, one per below-target
  // metric — hence outlierCount routinely exceeding the ~24 AR provinces).
  // alertedProvinceCount collapses those rows to DISTINCT provinces so the KPI
  // matches its own label; it can never exceed the real province count.
  const outlierCount = outliers.filter((r) => r.isOutlier).length;
  const alertedProvinceCount = countAlertedProvinces(outliers);
  const chipRatePct = microchip.ratePct;
  const sterilRatePct = sterilization.rate;

  // PO-interview decision 2, item 1 — gap×población ranking: "24 provincias en
  // alerta" doesn't say WHICH one matters most. Each outlier row gets an
  // estimated real-world impact — (target−coverage)/100 × población canina
  // estimada (same census-derived estimate rabies coverage already uses, see
  // census.ts's estimateDogPopulation) — then the table re-ranks by it instead
  // of province-count order. ZERO new fan-out: censusPopulations was fetched
  // above in the SAME bounded Promise.all as every other fetcher on this page.
  const outlierImpactInputs = outliers.map((row) => ({
    ...row,
    jurisdiction: row.province,
    coverage: row.rate,
    population: estimateDogPopulation(censusPopulations[row.province] ?? 0),
  }));
  // rankByImpact excludes already-met rows (no gap to rank) — appended back
  // below so the table keeps showing them (green, "meets target"), just
  // ordered AFTER the real gaps instead of interleaved by province-count.
  const impactRankedOutliers = rankByImpact(outlierImpactInputs);
  const metOutlierRows = outliers
    .filter((r) => !r.isOutlier)
    .map((r) => ({ ...r, impact: undefined as number | null | undefined }));
  const displayOutliers = [...impactRankedOutliers, ...metOutlierRows];
  const topImpactSummary = summarizeTopImpact(totalImpactByJurisdiction(outlierImpactInputs));

  // PO-interview decision 2, item 2 — forecasts/gap tiles state WHAT is
  // missing, not just the %. registry.total is the SAME denominator these
  // ratios were computed over ("COUNT active/lost pets in scope" — see
  // kpi-catalog.ts's sterilization_coverage_population/microchip_penetration
  // entries), so this is zero new fetch, never a second population figure.
  const sterilResourceLine = KPI_CATALOG.sterilization_coverage_population.resourceUnit
    ? (resourceGap(
        {
          current: sterilRatePct,
          target: TARGETS.STERILIZATION_COVERAGE_PCT,
          denominator: registry.total,
        },
        KPI_CATALOG.sterilization_coverage_population.resourceUnit,
      ).line ?? undefined)
    : undefined;
  const chipResourceLine = KPI_CATALOG.microchip_penetration.resourceUnit
    ? (resourceGap(
        {
          current: chipRatePct,
          target: TARGETS.MICROCHIP_PENETRATION_PCT,
          denominator: registry.total,
        },
        KPI_CATALOG.microchip_penetration.resourceUnit,
      ).line ?? undefined)
    : undefined;

  // Batch-resolve actor UUIDs in the PII oversight table to display names — the
  // panel asks "¿quién consultó qué?", so an opaque UUID fragment defeats it.
  // Mirrors the admin twin. Scope is already enforced upstream: fetchPiiOversight
  // only returns actors acting within this operator's jurisdiction.
  const uniqueActorIds = [
    ...new Set(piiOversight.map((r) => r.actorUserId).filter((id): id is string => Boolean(id))),
  ];
  const actorNameMap = new Map<string, string>();
  if (uniqueActorIds.length > 0) {
    const actorRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, uniqueActorIds));
    for (const row of actorRows) actorNameMap.set(row.id, row.displayName);
  }

  const panelOutliersId = "gob-programa-outliers-titulo";
  const panelPiiId = "gob-programa-pii-titulo";
  const panelQualityId = "gob-programa-calidad-titulo";
  const panelQueueId = "gob-programa-cola-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      {header}

      {/* Filters row */}
      {filtersRow}

      {/* North-Star KPI strip */}
      <section
        aria-label="KPIs principales del programa"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <OpKpi
          label="Total registradas"
          value={registry.total > 0 ? registry.total.toLocaleString("es-AR") : "—"}
          sub="mascotas activas o extraviadas"
          href="/gob/padron?vista=censo"
          info={{
            definition: "Total de mascotas con status 'active' o 'lost' en tu jurisdicción.",
            formula: "COUNT(pets) WHERE status IN ('active','lost') AND scope",
          }}
          descriptorId="registry_total_pets"
        />
        <OpKpi
          label="Esterilización"
          value={sterilRatePct > 0 ? formatPercent(sterilRatePct) : "—"}
          tone={toneForTarget(sterilRatePct, TARGETS.STERILIZATION_COVERAGE_PCT)}
          sub={`meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`}
          href="/gob/padron?vista=poblacion"
          info={getKpiInfo("sterilization_coverage_population")}
          descriptorId="sterilization_coverage_population"
          // PO decision 2 item 2 — "faltan ~N cirugías sobre el padrón
          // registrado" (undefined when the target is already met).
          forecast={sterilResourceLine}
        />
        <OpKpi
          label="Microchip"
          value={chipRatePct > 0 ? formatPercent(chipRatePct) : "—"}
          tone={toneForTarget(chipRatePct, TARGETS.MICROCHIP_PENETRATION_PCT)}
          sub={`meta ${TARGETS.MICROCHIP_PENETRATION_PCT}%`}
          href="/gob/padron?vista=censo"
          info={getKpiInfo("microchip_penetration")}
          descriptorId="microchip_penetration"
          // Red-team 2026-07 #3: zero-denominator guard input (padrón size).
          guardInput={{ n: microchip.active }}
          forecast={chipResourceLine}
        />
        <OpKpi
          label="SLA ENO"
          value={enoSla.onTimePct !== null ? formatPercent(enoSla.onTimePct) : "—"}
          tone={enoSlaTone(enoSla)}
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} en breach activo de ${enoSla.total.toLocaleString("es-AR")}`
              : enoSla.total > 0
                ? `${enoSla.total.toLocaleString("es-AR")} notificaciones, sin breach activo`
                : "sin notificaciones en el período"
          }
          href="/gob/outbox"
          info={getKpiInfo("eno_sla_compliance")}
          descriptorId="eno_sla_compliance"
        />
        <OpKpi
          label="Aprobaciones — más vieja"
          value={queue.oldestPendingDaysAgo !== null ? `${queue.oldestPendingDaysAgo}d` : "—"}
          tone={
            queue.oldestPendingDaysAgo !== null
              ? queue.oldestPendingDaysAgo > 30
                ? "danger"
                : queue.oldestPendingDaysAgo > 14
                  ? "warn"
                  : "ok"
              : undefined
          }
          sub={`${queue.pendingTotal} ${pluralizeEs(queue.pendingTotal, "pendiente")} en tu jurisdicción`}
          href="/gob/cola"
          info={{
            definition:
              "Días de antigüedad de la solicitud pendiente más antigua en tu jurisdicción.",
            formula: "now() - min(created_at) WHERE status='pending' AND jurisdiction IN scope",
          }}
          descriptorId="queue_oldest_pending_days"
        />
        {/* Honesty fix (2026-07-22): this used to render outlierCount, a
            provincia×métrica COMBINATION count — routinely > 24, impossible
            for a KPI labeled Provincias en alerta when Argentina has ~24
            provinces. alertedProvinceCount is the DISTINCT-province count
            (≤ total provinces) that actually matches the label. */}
        <OpKpi
          label={KPI_CATALOG.alerted_provinces_below_target.label}
          value={alertedProvinceCount.toLocaleString("es-AR")}
          tone={alertedProvinceCount === 0 ? "ok" : alertedProvinceCount > 5 ? "danger" : "warn"}
          sub={
            // The count stays honest (unchanged); the ACTION is the ranking
            // below — "si todo está en peligro, nada está en peligro" unless
            // the operator can jump straight to WHICH one to fix first.
            <>
              provincias con ≥1 métrica bajo meta{" "}
              <a href={`#${panelOutliersId}`} className="text-ln-op-azul hover:underline">
                ver por impacto →
              </a>
            </>
          }
          info={{
            definition:
              "Número de provincias con al menos una métrica (esterilización, microchip, etc.) por debajo de la meta en tu jurisdicción.",
            formula: "COUNT(DISTINCT province) WHERE EXISTS métrica con rate < target AND scope",
          }}
          descriptorId="alerted_provinces_below_target"
        />
      </section>

      {/* Outliers table — relabeled "Tus provincias" since scope is already the govt's own.
          PO-interview decision 2, item 1: re-ranked by estimated real-world
          impact (gap×población), not province-count order — "cuál" importa
          más, no solo "cuántas". */}
      <OpCard aria-labelledby={panelOutliersId}>
        <OpCardHead
          title={<span id={panelOutliersId}>Tus provincias — cobertura vs meta</span>}
          actions={
            <span className="text-[11px] text-ln-op-mute">
              {outlierCount} de {outliers.length} combinaciones bajo meta
            </span>
          }
        />
        <OpCardBody>
          {outliers.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">Sin datos provinciales disponibles.</p>
          ) : (
            <div className="space-y-2">
              {topImpactSummary && (
                <p className="text-md font-medium text-ln-op-ink-2">
                  {/* Scope honesty (red-team 2026-07 #5): this summary is built
                      from the operator's FENCED assignment set, so the line must
                      say "tu cobertura", never "nacional" — the admin twin is the
                      only truly national caller. */}
                  {formatTopImpactLine(topImpactSummary, "mandate")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                  <caption className="sr-only">
                    Cobertura por provincia y métrica vs meta programática en tu jurisdicción,
                    ordenada por impacto estimado (mascotas sin cobertura). Filas marcadas en rojo
                    están por debajo de la meta.
                  </caption>
                  <thead>
                    <tr className="border-b border-ln-op-line">
                      <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                        Provincia
                      </th>
                      <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                        Métrica
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Cobertura
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Meta
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Brecha
                      </th>
                      <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                        Impacto
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayOutliers.map((row, i) => {
                      const drillHref = govtProvinceHref(row.province);
                      const impactLabel =
                        row.impact === undefined
                          ? "—"
                          : row.impact === null
                            ? NO_CENSUS_NOTE
                            : `~${formatImpactUnits(row.impact)} ${IMPACT_UNIT_LABEL[row.metric]}`;
                      return (
                        <tr
                          key={`${row.province}-${row.metric}-${i}`}
                          className={[
                            "border-b border-ln-op-line last:border-0",
                            row.isOutlier
                              ? "bg-ln-op-danger-bg/30"
                              : "hover:bg-ln-op-stripe/50 transition-colors",
                          ].join(" ")}
                          aria-label={`${row.province} — ${METRIC_LABEL[row.metric] ?? row.metric}: ${formatPercent(row.rate)} (meta ${row.target}%)${row.isOutlier ? ", bajo meta" : ""}. Impacto: ${impactLabel}`}
                        >
                          <td className="py-2 pr-4">
                            {drillHref ? (
                              <a
                                href={drillHref}
                                className="text-ln-op-azul underline-offset-2 hover:underline"
                              >
                                {row.province}
                              </a>
                            ) : (
                              row.province
                            )}
                          </td>
                          <td className="py-2 pr-4 text-ln-op-ink-2">
                            {METRIC_LABEL[row.metric] ?? row.metric}
                          </td>
                          <td
                            className={[
                              "py-2 pr-4 text-right tabular-nums font-medium",
                              row.isOutlier ? "text-ln-op-danger" : "text-ln-op-ok",
                            ].join(" ")}
                            aria-label={`Cobertura: ${formatPercent(row.rate)}`}
                          >
                            {formatPercent(row.rate)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-ln-op-mute">
                            {row.target}%
                          </td>
                          <td
                            className={[
                              "py-2 pr-4 text-right tabular-nums",
                              row.isOutlier ? "text-ln-op-danger" : "text-ln-op-mute",
                            ].join(" ")}
                          >
                            {row.gap > 0
                              ? `−${formatPercent(row.gap)}`
                              : row.gap < 0
                                ? `+${formatPercent(Math.abs(row.gap))}`
                                : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums text-ln-op-mute">
                            {impactLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* PII oversight — scoped to actors in the govt's jurisdiction */}
      <OpCard aria-labelledby={panelPiiId}>
        <OpCardHead title={<span id={panelPiiId}>Supervisión de PII — tu jurisdicción</span>} />
        <OpCardBody>
          {piiOversight.length === 0 ? (
            <p className="text-[13px] text-ln-op-mute">
              Sin consultas PII registradas en el período en tu jurisdicción.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Top actores por cantidad de consultas PII-sensibles en el período, restringido a
                  tu jurisdicción asignada.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Actor
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Acción
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Superficie
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Consultas
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Última
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {piiOversight.map((row) => (
                    <tr
                      key={`${row.actorUserId ?? "deleted"}-${row.action}-${row.surface ?? ""}`}
                      className="border-b border-ln-op-line last:border-0 hover:bg-ln-op-stripe/50 transition-colors"
                    >
                      <td className="py-2 pr-4 text-[13px] text-ln-op-ink-2">
                        {row.actorUserId
                          ? (actorNameMap.get(row.actorUserId) ?? "Operador desconocido")
                          : "Usuario eliminado"}
                      </td>
                      <td className="py-2 pr-4 text-ln-op-ink-2" title={row.action}>
                        {auditActionLabel(row.action)}
                      </td>
                      <td className="py-2 pr-4 text-ln-op-mute">
                        {row.surface ? (SURFACE_LABEL[row.surface] ?? row.surface) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium">
                        {row.count.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 text-right text-[11px] text-ln-op-mute">
                        {formatDateShort(row.lastAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Data quality scorecard */}
        <OpCard aria-labelledby={panelQualityId}>
          <OpCardHead title={<span id={panelQualityId}>Calidad de datos</span>} />
          <OpCardBody>
            {dataQuality.total === 0 ? (
              <p className="text-[13px] text-ln-op-mute">Sin mascotas activas en el padrón.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm text-ln-op-mute">Completitud</span>
                    <span
                      className={[
                        "text-[13px] font-semibold tabular-nums",
                        dataQuality.completenessPct >= 80
                          ? "text-ln-op-ok"
                          : dataQuality.completenessPct >= 60
                            ? "text-ln-op-warn"
                            : "text-ln-op-danger",
                      ].join(" ")}
                      aria-label={`Completitud: ${dataQuality.completenessPct}%`}
                    >
                      {dataQuality.completenessPct}%
                    </span>
                  </div>
                  <div
                    className="h-2 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                    role="presentation"
                  >
                    <div
                      className={[
                        "h-full rounded transition-all",
                        dataQuality.completenessPct >= 80
                          ? "bg-ln-op-ok"
                          : dataQuality.completenessPct >= 60
                            ? "bg-ln-op-warn"
                            : "bg-ln-op-danger",
                      ].join(" ")}
                      style={{ width: `${dataQuality.completenessPct}%` }}
                    />
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm" aria-label="Campos faltantes por categoría">
                  <li className="flex justify-between items-baseline">
                    <span className="text-ln-op-mute">Sin localidad</span>
                    <span className="tabular-nums text-ln-op-ink">
                      {dataQuality.missingLocality.toLocaleString("es-AR")}
                    </span>
                  </li>
                  <li className="flex justify-between items-baseline">
                    <span className="text-ln-op-mute">Sexo desconocido</span>
                    <span className="tabular-nums text-ln-op-ink">
                      {dataQuality.missingSex.toLocaleString("es-AR")}
                    </span>
                  </li>
                  <li className="flex justify-between items-baseline">
                    <span className="text-ln-op-mute">Sin microchip activo</span>
                    <span className="tabular-nums text-ln-op-ink">
                      {dataQuality.missingChip.toLocaleString("es-AR")}
                    </span>
                  </li>
                  <li className="flex justify-between items-baseline border-t border-ln-op-line pt-1.5">
                    <span className="text-ln-op-mute">Huérfanas (sin propietario)</span>
                    <span
                      className={[
                        "tabular-nums font-medium",
                        dataQuality.orphans > 0 ? "text-ln-op-warn" : "text-ln-op-ink",
                      ].join(" ")}
                    >
                      {dataQuality.orphans.toLocaleString("es-AR")}
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-ln-op-mute">
                  Completitud = mascotas sin ningún campo faltante (localidad + sexo + chip) ÷
                  total. Huérfanas: sin ninguna fila en ownerships.
                </p>
              </div>
            )}
          </OpCardBody>
        </OpCard>

        {/* Scoped queue aging — replaces global fetchQueueHealth */}
        <OpCard aria-labelledby={panelQueueId}>
          <OpCardHead title={<span id={panelQueueId}>Aprobaciones — tu jurisdicción</span>} />
          <OpCardBody>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">Pendientes</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.pendingTotal}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">Más vieja (días)</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.oldestPendingDaysAgo ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ln-op-mute">14d+ / 30d+ / 60d+</span>
                <span className="text-[13px] font-medium tabular-nums text-ln-op-ink">
                  {queue.pending14dPlus} / {queue.pending30dPlus} / {queue.pending60dPlus}
                </span>
              </div>
            </div>
          </OpCardBody>
        </OpCard>
      </div>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
