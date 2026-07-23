// /admin/inteligencia — Inteligencia operativa territorial (Task #44).
//
// Three aggregate/territorial intelligence surfaces, all derived from existing
// parity-guaranteed metric fetchers (one-truth-per-KPI):
//
//   1. Índice territorial compuesto — per-province composite of the three
//      programme coverages vs their targets (lib/analytics/territorial-index.ts).
//   2. Política → resultado — rule changes (audit_log) correlated with the
//      movement of a mapped aggregate metric in the same jurisdiction
//      (lib/analytics/policy-outcome.ts).
//   3. Calidad de datos por provincia — completeness/reconciliation score,
//      including ghost-record counts (lib/analytics/territorial-data-quality.ts).
//
// RED LINE (Ley 25.326 / habeas data): every number on this page is an
// aggregate over a TERRITORY or a RECORD-level reconciliation count. There is
// no individual-level scoring of citizens anywhere in this pipeline, and none
// may be added. k=5 suppression is applied or inherited on all three surfaces.

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpFilterBar, OpKpi } from "@/components/ui/dashboard";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { analyticsRetryHref, loadWithTimeout } from "@/lib/analytics/analytics-load";
import { DEFAULT_DASHBOARD_PRESET } from "@/lib/analytics/analytics-period";
import {
  POLICY_OUTCOME_WINDOW_DAYS,
  type PolicyOutcomeRow,
  fetchPolicyOutcomes,
} from "@/lib/analytics/policy-outcome";
import {
  DATA_QUALITY_K_ANON,
  type ProvinceDataQualityRow,
  fetchProvinceDataQuality,
} from "@/lib/analytics/territorial-data-quality";
import { computeJurisdictionIndex } from "@/lib/analytics/territorial-index";
import { RULE_TYPE_REGISTRY } from "@/lib/domain/rule-types-registry";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import {
  NO_CENSUS_NOTE,
  TARGETS,
  buildProjectionContext,
  fetchCrossJurisdictionOutliers,
  formatImpactUnits,
  totalImpactByJurisdiction,
} from "@/lib/metrics";
import { estimateDogPopulation, getCensusPopulationsCached } from "@/lib/metrics/census";
import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";
import { windows } from "@/lib/metrics/period";
import { formatDateShort } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Small presentational helpers (server-rendered, Op-skin)
// ---------------------------------------------------------------------------

/** Track + fill bar with the numeric value beside it (never color-alone). */
function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-[80px] h-2 rounded bg-ln-op-stripe overflow-hidden">
        <div
          className="h-full rounded bg-ln-op-azul"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[var(--text-md)] tabular-nums text-ln-op-ink">
        {value}
      </span>
    </div>
  );
}

/** Signed delta with arrow glyph + sr-only direction (WCAG 1.4.1). */
function DeltaCell({ row }: { row: PolicyOutcomeRow }) {
  if (row.suppressed) {
    return <span className="text-ln-op-mute">&lt;5 (privacidad)</span>;
  }
  if (row.deltaPct === null) {
    return <span className="text-ln-op-mute">sin línea de base</span>;
  }
  const up = row.deltaPct >= 0;
  return (
    <span
      className={[
        "font-semibold tabular-nums",
        up ? "text-[var(--color-st-ok)]" : "text-[var(--color-st-err)]",
      ].join(" ")}
    >
      <span aria-hidden="true">{up ? "↑" : "↓"} </span>
      <span className="sr-only">{up ? "Sube:" : "Baja:"} </span>
      {up ? "+" : ""}
      {row.deltaPct}%
    </span>
  );
}

function ruleScopeLabel(row: PolicyOutcomeRow): string {
  if (!row.province) return "Nacional";
  return row.locality ? `${row.province} · ${row.locality}` : row.province;
}

const ACTION_LABELS: Record<PolicyOutcomeRow["action"], string> = {
  govt_business_rule_created: "creada",
  govt_business_rule_updated: "modificada",
  govt_business_rule_deleted: "eliminada",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminInteligenciaPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string; ordenar?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = searchParams ? await searchParams : {};
  const { resolveAnalyticsPeriod } = await import("@/lib/metrics/period");
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();

  const ctx = buildProjectionContext({ role: "admin" }, [], period);

  const header = (
    <ScreenHeader
      className="space-y-2"
      eyebrow="Admin · Inteligencia territorial"
      title="Inteligencia operativa"
      subtitle={
        <p className="text-[var(--text-md)] text-ln-op-mute">
          Índice compuesto por jurisdicción, correlación regla→métrica y calidad de datos. Señales
          agregadas por territorio — sin puntuación de personas.
        </p>
      }
    />
  );

  // getCensusPopulationsCached is a process-lifetime cache (lib/metrics/
  // census.ts) — ZERO new fan-out after the first render.
  const load = await loadWithTimeout(
    Promise.all([
      fetchCrossJurisdictionOutliers(ctx),
      fetchPolicyOutcomes(),
      fetchProvinceDataQuality(ctx),
      getCensusPopulationsCached(),
    ]),
  );

  if (!load.ok) {
    return (
      <div className="space-y-6">
        {header}
        <AnalyticsLoadFallback
          reason={load.reason}
          retryHref={analyticsRetryHref("/admin/inteligencia", sp)}
        />
      </div>
    );
  }

  const [outlierRows, policyRows, quality, censusPopulations] = load.value;
  const indexRows = computeJurisdictionIndex(outlierRows);

  // PO-interview decision 2, item 1 — same gap×población lens as /gob/programa
  // + /admin/programa, applied to the territorial index's own composite: a
  // second sort so "which province matters most" is answerable here too,
  // without displacing the index's own score-based ranking as the default.
  const impactTotals = totalImpactByJurisdiction(
    outlierRows.map((row) => ({
      ...row,
      jurisdiction: row.province,
      coverage: row.rate,
      population: estimateDogPopulation(censusPopulations[row.province] ?? 0),
    })),
  );
  const impactByProvince = new Map<string, number | null>(
    impactTotals.map((t) => [t.jurisdiction, t.impact]),
  );
  // Map.get() already returns `undefined` for a province with no gap at all
  // (never registered in impactTotals) — NEVER collapse that into the SAME
  // `null` totalImpactByJurisdiction uses for "gap exists, no census row".
  // Those are two different honest states (see the table's legend below).
  const indexRowsWithImpact = indexRows.map((row) => ({
    ...row,
    impact: impactByProvince.get(row.province),
  }));
  const sortByImpact = sp.ordenar === "impacto";
  // Impact-sorted view: known-impact rows desc, then unknown (no census/no
  // gap) rows at the end, alphabetically — same guard posture as
  // lib/metrics/impact-ranking.ts's rankByImpact, applied here to a list that
  // ALREADY carries a score/rank from computeJurisdictionIndex (never
  // recomputed, only re-ordered).
  const displayIndexRows = sortByImpact
    ? [...indexRowsWithImpact].sort((a, b) => {
        if (a.impact === b.impact) return a.province.localeCompare(b.province, "es");
        if (a.impact === undefined || a.impact === null) return 1;
        if (b.impact === undefined || b.impact === null) return -1;
        return b.impact - a.impact;
      })
    : indexRowsWithImpact;

  // Preserves the active period filter across the sort toggle — switching
  // "índice"/"impacto" must never silently reset the period the operator
  // already picked.
  function sortHref(mode: "indice" | "impacto"): string {
    const params = new URLSearchParams();
    if (sp.period) params.set("period", sp.period);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (mode === "impacto") params.set("ordenar", "impacto");
    const qs = params.toString();
    return qs ? `/admin/inteligencia?${qs}` : "/admin/inteligencia";
  }

  const nationalAvg =
    indexRows.length > 0
      ? Math.round(indexRows.reduce((sum, r) => sum + r.score, 0) / indexRows.length)
      : null;
  const totalGhosts = quality.rows.reduce((sum, r) => sum + r.ghosts, 0);
  const totalRecords = quality.rows.reduce((sum, r) => sum + r.total, 0);
  const ghostPct = totalRecords > 0 ? Math.round((totalGhosts / totalRecords) * 1000) / 10 : 0;

  // The KPI totals sum only quality.rows, which fetchProvinceDataQuality has
  // already stripped of k<5-suppressed provinces and null-province records. The
  // quality table below (Calidad de datos) discloses that exclusion; the KPI must
  // say the same thing so the headline count and the table cannot silently
  // disagree (C2 / C3). Build the same exclusion clause the table renders.
  const ghostExclusionNote =
    quality.suppressedProvinces > 0 || quality.unassigned > 0
      ? ` No incluye ${
          quality.suppressedProvinces > 0
            ? `${quality.suppressedProvinces} ${
                quality.suppressedProvinces === 1 ? "provincia oculta" : "provincias ocultas"
              } por k<${DATA_QUALITY_K_ANON}`
            : ""
        }${quality.suppressedProvinces > 0 && quality.unassigned > 0 ? " ni " : ""}${
          quality.unassigned > 0
            ? `${quality.unassigned.toLocaleString("es-AR")} registros sin provincia asignada`
            : ""
        } — cuenta solo el padrón evaluado, igual que la tabla de calidad.`
      : "";

  const panelIndexId = "intel-panel-indice-titulo";
  const panelPolicyId = "intel-panel-politica-titulo";
  const panelQualityId = "intel-panel-calidad-titulo";

  return (
    <div className="space-y-6">
      {header}

      {/* Unified filter bar — period only (F-migration 2026-07-21, off the
          bare <PeriodPicker>), same bar chrome as every other operator
          dashboard. No domain axes: every number here is already a
          territorial aggregate, not a filterable per-row list. */}
      <OpFilterBar period={{ defaultPreset: DEFAULT_DASHBOARD_PRESET }} />

      {/* KPI row */}
      <section
        aria-label="Indicadores de inteligencia territorial"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Provincias evaluadas"
          value={indexRows.length > 0 ? indexRows.length : "—"}
          sub="con población suficiente (k≥5)"
          info={{
            definition:
              "Provincias con al menos 5 mascotas activas — las menores se omiten por privacidad (k-anonimato).",
          }}
          descriptorId="territorial_index_provinces_evaluated"
        />
        <OpKpi
          label="Índice promedio"
          value={nationalAvg ?? "—"}
          sub="promedio simple entre provincias evaluadas"
          info={{
            definition:
              "Promedio del índice territorial compuesto: cumplimiento de metas de cobertura antirrábica, esterilización y chip, con pesos iguales.",
            formula: "score = mean(min(100, tasa/meta×100))",
          }}
          descriptorId="territorial_index_average_score"
        />
        <OpKpi
          label="Cambios de reglas"
          value={policyRows.length > 0 ? policyRows.length : "—"}
          sub={`analizados · ventana ±${POLICY_OUTCOME_WINDOW_DAYS} días`}
          info={{
            definition:
              "Mutaciones recientes de reglas jurisdiccionales (audit log) correlacionadas con la métrica agregada que gobiernan.",
            caveat: "Correlación temporal, no atribución causal.",
          }}
          descriptorId="policy_outcome_rule_changes_analyzed"
        />
        <OpKpi
          label={KPI_CATALOG.ghost_records_count.label}
          value={totalGhosts > 0 ? totalGhosts.toLocaleString("es-AR") : "0"}
          sub={`${ghostPct}% del padrón evaluado · sin titular ni actividad`}
          tone={ghostPct > 20 ? "danger" : ghostPct > 10 ? "warn" : undefined}
          info={{
            definition:
              "Registros activos sin ningún titular asociado y sin actividad del propietario en 12 meses — candidatos a conciliación de datos.",
            caveat: `Señal a nivel registro (conciliación), nunca puntuación de personas.${ghostExclusionNote}`,
          }}
          descriptorId="ghost_records_count"
        />
      </section>

      {/* 1. Índice territorial compuesto */}
      <OpCard aria-labelledby={panelIndexId}>
        <OpCardHead
          title={<span id={panelIndexId}>Índice territorial compuesto</span>}
          actions={
            // PO-interview decision 2, item 1 — second sort: the composite
            // score answers "¿cómo cumple esta jurisdicción sus metas?"; the
            // impact sort answers "¿cuál mueve más el gap nacional si mejora?"
            // — two different, both honest, questions over the SAME rows.
            <span className="flex items-center gap-2 text-[var(--text-sm)] text-ln-op-mute">
              Ordenar por
              <a
                href={sortHref("indice")}
                aria-current={sortByImpact ? undefined : "true"}
                className={
                  sortByImpact ? "text-ln-op-azul hover:underline" : "font-semibold text-ln-op-ink"
                }
              >
                índice
              </a>
              ·
              <a
                href={sortHref("impacto")}
                aria-current={sortByImpact ? "true" : undefined}
                className={
                  sortByImpact ? "font-semibold text-ln-op-ink" : "text-ln-op-azul hover:underline"
                }
              >
                impacto
              </a>
            </span>
          }
        />
        <OpCardBody>
          {displayIndexRows.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos suficientes"
              description="Sin provincias con población suficiente para calcular el índice."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--text-md)] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Ranking de provincias por {sortByImpact ? "impacto estimado" : "índice compuesto"}{" "}
                  de cumplimiento de metas, de mayor a menor.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th
                      scope="col"
                      className="text-left py-2 pr-2 font-semibold text-ln-op-mute w-8"
                    >
                      #
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Provincia
                    </th>
                    <th
                      scope="col"
                      className="text-left py-2 pr-4 font-semibold text-ln-op-mute min-w-[140px]"
                    >
                      Índice
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Antirrábica
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Esterilización
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Chip
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Impacto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayIndexRows.map((row, i) => (
                    <tr key={row.province} className="border-b border-ln-op-line last:border-0">
                      <td className="py-2 pr-2 tabular-nums text-ln-op-mute">
                        {sortByImpact ? i + 1 : row.rank}
                      </td>
                      <td className="py-2 pr-4">
                        {row.province}
                        {row.componentsUsed < 3 && (
                          <span
                            className="text-ln-op-mute"
                            title="Índice parcial: componente antirrábica omitida por k-anonimato"
                          >
                            {" "}
                            *
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <ScoreBar value={row.score} />
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.components.rabies ? `${row.components.rabies.rate}%` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.components.sterilization
                          ? `${row.components.sterilization.rate}%`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.components.microchip ? `${row.components.microchip.rate}%` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ln-op-mute">
                        {row.impact === undefined
                          ? "—"
                          : row.impact === null
                            ? NO_CENSUS_NOTE
                            : `~${formatImpactUnits(row.impact)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ln-op-mute">
                Impacto = estimación de mascotas sin cobertura (gap × población canina estimada),
                sumada entre las tres métricas de la provincia. «{NO_CENSUS_NOTE}» = sin fila de
                censo INDEC para esa provincia; — = provincia sin brecha (cumple las tres metas).
                Índice = promedio con pesos iguales del cumplimiento de metas: antirrábica (
                {TARGETS.RABIES_COVERAGE_PCT}%), esterilización (
                {TARGETS.STERILIZATION_COVERAGE_PCT}
                %) y chip ({TARGETS.MICROCHIP_PENETRATION_PCT}%). * = índice parcial (2 de 3
                componentes; antirrábica omitida cuando hay menos de 5 perros). Provincias con menos
                de 5 mascotas no se listan (privacidad).
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* 2. Política → resultado */}
      <OpCard aria-labelledby={panelPolicyId}>
        <OpCardHead
          title={<span id={panelPolicyId}>Política → resultado</span>}
          actions={
            <span className="text-xs text-ln-op-mute">
              Ventana fija ±{POLICY_OUTCOME_WINDOW_DAYS}d — no usa el período elegido arriba
            </span>
          }
        />
        <OpCardBody>
          {policyRows.length === 0 ? (
            <LnEmptyState
              icon="disputa"
              title="Sin cambios de reglas"
              description="Sin cambios de reglas registrados en el audit log todavía."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--text-md)] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Cambios recientes de reglas jurisdiccionales y el movimiento de la métrica
                  agregada asociada antes y después del cambio.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Fecha
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Regla
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Alcance
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Métrica observada
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Antes
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Después
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Δ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policyRows.map((row) => (
                    <tr key={row.auditId} className="border-b border-ln-op-line last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                        {formatDateShort(row.changedAt)}
                      </td>
                      <td className="py-2 pr-4">
                        {RULE_TYPE_REGISTRY[row.ruleType].label}{" "}
                        <span className="text-ln-op-mute">({ACTION_LABELS[row.action]})</span>
                      </td>
                      <td className="py-2 pr-4">{ruleScopeLabel(row)}</td>
                      <td className="py-2 pr-4">
                        {row.metricLabel}
                        {row.partialAfter && (
                          <span className="text-ln-op-mute">
                            {" "}
                            · ventana parcial ({row.afterDaysCovered} días)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.suppressed ? "<5" : row.before.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.suppressed ? "<5" : row.after.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 text-right">
                        <DeltaCell row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ln-op-mute">
                Conteo de eventos agregados en la jurisdicción de la regla,{" "}
                {POLICY_OUTCOME_WINDOW_DAYS} días antes y después del cambio. Correlación temporal —
                no implica causalidad. Pares con ambas ventanas &lt;5 se enmascaran (privacidad). El
                selector de período de arriba no afecta esta tabla: la ventana de ±
                {POLICY_OUTCOME_WINDOW_DAYS} días es fija y se ancla a la fecha de cada cambio de
                regla, porque cada regla necesita su propio antes/después.
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* 3. Calidad de datos por provincia */}
      <OpCard aria-labelledby={panelQualityId}>
        <OpCardHead title={<span id={panelQualityId}>Calidad de datos por provincia</span>} />
        <OpCardBody>
          {quality.rows.length === 0 ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin datos suficientes"
              description="Sin provincias con población suficiente para el puntaje de calidad."
            />
          ) : (
            <div className="overflow-x-auto">
              {/* Ola 4 / decision-density audit (2026-07-21): this table had 9
                  columns — the densest in the portal. Rank + score + the one
                  ready-to-act signal (Fantasma, also the headline KPI above)
                  stay visible; the other 5 completeness-diagnostic columns
                  (localidad/chip/titular/inactivas/chips reemplazados) move
                  behind a disclosure — still fully honest/reachable, just not
                  co-equal with the decision-relevant columns by default. */}
              <table className="w-full text-[var(--text-md)] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Ranking de provincias por puntaje de calidad de datos, con la señal de registros
                  fantasma.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th
                      scope="col"
                      className="text-left py-2 pr-2 font-semibold text-ln-op-mute w-8"
                    >
                      #
                    </th>
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Provincia
                    </th>
                    <th
                      scope="col"
                      className="text-left py-2 pr-4 font-semibold text-ln-op-mute min-w-[140px]"
                    >
                      Puntaje
                    </th>
                    <th scope="col" className="text-right py-2 pr-4 font-semibold text-ln-op-mute">
                      Registros
                    </th>
                    <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                      Fantasma
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quality.rows.map((row: ProvinceDataQualityRow) => (
                    <tr key={row.province} className="border-b border-ln-op-line last:border-0">
                      <td className="py-2 pr-2 tabular-nums text-ln-op-mute">{row.rank}</td>
                      <td className="py-2 pr-4">{row.province}</td>
                      <td className="py-2 pr-4">
                        <ScoreBar value={row.score} />
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.total.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.ghosts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ln-op-mute">
                Puntaje = promedio con pesos iguales de cinco señales de completitud (localidad,
                sexo, chip, titularidad, actividad). Fantasma = sin titular y sin actividad en 12
                meses (conciliación de registros).
                {quality.suppressedProvinces > 0 && (
                  <>
                    {" "}
                    {quality.suppressedProvinces}{" "}
                    {quality.suppressedProvinces === 1 ? "provincia oculta" : "provincias ocultas"}{" "}
                    por k&lt;{DATA_QUALITY_K_ANON} (privacidad).
                  </>
                )}
                {quality.unassigned > 0 && (
                  <>
                    {" "}
                    {quality.unassigned.toLocaleString("es-AR")} registros sin provincia asignada no
                    aparecen en la tabla.
                  </>
                )}
              </p>

              <details className="group mt-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-ln-op-ink-2 hover:text-ln-op-ink">
                  Ver desglose completo de completitud (localidad, chip, titular, inactivas, chips
                  reemplazados)
                </summary>
                <table className="mt-2 w-full text-[var(--text-md)] text-ln-op-ink border-collapse">
                  <caption className="sr-only">
                    Desglose de completitud por provincia: registros sin localidad, sin chip, sin
                    titular, inactivos y chips reemplazados.
                  </caption>
                  <thead>
                    <tr className="border-b border-ln-op-line">
                      <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                        Provincia
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Sin localidad
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Sin chip
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Sin titular
                      </th>
                      <th
                        scope="col"
                        className="text-right py-2 pr-4 font-semibold text-ln-op-mute"
                      >
                        Inactivas
                      </th>
                      <th scope="col" className="text-right py-2 font-semibold text-ln-op-mute">
                        Chips reemplaz.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quality.rows.map((row: ProvinceDataQualityRow) => (
                      <tr key={row.province} className="border-b border-ln-op-line last:border-0">
                        <td className="py-2 pr-4">{row.province}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.missingLocality}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.missingChip}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.orphans}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.dormant}</td>
                        <td className="py-2 text-right tabular-nums">{row.replacedChips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      <p className="text-xs text-ln-op-mute">
        Todas las señales de esta página son agregados territoriales o marcas de conciliación a
        nivel registro. No existe puntuación algorítmica de personas (Ley 25.326).
      </p>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
