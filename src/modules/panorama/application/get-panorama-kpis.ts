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
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { TARGETS } from "@/lib/metrics/targets";

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
};

export type PanoramaKpis = {
  /** The headline KPIs in display order. */
  kpis: PanoramaKpi[];
  /**
   * Human scope+period cue shown next to the strip — communicates the KPIs are
   * recalculated for the active alcance/período (not a static national figure).
   */
  recalculatedFor: string;
};

/** es-AR integer formatting (thousands separator). */
function n(value: number): string {
  return value.toLocaleString("es-AR");
}

/** es-AR decimal: a dot becomes a comma (1 decimal figures from the fetchers). */
function dec(value: number): string {
  return value.toString().replace(".", ",");
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

  const [coverage, analytics, perdidas, bites, zoonosis, welfare, sterilization] =
    await Promise.all([
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
    ]);

  const kpis: PanoramaKpi[] = [
    {
      id: "cobertura",
      label: "Cobertura antirrábica",
      value: `${coverage.current}%`,
      sub: `meta ${coverage.target}% · ${coverage.partidos} ${
        coverage.partidos === 1 ? "partido" : "partidos"
      }`,
      bar: coverage.current,
      tone: coverage.current >= coverage.target ? "ok" : "warn",
      href: "/gob/analytics",
      source: "govt-home-kpis.fetchRabiesCoverage",
      info: {
        definition:
          "Porcentaje de perros activos en la jurisdicción con al menos una vacunación antirrábica registrada en los últimos 12 meses. Meta de salud pública: 80%.",
        formula:
          "COUNT DISTINCT perros con vaccination_administered (vaccine_name ~* 'antirr[áa]bica|rabies', últimos 12m) / COUNT DISTINCT perros activos",
        caveat:
          "Solo se cuentan vacunas registradas en MiMAR. La cobertura real puede ser mayor si existen campañas fuera del sistema.",
      },
    },
    {
      id: "mascotas",
      label: "Mascotas en cobertura",
      value: n(analytics.totalPets),
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
    {
      id: "perdidas",
      label: "Pérdidas activas",
      value: n(perdidas.activeCount),
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
      value: dec(bites.rate),
      sub: `${n(bites.reports)} ${bites.reports === 1 ? "reporte" : "reportes"}`,
      tone: "warn",
      href: "/gob/vigilancia",
      source: "govt-home-kpis.fetchBitesPer10k",
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
      value: n(zoonosis.count),
      sub: `${zoonosis.rabies} rabia · ${zoonosis.lepto} lepto · ${zoonosis.hidat} hidat.`,
      tone: zoonosis.count > 0 ? "danger" : "neutral",
      href: "/gob/vigilancia",
      source: "govt-home-kpis.fetchActiveZoonosis",
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
      value: n(welfare.count),
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
      id: "esterilizacion",
      label: "Cobertura de esterilización",
      value: `${sterilization.rate}%`,
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
          "Solo se cuentan esterilizaciones registradas en MiMAR. La cobertura real puede ser mayor si hay esterilizaciones fuera del sistema.",
      },
    },
  ];

  return {
    kpis,
    recalculatedFor: describeRecalc(actor, jurisdictions, adminProvince, adminLocality),
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
    return "Recalculado para el alcance nacional y el período seleccionado.";
  }
  const provinces = [...new Set(jurisdictions.map((j) => j.province))];
  const where = provinces.length === 1 ? provinces[0] : `${provinces.length} provincias`;
  return `Recalculado para ${where} y el período seleccionado.`;
}
