// /gob/campanas — Campaign performance dashboard for sanitary authority operators.
// Route is ASCII ("campanas", not "campañas"): a non-ASCII App Router segment is
// served percent-encoded (/gob/campa%C3%B1as), which breaks usePathname-based
// active-nav matchPrefix and is a credibility smell in a government URL bar.
//
// Surfaces: enrollment (bookings), completion (attended), no-show, and
// geographic reach per health-campaign offering in the operator's jurisdiction.
//
// Data: pure projection over existing appointments + service_offerings — NO schema changes.
// Consumes Item 23 primitives: OpKpi v2, MapChoropleth v2, JurisdictionSwitcher, PeriodPicker.
// Builds on lib/metrics/ (ProjectionContext, buildProjectionContext).

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchCampaignDashboard, formatDelta } from "@/lib/analytics/campaign-metrics";
import {
  type DashboardJurisdiction,
  GOB_ALL_PROVINCES,
  PROVINCE_ISO_MAP,
} from "@/lib/analytics/govt-dashboards";
import { RAMP_BLUE, RAMP_GREEN } from "@/lib/analytics/viz-scales";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  resolveAnalyticsPeriod,
  toneForTarget,
  windows,
} from "@/lib/metrics";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";
import { findServiceKind } from "@/lib/reference/service-kinds";

export const dynamic = "force-dynamic";

export default async function GobCampanasPage({
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

  // Capability guard: same as analytics — admin or govt with assignments.
  const hasCampaignsRead =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasCampaignsRead) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            MiMAR Gobierno · Campañas
          </p>
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Performance de campañas</h1>
        </header>
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a campañas. Pedile al admin que te asigne cobertura jurisdiccional."
        />
      </div>
    );
  }

  const sp = await searchParams;

  // "Exportar CSV" always mirrors the active period + jurisdiction filters —
  // the export route re-derives filteredJurisdictions from the same params.
  const exportParams = new URLSearchParams();
  if (sp.period) exportParams.set("period", sp.period);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  if (sp.province) exportParams.set("province", sp.province);
  if (sp.locality) exportParams.set("locality", sp.locality);
  const exportHref = `/gob/campanas/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;

  // Jurisdiction filter (same pattern as /gob/analytics).
  const selectedProvinceIso = sp.province ?? null;
  const selectedLocalitySlug = sp.locality ?? null;
  const selectedProvinceObj = selectedProvinceIso ? provinceByCode(selectedProvinceIso) : null;

  const localities =
    selectedProvinceObj != null
      ? await listLocalitiesByProvince(selectedProvinceObj.code as ProvinceCode)
      : [];

  const selectedLocalityRow =
    selectedProvinceObj && selectedLocalitySlug
      ? await localityByName(selectedProvinceObj.code as ProvinceCode, selectedLocalitySlug)
      : null;

  let filteredJurisdictions: DashboardJurisdiction[] = jurisdictions;
  if (selectedProvinceObj && profile.role !== "admin") {
    const provinceName = selectedProvinceObj.name;
    if (selectedLocalityRow) {
      filteredJurisdictions = jurisdictions.filter(
        (j) => j.province === provinceName && j.locality === selectedLocalityRow.localityName,
      );
    } else {
      filteredJurisdictions = jurisdictions.filter((j) => j.province === provinceName);
    }
  }

  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing30d();

  const ctx = buildProjectionContext(actor, filteredJurisdictions, period);
  const dashboard = await fetchCampaignDashboard(ctx);

  // Build allowedProvinces for JurisdictionSwitcher.
  const allowedProvinces =
    profile.role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  // Determine the "period label" string for delta display.
  const periodLabel = "vs período anterior";

  const enrollmentDelta = formatDelta(
    dashboard.totals.enrollment,
    dashboard.prevTotals.enrollment,
    periodLabel,
  );
  const completionDelta = formatDelta(
    dashboard.totals.completion,
    dashboard.prevTotals.completion,
    periodLabel,
  );
  const noShowDelta = formatDelta(
    dashboard.totals.noShow,
    dashboard.prevTotals.noShow,
    periodLabel,
  );

  // Choropleth: aggregate geoReach by province for the province-level map.
  // The basemap GeoJSON joins on province ISO code — locality-level codes would
  // produce orphan data and render nothing. Sum attendedCount per province.
  const provinceAttendance = new Map<string, { isoCode: string; name: string; count: number }>();
  for (const r of dashboard.geoReach) {
    const provinceName = r.province;
    if (!provinceName) continue;
    const isoCode = PROVINCE_ISO_MAP[provinceName];
    if (!isoCode) continue;
    const existing = provinceAttendance.get(isoCode);
    if (existing) {
      existing.count += r.attendedCount;
    } else {
      provinceAttendance.set(isoCode, { isoCode, name: provinceName, count: r.attendedCount });
    }
  }
  const choroplethData = Array.from(provinceAttendance.values()).map((p) => ({
    code: p.isoCode,
    value: p.count,
    label: `${p.count} ${p.count === 1 ? "inscripción" : "inscripciones"} en ${p.name}`,
  }));

  const hasData = dashboard.offerings.length > 0;

  const panelKpiId = "panel-kpis-campanias";
  const panelOfferingsId = "panel-ofertas-campanias";
  const panelMapId = "panel-mapa-campanias";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Campañas</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Performance de campañas</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Inscripciones, completitud y alcance geográfico de las campañas sanitarias en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
          <PeriodPicker defaultPreset="30d" />
        </div>
        <a
          href={exportHref}
          className="shrink-0 text-[var(--text-md)] text-ln-azul hover:underline"
        >
          Exportar CSV →
        </a>
      </div>

      {!hasData ? (
        // Empty state — jurisdiction with no active campaigns.
        <LnEmptyState
          icon="calendar"
          title="No hay campañas en tu cobertura"
          description={
            "Una campaña sanitaria es un servicio de salud animal (vacunación, desparasitación, esterilización) " +
            "que una organización habilitada ofrece de forma masiva en una localidad. " +
            "Cuando haya campañas activas o históricas en tu jurisdicción, vas a ver su performance acá."
          }
        />
      ) : (
        <>
          {/* KPI row */}
          <section aria-labelledby={panelKpiId} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <span id={panelKpiId} className="sr-only">
              Indicadores de campañas
            </span>

            <OpKpi
              label="Inscripciones"
              value={String(dashboard.totals.enrollment)}
              tone="blue"
              deltaV2={enrollmentDelta ?? undefined}
              sparkline={dashboard.enrollmentSparkline}
              info={{
                definition: "Total de turnos reservados (confirmados + asistidos + ausentes).",
                formula: "confirmed + attended + no_show",
                caveat: "Turnos cancelados no se cuentan.",
              }}
              drillHref="/gob/servicios"
            />

            <OpKpi
              label="Completitud"
              value={
                dashboard.totals.completionRate !== null
                  ? `${dashboard.totals.completionRate}%`
                  : "—"
              }
              tone={
                dashboard.totals.completionRate !== null
                  ? toneForTarget(dashboard.totals.completionRate, TARGETS.CAMPAIGN_COMPLETION_PCT)
                  : "neutral"
              }
              bar={dashboard.totals.completionRate ?? undefined}
              deltaV2={completionDelta ?? undefined}
              info={{
                definition: `Porcentaje de turnos que resultaron en asistencia efectiva. Meta: ${TARGETS.CAMPAIGN_COMPLETION_PCT}%.`,
                formula: "attended / enrollment × 100",
              }}
            />

            <OpKpi
              label="Asistencias"
              value={String(dashboard.totals.completion)}
              tone="ok"
              deltaV2={completionDelta ?? undefined}
              info={{
                definition: "Cantidad de turnos donde el animal fue efectivamente atendido.",
              }}
            />

            <OpKpi
              label="Ausencias"
              value={String(dashboard.totals.noShow)}
              tone={dashboard.totals.noShow > 0 ? "warn" : "neutral"}
              deltaV2={noShowDelta ?? undefined}
              info={{
                definition: "Turnos donde el animal no se presentó (no-show).",
                caveat: "Las ausencias pueden indicar barreras de acceso — considerar recontacto.",
              }}
            />
          </section>

          {/* Per-offering table */}
          <OpCard aria-labelledby={panelOfferingsId}>
            <OpCardHead
              title={
                <span id={panelOfferingsId}>
                  Performance por servicio
                  <span className="ml-2 text-[11px] font-normal text-ln-op-mute">
                    ({dashboard.offerings.length} servicio
                    {dashboard.offerings.length !== 1 ? "s" : ""})
                  </span>
                </span>
              }
            />
            <OpCardBody>
              <ul className="space-y-2">
                {dashboard.offerings.map((offering) => {
                  const kindLabel =
                    findServiceKind(offering.serviceKind)?.label ?? offering.serviceKind;
                  const location = [offering.jurisdictionLocality, offering.jurisdictionProvince]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <li
                      key={offering.offeringId}
                      className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-[12px_14px]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ln-op-ink">
                            {offering.displayName}
                          </p>
                          <p className="text-[11px] text-ln-op-mute">
                            {kindLabel}
                            {location ? ` · ${location}` : ""}
                          </p>
                        </div>
                        <a
                          href={`/gob/servicios/${offering.offeringToken}`}
                          className="shrink-0 text-[11px] text-ln-azul hover:underline"
                        >
                          Ver servicio →
                        </a>
                      </div>

                      {/* Metrics row */}
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        {/* Enrollment */}
                        <div className="rounded-[var(--radius-sm)] bg-ln-op-stripe px-2 py-1.5">
                          <p className="text-lg font-semibold font-ln-serif text-ln-op-ink leading-none">
                            {offering.enrollment}
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ln-op-mute mt-0.5">
                            Inscripciones
                          </p>
                        </div>

                        {/* Completion */}
                        <div className="rounded-[var(--radius-sm)] bg-ln-op-stripe px-2 py-1.5">
                          <p
                            className={[
                              "text-lg font-semibold font-ln-serif leading-none",
                              offering.completionRate !== null &&
                              offering.completionRate >= TARGETS.CAMPAIGN_COMPLETION_PCT
                                ? "text-ln-op-ok"
                                : offering.completionRate !== null &&
                                    offering.completionRate >= TARGETS.CAMPAIGN_COMPLETION_PCT * 0.6
                                  ? "text-ln-op-warn"
                                  : offering.completionRate !== null
                                    ? "text-ln-op-danger"
                                    : "text-ln-op-ink",
                            ].join(" ")}
                          >
                            {offering.completionRate !== null ? `${offering.completionRate}%` : "—"}
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ln-op-mute mt-0.5">
                            Completitud
                          </p>
                          {/* Icon + text a11y (Item 11 pattern: no color-only) */}
                          {offering.completionRate !== null &&
                            offering.completionRate < TARGETS.CAMPAIGN_COMPLETION_PCT * 0.6 && (
                              <p className="text-[9px] text-ln-op-danger mt-0.5 flex items-center justify-center gap-0.5">
                                <span aria-hidden="true">↓</span>
                                <span>Baja</span>
                              </p>
                            )}
                        </div>

                        {/* No-show */}
                        <div className="rounded-[var(--radius-sm)] bg-ln-op-stripe px-2 py-1.5">
                          <p
                            className={[
                              "text-lg font-semibold font-ln-serif leading-none",
                              offering.noShow > 0 ? "text-ln-op-warn" : "text-ln-op-ink",
                            ].join(" ")}
                          >
                            {offering.noShow}
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ln-op-mute mt-0.5">
                            Ausencias
                          </p>
                          {offering.noShow > 0 && (
                            <p className="text-[9px] text-ln-op-warn mt-0.5 flex items-center justify-center gap-0.5">
                              <span aria-hidden="true">⚠</span>
                              <span>No-show</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </OpCardBody>
          </OpCard>

          {/* Geographic reach choropleth */}
          {dashboard.geoReach.length > 0 && (
            <OpCard aria-labelledby={panelMapId}>
              <OpCardHead
                title={
                  <span id={panelMapId}>
                    Alcance geográfico
                    <span className="ml-2 text-[11px] font-normal text-ln-op-mute">
                      localidades con asistencias
                    </span>
                  </span>
                }
              />
              <OpCardBody>
                {/* Province-level choropleth — joins on province ISO code from
                    the basemap GeoJSON. geoReach rows are aggregated by province
                    so every region renders; localities without an ISO-mapped province
                    are silently dropped (they show as COLOR_NO_DATA).
                    The colorScale comes from viz-scales (no arbitrary hex). */}
                <MapChoroplethDynamic
                  data={choroplethData}
                  level="province"
                  colorScale={RAMP_BLUE}
                  scaleLabel="Inscripciones"
                  fallbackTableLabel="Inscripciones por provincia en campañas sanitarias"
                />

                {/* Accessibility: data table below the map */}
                <details className="mt-3">
                  <summary className="text-[11px] text-ln-op-mute cursor-pointer hover:text-ln-op-ink">
                    Ver datos de alcance geográfico (tabla)
                  </summary>
                  <table className="mt-2 w-full text-sm border-collapse">
                    <caption className="sr-only">
                      Inscripciones por localidad en campañas sanitarias
                    </caption>
                    <thead>
                      <tr className="border-b border-ln-op-line">
                        <th scope="col" className="py-1 text-left font-semibold text-ln-op-mute">
                          Localidad
                        </th>
                        <th scope="col" className="py-1 text-left font-semibold text-ln-op-mute">
                          Provincia
                        </th>
                        <th scope="col" className="py-1 text-right font-semibold text-ln-op-mute">
                          Asistencias
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.geoReach.map((r) => (
                        <tr key={r.locality} className="border-b border-ln-op-line/50">
                          <td className="py-1 text-ln-op-ink">{r.locality}</td>
                          <td className="py-1 text-ln-op-mute">{r.province ?? "—"}</td>
                          <td className="py-1 text-right tabular-nums text-ln-op-ink">
                            {r.attendedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </OpCardBody>
            </OpCard>
          )}
        </>
      )}

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
