// Panorama application use-case: resolve the console's headline KPIs.
//
// SELLING POINT — DASHBOARD PARITY: every KPI here is computed by calling the
// SAME tested dashboard fetchers the equivalent /gob detail dashboards use, so
// the Panorama console can NEVER desync from the dashboards. This use-case does
// NOT re-derive a single metric with its own query; it only orchestrates the
// fetchers and shapes the result into a typed, tooltip-carrying payload.
//
// Each KPI carries:
//   - a formatted display `value` + an optional `sub` line,
//   - a `tone` for the OpKpi tile,
//   - an `info` tooltip ({definition, formula, caveat}) — IDENTICAL wording to
//     the /gob home tiles so the numbers AND their definitions match,
//   - the backing fetcher name (for traceability / tests).
//
// SCOPE + PERIOD: the (actor, jurisdictions, period) tuple is resolved at the
// auth boundary (the page / the /api/panorama/kpis route) and threaded down. A
// govt actor can NEVER widen scope — the fetchers intersect with assignments.
//
// VIEWPORT-BBOX NARROWING (spec nice-to-have): DEFERRED. Narrowing the KPI
// denominators to the current map viewport would require duplicating each
// metric's SQL with an extra bbox predicate, which would FORK the metric
// definition and break dashboard parity — the exact thing this use-case exists
// to prevent. Until the dashboard fetchers accept an optional bbox themselves,
// the KPIs are scope+period-aware (correct and demoable). See TODO below.
// TODO(panorama-bbox): thread an optional bbox into the shared fetchers
//   (lib/govt-home-kpis, lib/govt-dashboards) so the console and the dashboards
//   stay single-sourced, then surface it here without a forked query.

import {
  type AnalyticsPeriod,
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
} from "@/lib/metrics";
import { lastIngestAt } from "@/lib/metrics/freshness";
import { windows } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { TARGETS } from "@/lib/metrics/targets";

import { formatCount, formatPercent, formatRate } from "@/lib/utils/format";

import { fetchAnalyticsMetrics, fetchPerdidasMetrics } from "@/lib/analytics/govt-dashboards";
import {
  fetchActiveZoonosis,
  fetchBitesPer10k,
  fetchOpenWelfareReportsCount,
  fetchRabiesCoverage,
} from "@/lib/analytics/govt-home-kpis";

/** Tone passthrough to the OpKpi tile (kept loose to avoid a UI import here). */
export type KpiTone = "neutral" | "danger" | "warn" | "ok" | "blue";

/** The ⓘ tooltip payload the OpKpi tile renders. */
export type KpiInfo = {
  definition: string;
  formula?: string;
  caveat?: string;
};

/**
 * map-QOL: period-over-period comparison for a KPI. Only attached where the
 * underlying metric is genuinely window-sensitive (cobertura, mordeduras,
 * zoonosis) — state metrics (colas, stocks) get NO delta rather than a
 * misleading 0%.
 */
export type KpiDelta = {
  /** Rounded percent change vs the immediately-prior window of equal length. */
  pct: number;
  /** Direction, so the UI can pair the arrow glyph with the signed text. */
  direction: "up" | "down" | "flat";
  /** es-AR display/aria text, e.g. "+12% vs período anterior". */
  label: string;
};

/** One headline KPI, ready to feed an OpKpi tile. */
export type PanoramaKpi = {
  /** Stable id (used as a React key + a test handle). */
  id:
    | "cobertura"
    | "mascotas"
    | "perdidas"
    | "mordeduras"
    | "zoonosis"
    | "denuncias"
    | "esterilizacion";
  /** es-AR label. */
  label: string;
  /** Pre-formatted display value (es-AR number formatting applied here). */
  value: string;
  /** Optional secondary line (e.g. "meta 80% · 12 partidos"). */
  sub?: string;
  /** Optional progress-bar fill 0..100 (rabies coverage). */
  bar?: number;
  tone: KpiTone;
  /** ⓘ tooltip — copied verbatim from the equivalent /gob tile (parity). */
  info: KpiInfo;
  /** Link to the detail dashboard this KPI mirrors (drill-through). */
  href: string;
  /** The dashboard fetcher that produced this value (traceability / tests). */
  source: string;
  /** Period-over-period delta — only on window-sensitive KPIs (map-QOL). */
  delta?: KpiDelta;
};

export type PanoramaKpis = {
  /** The headline KPIs in display order. */
  kpis: PanoramaKpi[];
  /**
   * Human scope+period cue shown next to the strip — communicates the KPIs are
   * recalculated for the active alcance/período (not a static national figure).
   */
  recalculatedFor: string;
  /**
   * map-QOL freshness: ISO timestamp of the newest scoped ingest event
   * (lib/metrics/freshness.lastIngestAt), or null when the scope has no data.
   * Serialized as a string so the payload survives the /api/panorama/kpis
   * JSON round-trip unchanged.
   */
  dataAsOf: string | null;
};

/**
 * Thrown by getPanoramaKpis when one or more backing fetchers rejected — the
 * strip cannot be built with dashboard parity. Callers convert this into a
 * degraded-but-honest state (API → 503 envelope; page → degradedPanoramaKpis).
 * It is thrown only AFTER every fetcher has settled (Promise.allSettled), so it
 * never abandons an in-flight query.
 */
export class PanoramaKpisUnavailableError extends Error {
  constructor(readonly failedCount: number) {
    super(`panorama KPI fan-out failed (${failedCount} fetcher${failedCount === 1 ? "" : "s"})`);
    this.name = "PanoramaKpisUnavailableError";
  }
}

/**
 * es-AR degraded KPI payload — an EMPTY strip carrying an honest "no pudimos
 * cargar los indicadores, reintentá" cue in `recalculatedFor` (the field the
 * KpiStrip renders as its caption). Used as the withDbBudget fallback on the
 * page + API paths so a degraded DB renders a truthful empty state instead of
 * hanging the RSC stream forever. No tiles, no fabricated numbers.
 */
export function degradedPanoramaKpis(): PanoramaKpis {
  return {
    kpis: [],
    recalculatedFor:
      "No pudimos cargar los indicadores en este momento. Reintentá en unos segundos.",
    dataAsOf: null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window immediately BEFORE the active period, same length. Standard
 * preset lengths ride the named prior-window factories in lib/metrics/period
 * (trailing60d/14d/24m — the doubled window's front half IS the prior window);
 * custom lengths mirror the window backwards generically.
 */
function priorWindowOf(period: AnalyticsPeriod): { since: Date; until: Date } {
  const lengthMs = period.until.getTime() - period.since.getTime();
  const days = Math.round(lengthMs / DAY_MS);
  // The factories anchor at NOW — only equivalent when the active window is a
  // live trailing preset (until ≈ now). Historical/custom windows mirror
  // generically instead.
  const untilIsNow = Math.abs(Date.now() - period.until.getTime()) < DAY_MS;
  const doubled = untilIsNow
    ? days === 30
      ? windows.trailing60d()
      : days === 7
        ? windows.trailing14d()
        : days === 365
          ? windows.trailing24m()
          : null
    : null;
  if (doubled !== null) return { since: doubled.since, until: period.since };
  return { since: new Date(period.since.getTime() - lengthMs), until: period.since };
}

/**
 * Rounded percent change vs the prior value. Returns undefined when the prior
 * value is 0 or non-finite — no meaningful % base, better no delta than a lie.
 */
function deltaOf(current: number, prior: number): KpiDelta | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return undefined;
  const pct = Math.round(((current - prior) / prior) * 100);
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return {
    pct,
    direction,
    label: `${sign}${pct.toLocaleString("es-AR")}% vs período anterior`,
  };
}

/**
 * Resolve the console's headline KPIs for the active (actor, jurisdictions,
 * period). Reuses the tested dashboard fetchers so the numbers are IDENTICAL to
 * the detail dashboards. Never widens scope (the fetchers intersect with the
 * viewer's assignments). All fetchers run concurrently.
 *
 * `adminProvince` / `adminLocality` are ONLY for admin actors drilling into a
 * province via the Panorama JurisdictionSwitcher. Never pass them for govt actors
 * (their scope is enforced by filteredJurisdictions).
 */
export async function getPanoramaKpis(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: AnalyticsPeriod,
  adminProvince?: string,
  adminLocality?: string,
): Promise<PanoramaKpis> {
  // One ProjectionContext for the ctx-based fetchers. Thread adminProvince so
  // petsScopeClause / petEventsScopeClause narrow from global to the selected province.
  const ctx = buildProjectionContext(actor, jurisdictions, period, {
    adminProvince,
    adminLocality,
  });

  // map-QOL period-over-period: the SAME window-sensitive fetchers run once
  // more against the immediately-prior window (identical scope) so the deltas
  // are parity-true by construction. Only the 3 window-sensitive metrics get a
  // prior run — the state metrics (colas/stocks) would return the same value.
  const priorWindow = priorWindowOf(period);
  const priorCtx = buildProjectionContext(
    actor,
    jurisdictions,
    { ...period, since: priorWindow.since, until: priorWindow.until },
    { adminProvince, adminLocality },
  );

  // NEVER-CRASH FAN-OUT (task #74): use Promise.allSettled — NOT Promise.all.
  // Promise.all rejects on the FIRST fetcher failure and ABANDONS its siblings;
  // when a sibling later rejects (routine once the transaction pooler degrades
  // and queries error out) that rejection has no consumer and surfaces as an
  // unhandledRejection that crashes the lambda mid-response — the exact prod
  // incident. allSettled awaits EVERY fetcher to completion, so no promise is
  // ever abandoned. If any fetcher rejected we degrade the WHOLE strip (the
  // historical all-or-nothing parity contract) by throwing a typed error the
  // callers convert into a degraded-but-honest state — but only AFTER every
  // sibling has settled, so nothing dangles.
  const settled = await Promise.allSettled([
    // 1. Cobertura antirrábica — lib/govt-home-kpis.fetchRabiesCoverage (ctx).
    fetchRabiesCoverage(ctx),
    // 2. Mascotas en cobertura (totalPets) — lib/govt-dashboards.fetchAnalyticsMetrics.
    //    Non-ctx fetcher: thread adminProvince via opts so it applies explicit predicates.
    fetchAnalyticsMetrics(actor, jurisdictions, {
      since: period.since,
      adminProvince,
      adminLocality,
    }),
    // 3. Pérdidas activas — lib/govt-dashboards.fetchPerdidasMetrics (population metric).
    //    Non-ctx fetcher: thread adminProvince via opts.
    fetchPerdidasMetrics(actor, jurisdictions, { adminProvince, adminLocality }),
    // 4. Mordeduras / 10k hab. — lib/govt-home-kpis.fetchBitesPer10k (ctx).
    fetchBitesPer10k(ctx),
    // 5. Zoonosis activas — lib/govt-home-kpis.fetchActiveZoonosis (ctx).
    fetchActiveZoonosis(ctx),
    // 6. Denuncias activas — lib/govt-home-kpis.fetchOpenWelfareReportsCount (ctx).
    fetchOpenWelfareReportsCount(ctx),
    // 7. Cobertura de esterilización — lib/metrics/population-control.fetchSterilizationCoverage.
    // Same fetcher as /gob/poblacion → dashboard parity guaranteed.
    fetchSterilizationCoverage(ctx),
    // Prior-window runs (deltas) — same fetchers, prior ctx.
    fetchRabiesCoverage(priorCtx),
    fetchBitesPer10k(priorCtx),
    fetchActiveZoonosis(priorCtx),
    // Freshness: newest scoped ingest event (map-QOL freshness chip).
    lastIngestAt(ctx),
  ]);

  // Any fetcher rejected → the strip cannot be built with parity. Log every
  // failure and throw a typed error; callers degrade. (Every sibling has already
  // settled above, so this throw abandons nothing.)
  const rejections = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejections.length > 0) {
    for (const r of rejections) {
      console.error("[panorama-kpis] fetcher failed:", r.reason);
    }
    throw new PanoramaKpisUnavailableError(rejections.length);
  }

  // All fulfilled — narrow each settled result back to its fetcher's value type.
  const value = <T>(r: PromiseSettledResult<T>): T => (r as PromiseFulfilledResult<T>).value;
  const coverage = value(settled[0]);
  const analytics = value(settled[1]);
  const perdidas = value(settled[2]);
  const bites = value(settled[3]);
  const zoonosis = value(settled[4]);
  const welfare = value(settled[5]);
  const sterilization = value(settled[6]);
  const priorCoverage = value(settled[7]);
  const priorBites = value(settled[8]);
  const priorZoonosis = value(settled[9]);
  const ingestAt = value(settled[10]);

  // Display order (legal-analysis intake 2026-07-03, metric reorientation):
  // the two legally-grounded compliance coverages lead — antirrábica
  // (Ley 22.953, near-universal) and esterilización (mandated in 5 provinces)
  // are the flagship public-health KPIs; risk signals follow; the population
  // denominator ("mascotas en cobertura") closes the strip as context.
  const kpis: PanoramaKpi[] = [
    {
      id: "cobertura",
      label: "Cobertura antirrábica (perros, 12m)",
      value: formatPercent(coverage.current),
      sub: `meta ${coverage.target}% · ${coverage.partidos} ${
        coverage.partidos === 1 ? "partido" : "partidos"
      }`,
      bar: coverage.current,
      tone: coverage.current >= coverage.target ? "ok" : "warn",
      href: "/gob/analytics",
      source: "govt-home-kpis.fetchRabiesCoverage",
      delta: deltaOf(coverage.current, priorCoverage.current),
      info: {
        definition:
          "Porcentaje de perros activos en la jurisdicción con al menos una vacunación antirrábica registrada en los últimos 12 meses. Obligación legal: Ley 22.953 (vacunación antirrábica obligatoria, vigente en casi todas las jurisdicciones). Meta de salud pública: 80%.",
        formula:
          "COUNT DISTINCT perros con vaccination_administered (vaccine_name ~* 'antirr[áa]bica|rabies', últimos 12m) / COUNT DISTINCT perros activos",
        caveat:
          "Solo se cuentan vacunas registradas en MiMAR. La cobertura real puede ser mayor si existen campañas fuera del sistema.",
      },
    },
    {
      id: "esterilizacion",
      label: "Cobertura de esterilización",
      value: formatPercent(sterilization.rate),
      sub: `meta ${TARGETS.STERILIZATION_COVERAGE_PCT}%`,
      bar: sterilization.rate,
      tone: sterilization.rate >= TARGETS.STERILIZATION_COVERAGE_PCT ? "ok" : "warn",
      href: "/gob/poblacion",
      source: "metrics.fetchSterilizationCoverage",
      info: {
        definition:
          "Porcentaje de mascotas activas en la jurisdicción con al menos un evento sterilization_performed registrado. Meta programática: 70% (indicador de control poblacional).",
        formula:
          "COUNT DISTINCT mascotas con sterilization_performed / COUNT DISTINCT mascotas activas en alcance",
        caveat:
          "Obligatoria por ley provincial en Santa Fe, Mendoza, La Rioja, Chubut y San Juan; programática en el resto. Solo se cuentan esterilizaciones registradas en MiMAR.",
      },
    },
    {
      id: "perdidas",
      label: "Pérdidas activas",
      value: formatCount(perdidas.activeCount),
      sub:
        perdidas.avgDaysActive > 0
          ? `${perdidas.recoveredMonth} recuperadas (30d) · ${perdidas.avgDaysActive} d prom.`
          : `${perdidas.recoveredMonth} recuperadas (30d)`,
      tone: perdidas.activeCount > 0 ? "warn" : "neutral",
      href: "/gob/perdidas",
      source: "govt-dashboards.fetchPerdidasMetrics",
      info: {
        definition:
          "Mascotas actualmente en estado 'lost' en la jurisdicción. Incluye, como contexto, cuántas se recuperaron en los últimos 30 días y los días promedio que llevan perdidas.",
        formula: "COUNT(pets donde status='lost') en alcance",
        caveat:
          "activeCount es un estado actual (no depende del período). 'recuperadas' usa una ventana fija de 30 días.",
      },
    },
    {
      id: "mordeduras",
      label: "Mordeduras / 10k hab.",
      value: formatRate(bites.rate),
      sub: `${formatCount(bites.reports)} ${bites.reports === 1 ? "reporte" : "reportes"}`,
      tone: "warn",
      href: "/gob/vigilancia",
      source: "govt-home-kpis.fetchBitesPer10k",
      delta: deltaOf(bites.rate, priorBites.rate),
      info: {
        definition:
          "Tasa de incidentes de mordedura por cada 10.000 habitantes del censo provincial en los últimos 12 meses. Se usa como indicador de riesgo zoonótico (A6 proxy).",
        formula:
          "COUNT(incident_reported donde incident_type='bite_inflicted', últimos 12m) / (población_censo / 10.000)",
        caveat:
          "El denominador es población humana del censo (jurisdictions_census). Si la provincia no tiene fila de censo, la tasa se muestra como 0.",
      },
    },
    {
      id: "zoonosis",
      label: "Zoonosis activas",
      value: formatCount(zoonosis.count),
      sub: `${zoonosis.rabies} rabia · ${zoonosis.lepto} lepto · ${zoonosis.hidat} hidat.`,
      tone: zoonosis.count > 0 ? "danger" : "neutral",
      href: "/gob/vigilancia",
      source: "govt-home-kpis.fetchActiveZoonosis",
      delta: deltaOf(zoonosis.count, priorZoonosis.count),
      info: {
        definition:
          "Total de señales zoonóticas activas: mascotas con observación rábica en curso (status='in_progress') + casos bite_incident abiertos (deduplicados) + reportes de leptospirosis e hidatidosis en los últimos 30 días.",
        formula:
          "COUNT DISTINCT(pets en obs. rábica O en caso bite abierto) + COUNT(disease_reported='lepto', 30d) + COUNT(disease_reported='hidatidosis', 30d)",
      },
    },
    {
      id: "denuncias",
      label: "Denuncias activas",
      value: formatCount(welfare.count),
      sub: welfare.count === 1 ? "denuncia de bienestar" : "denuncias de bienestar",
      tone: welfare.count > 0 ? "warn" : "neutral",
      href: "/gob/maltrato",
      source: "govt-home-kpis.fetchOpenWelfareReportsCount",
      info: {
        definition:
          "Denuncias de bienestar animal con estado no terminal (ni 'closed' ni 'duplicate') en la jurisdicción. Es la cola de trabajo de la bandeja de maltrato.",
        formula: "COUNT(welfare_reports donde status NOT IN ('closed', 'duplicate')) en alcance",
        caveat:
          "La ubicación en el mapa es aproximada (centroide de localidad); el conteo refleja el alcance, no el recuadro visible.",
      },
    },
    {
      id: "mascotas",
      label: "Mascotas en cobertura",
      value: formatCount(analytics.totalPets),
      sub: "activas o perdidas",
      tone: "blue",
      href: "/gob/analytics",
      source: "govt-dashboards.fetchAnalyticsMetrics",
      info: {
        definition:
          "Total de mascotas con estado 'active' o 'lost' en la jurisdicción seleccionada. Es el denominador de las tasas de cobertura.",
        formula: "COUNT(pets donde status IN ('active', 'lost')) en alcance",
        caveat: "Excluye mascotas fallecidas (status='deceased').",
      },
    },
  ];

  return {
    kpis,
    recalculatedFor: describeRecalc(actor, jurisdictions, adminProvince, adminLocality),
    dataAsOf: ingestAt?.toISOString() ?? null,
  };
}

/** es-AR cue describing the alcance the KPIs were recalculated for. */
function describeRecalc(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): string {
  if (actor.role === "admin") {
    if (adminLocality) {
      return `Recalculado para ${adminLocality}, ${adminProvince} y el período seleccionado.`;
    }
    if (adminProvince) {
      return `Recalculado para ${adminProvince} y el período seleccionado.`;
    }
    return "Recalculado para el alcance nacional y el período seleccionado.";
  }
  if (jurisdictions.length === 0) {
    // NON-admin with zero jurisdictions in scope. This is NOT national reach —
    // "alcance nacional" is reserved for the admin branch above. An empty set
    // here means either the operator selected a province OUTSIDE their scope
    // (narrowGovtScope filtered it to []) or they hold no assignment; in both
    // cases the data is correctly empty. Say so honestly instead of implying a
    // national recompute (QA histórico 2026-07-08 #81: the footer lied).
    return "Sin datos en tu alcance para el período seleccionado.";
  }
  const provinces = [...new Set(jurisdictions.map((j) => j.province))];
  const where = provinces.length === 1 ? provinces[0] : `${provinces.length} provincias`;
  return `Recalculado para ${where} y el período seleccionado.`;
}
