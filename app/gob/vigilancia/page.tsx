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
import { resolveAnalyticsPeriod } from "@/lib/analytics-period";
import { listLocalitiesByProvince, localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { findDisease } from "@/lib/diseases";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
  computeDiseaseSummary,
  fetchCasesPerLocality,
  fetchCasesPerSubregion,
  fetchSurveillanceSignals,
  fetchVigilanciaMetrics,
  fetchZoonosisTrend,
} from "@/lib/govt-dashboards";
import { buildProjectionContext } from "@/lib/metrics";
import { fetchSurveillanceCompliance } from "@/lib/surveillance-metrics";
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
  const period = resolveAnalyticsPeriod(sp);
  const { since } = period;

  // Resolve selected province ISO code (e.g. "AR-B") → ProvinceCode + canonical name.
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  // Fetch localities for the selected province to populate <JurisdictionSwitcher>.
  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  // Resolve locality slug → Locality row so we can get the canonical localityName
  // that the data fetchers compare against jurisdictionLocality columns.
  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  // Narrow the jurisdictions array passed to data fetchers when a province and/or
  // locality filter is active. Fetchers accept DashboardJurisdiction[] where
  // province = canonical display name, locality = locality name (not slug).
  // Admin's empty [] means "universal scope" — we leave it unchanged for admin
  // because the scope clauses short-circuit on actor.role === "admin".
  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      // Province + locality: intersect with the user's actual assignments so a
      // govt user cannot widen scope by crafting arbitrary ?province=&locality= params.
      // govtAssignments.jurisdictionLocality is NOT NULL (schema-enforced), so exact
      // match is correct — no null-locality province-level rows exist.
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      // Province only: keep the govt's assignments that belong to that province.
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

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

  const [metrics, signals30d, mapData, trend, signalsPeriod, subregionData, compliance] =
    await Promise.all([
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
    ]);

  const signals = signalsPeriod ?? signals30d;
  const summary = computeDiseaseSummary(signals30d);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Build allowedProvinces for <JurisdictionSwitcher>.
  // Admin: full list. Govt: derive unique province codes from assigned jurisdictions.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Shape map data into ChoroplethRegionDatum format (aggregate by province code).
  const codeToCount = new Map<string, number>();
  for (const row of mapData) {
    if (!row.code) continue;
    codeToCount.set(row.code, (codeToCount.get(row.code) ?? 0) + row.count);
  }
  const provinceChoroplethData = Array.from(codeToCount.entries()).map(([code, value]) => ({
    code,
    value,
    label: `${value} caso${value !== 1 ? "s" : ""} abierto${value !== 1 ? "s" : ""}`,
  }));

  // When a province is drilled into, build the sub-region choropleth.
  //
  // fetchCasesPerSubregion now returns the FULL sub-region set for the province
  // (every department / every barrio, with 0-default counts). So:
  //   - visibleCodes = every sub-region code → MapChoropleth filters the national
  //     GeoJSON to ONLY those polygons and frames the viewport to that province.
  //   - data = only sub-regions WITH cases (count > 0) → 0-case sub-regions fall
  //     through to the missing-color (grey) branch instead of the lightest scale
  //     color, so "no cases" reads as grey, not "few cases".
  let choroplethData = provinceChoroplethData;
  let mapGeojsonUrl: string | undefined = undefined;
  let mapVisibleCodes: string[] | undefined = undefined;
  let mapCardTitle = "Casos abiertos por jurisdicción";

  if (selectedProvinceIso && subregionData !== null) {
    mapVisibleCodes = subregionData.map((r) => r.code);
    choroplethData = subregionData
      .filter((r) => r.count > 0)
      .map((r) => ({
        code: r.code,
        value: r.count,
        label: `${r.name}: ${r.count} caso${r.count !== 1 ? "s" : ""}`,
      }));
    if (selectedProvinceIso === "AR-C") {
      mapGeojsonUrl = "/geo/caba-barrios.geojson";
      mapCardTitle = "Casos abiertos por barrio — CABA";
    } else {
      mapGeojsonUrl = "/geo/ar-departments.geojson";
      mapCardTitle = `Casos abiertos por departamento — ${selectedProvinceObj?.name ?? ""}`;
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
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia epidemiológica
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mapa de vigilancia</h1>
        <p className="text-[13px] text-ln-op-mute">
          Señales de zoonosis y enfermedades reportables detectadas en tu cobertura.
        </p>
      </header>

      {/* No-scope warning */}
      {noScope && (
        <OpCallout
          title="Sin localidades asignadas"
          body="Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos una."
          icon="⚠"
        />
      )}

      {/* Quick-access CTAs: zoonosis + investigaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/gob/vigilancia/zoonosis"
          className="flex items-center gap-3 rounded-[6px] border border-ln-op-line bg-ln-op-card px-4 py-3 no-underline transition-colors hover:bg-ln-op-stripe"
        >
          <span className="text-[22px]" aria-hidden="true">
            🦠
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ln-op-ink">Zoonosis</p>
            <p className="text-[11px] text-ln-op-mute">Enfermedades transmisibles activas</p>
          </div>
        </Link>
        <Link
          href="/gob/vigilancia/investigaciones"
          className="flex items-center gap-3 rounded-[6px] border border-ln-op-line bg-ln-op-card px-4 py-3 no-underline transition-colors hover:bg-ln-op-stripe"
        >
          <span className="text-[22px]" aria-hidden="true">
            🔬
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ln-op-ink">Investigaciones</p>
            <p className="text-[11px] text-ln-op-mute">Casos bajo investigación activa</p>
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
          href="/gob/vigilancia/brotes"
        />
        <OpKpi
          label="Rábicas activas"
          value={String(metrics.rabiesActiveCount)}
          tone={metrics.rabiesActiveCount > 0 ? "danger" : "neutral"}
          href="/gob/vigilancia/zoonosis"
        />
        <OpKpi label="Pets hoy" value={String(metrics.petsRegisteredToday)} />
        <OpKpi label="Vacunaciones (7d)" value={String(metrics.vaccinationsThisWeek)} tone="ok" />
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
          sub={
            enoSla.breachedOpen > 0
              ? `${enoSla.breachedOpen} fuera de SLA`
              : enoSla.medianLatencyHours !== null
                ? `Mediana ${enoSla.medianLatencyHours} h`
                : "Sin entregas en el período"
          }
          info={{
            definition:
              "Porcentaje de notificaciones ENO (Enfermedades de Notificación Obligatoria) entregadas dentro de su SLA (A7). Mide la cola interna del outbox, no la entrega externa a la autoridad.",
            formula:
              "outbox rows (target_kind='eno_authority') con delivered_at ≤ sla_due_at / total delivered en período",
            caveat:
              "Filas en estado 'pending' con sla_due_at < ahora se cuentan como incumplimiento vivo (breachedOpen).",
          }}
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
            <Link href="/admin/observaciones" className="underline">
              Ver observaciones →
            </Link>
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
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
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
            title={<span id={panelEnoId}>Notificación ENO (SLA del outbox)</span>}
            actions={
              <Link
                href="/admin/outbox"
                className="text-[12px] text-ln-op-azul hover:underline no-underline"
              >
                Ver outbox →
              </Link>
            }
          />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
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
            <p className="mt-3 text-[11px] text-ln-op-mute">
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
              <span className="text-[12px] text-ln-op-mute">Confirmación de laboratorio (A10)</span>
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
              <ul className="px-4 py-2 text-[13px]">
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
              <p className="px-4 pb-3 text-[11px] text-ln-op-mute">
                {reportableIncidence.byDisease.suppressedCount} celda(s) ocultas por privacidad
                (k-anonimato).
              </p>
            )}
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelAmrId}>
          <OpCardHead title={<span id={panelAmrId}>AMR — densidad de antimicrobianos</span>} />
          <OpCardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
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
              <p className="mt-3 text-[11px] text-ln-op-mute">
                {amrDensity.provisionalUnclassified} evento(s) con fármaco sin clasificar — conteo
                provisional (clasificación provisional), no incluido en la tasa.
              </p>
            )}
          </OpCardBody>
        </OpCard>
      </div>

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
            />
          </OpCardBody>
        </OpCard>

        <OpCard aria-labelledby={panelSignalsId}>
          <OpCardHead
            title={<span id={panelSignalsId}>Signals recientes</span>}
            actions={
              <Link
                href="/gob/vigilancia/brotes"
                className="text-[12px] text-ln-op-azul hover:underline no-underline"
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
                  title="Sin signals activos en este período"
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
          title={<span id={panelTrendId}>Tendencia de enfermedades reportables (12 meses)</span>}
        />
        <OpCardBody>
          <TimeSeriesChartDynamic data={trendPoints} seriesLabel="Signals" />
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
    </div>
  );
}
