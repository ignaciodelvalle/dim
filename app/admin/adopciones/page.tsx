// /admin/adopciones — Pipeline de custodia & adopción (vista admin universal, Paquete F).
//
// Universal view: no JurisdictionSwitcher, admin sees all data regardless of province.
// Answers: ¿Funciona el ciclo de colocación?
//
// Layout:
//   KPI row            — pets en custodia · en tránsito · adopciones (período) · tasa de retorno
//   Funnel             — intake→foster→adopción→devolución (horizontal bars)
//   Time-in-state      — median/p75 días por rol (shelter_custody, foster)
//   Shelter occupancy  — ocupación nacional de refugios vs cupo
//   Foster pool        — voluntarios activos / con cupo / colocaciones activas
//   Adoption trend     — TimeSeriesChartDynamic (adoption_finalized)
//   Freshness footer

import { TimeSeriesChartDynamic } from "@/components/charts/TimeSeriesChartDynamic";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { DEFAULT_DASHBOARD_PRESET } from "@/lib/analytics-period";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import {
  TARGETS,
  buildProjectionContext,
  fetchAdoptionTrend,
  fetchCustodyFunnel,
  fetchFosterPoolUtilization,
  fetchReturnRate,
  fetchShelterOccupancyNational,
  fetchTimeInState,
  funnelWithinUniverse,
  toneForTarget,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

export const dynamic = "force-dynamic";

export default async function AdminAdopcionesPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireAdminOrRedirect();

  const sp = searchParams ? await searchParams : {};
  const { resolveAnalyticsPeriod } = await import("@/lib/metrics/period");
  const period = sp.period || sp.from ? resolveAnalyticsPeriod(sp) : windows.trailing12m();

  const ctx = buildProjectionContext({ role: "admin" }, [], period);

  const [funnel, timeInState, returnRateValue, fosterPool, shelterOccupancy, adoptionTrend] =
    await Promise.all([
      fetchCustodyFunnel(ctx),
      fetchTimeInState(ctx),
      fetchReturnRate(ctx),
      fetchFosterPoolUtilization(ctx),
      fetchShelterOccupancyNational(ctx),
      fetchAdoptionTrend(ctx),
    ]);

  const fPct = funnelWithinUniverse(funnel);

  const hasFunnel = funnel.intake > 0 || funnel.foster > 0 || funnel.adoption > 0;
  const hasTrend = adoptionTrend.points.length > 0;

  const returnRatePct = returnRateValue != null ? Math.round(returnRateValue * 1000) / 10 : null;

  // Shelter custody + foster active placements as KPI values.
  const shelterCustodyRow = timeInState.find((r) => r.role === "shelter_custody");
  const fosterRow = timeInState.find((r) => r.role === "foster");

  const panelFunnelId = "admin-panel-adopciones-embudo-titulo";
  const panelTimeId = "admin-panel-adopciones-tiempo-titulo";
  const panelOccupancyId = "admin-panel-adopciones-ocupacion-titulo";
  const panelFosterPoolId = "admin-panel-adopciones-pool-titulo";
  const panelTrendId = "admin-panel-adopciones-tendencia-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin · Pipeline de custodia & adopción
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Adopciones</h1>
        <p className="text-[13px] text-ln-op-mute">
          Vista nacional: embudo de colocación, tiempos de custodia, ocupación de refugios y pool de
          tránsitos.
        </p>
      </header>

      {/* Period filter */}
      <div className="flex justify-end">
        <PeriodPicker defaultPreset={DEFAULT_DASHBOARD_PRESET} />
      </div>

      {/* KPI row */}
      <section
        aria-label="Indicadores de adopciones"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <OpKpi
          label="En custodia (refugio)"
          value={
            shelterOccupancy.occupied > 0 ? shelterOccupancy.occupied.toLocaleString("es-AR") : "—"
          }
          sub="ownerships shelter_custody activas (nacional)"
          info={{
            definition:
              "Cantidad de animales con ownerships.role = 'shelter_custody' y ended_at IS NULL a nivel nacional.",
            formula: "COUNT(ownerships) WHERE role='shelter_custody' AND ended_at IS NULL",
          }}
        />
        <OpKpi
          label="En tránsito (foster)"
          value={
            fosterPool.activeFosterPlacements > 0
              ? fosterPool.activeFosterPlacements.toLocaleString("es-AR")
              : "—"
          }
          sub="colocaciones foster activas (ownerships)"
          info={{
            definition: "Cantidad de animales con ownerships.role = 'foster' y ended_at IS NULL.",
            formula: "COUNT(ownerships) WHERE role='foster' AND ended_at IS NULL",
          }}
        />
        <OpKpi
          label="Adopciones"
          value={funnel.adoption > 0 ? funnel.adoption.toLocaleString("es-AR") : "—"}
          sub="adoption_finalized en el período"
          sparkline={
            adoptionTrend.points.length > 0 ? adoptionTrend.points.map((p) => p.y) : undefined
          }
          info={{
            definition: "Adopciones finalizadas (evento adoption_finalized) en el período.",
            formula: "COUNT(pet_events) WHERE event_type='adoption_finalized' AND period",
          }}
        />
        <OpKpi
          label="Tasa de retorno"
          value={returnRatePct != null ? `${returnRatePct}%` : "—"}
          sub={
            returnRatePct != null
              ? "devoluciones / adopciones (período)"
              : "Sin adopciones en el período"
          }
          tone={
            returnRatePct == null
              ? "neutral"
              : toneForTarget(returnRatePct, TARGETS.ADOPTION_RETURN_RATE_PCT, {
                  higherIsBetter: false,
                })
          }
          info={{
            definition:
              "Fracción de adopciones finalizadas que fueron revertidas (adoption_reversed / adoption_finalized) en el período. Menor es mejor.",
            formula: "COUNT(adoption_reversed) / COUNT(adoption_finalized) — null si den=0",
            caveat:
              "Numerador y denominador son conteos independientes de eventos en el período; un reverso puede corresponder a una adopción de un período anterior.",
          }}
        />
      </section>

      {/* Funnel — intake → foster → adopción → devolución */}
      <OpCard aria-labelledby={panelFunnelId}>
        <OpCardHead title={<span id={panelFunnelId}>Embudo de colocación</span>} />
        <OpCardBody>
          {!hasFunnel ? (
            <LnEmptyState
              icon="heart"
              title="Sin eventos de custodia en el período"
              description="No hay registros de intake, tránsitos o adopciones en el período seleccionado."
            />
          ) : (
            <figure
              role="img"
              aria-label={`Embudo de colocación — ${funnel.intake.toLocaleString("es-AR")} ingresos en total.`}
            >
              <figcaption className="sr-only">
                Gráfico de barras horizontales: etapas del pipeline de custodia y adopción. Cada
                barra muestra la proporción respecto al total de ingresos.
              </figcaption>
              <ul className="space-y-2" aria-label="Etapas del pipeline de custodia">
                {/* Stage 1: Intake */}
                <li
                  className="flex items-center gap-3"
                  aria-label={`Ingresos: ${funnel.intake.toLocaleString("es-AR")} (100%)`}
                >
                  <span className="w-48 shrink-0 text-[13px] text-ln-op-ink">
                    Ingresos al refugio
                  </span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div className="h-full rounded bg-ln-op-azul" style={{ width: "100%" }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {funnel.intake.toLocaleString("es-AR")} (100%)
                  </span>
                </li>

                {/* Stage 2: Foster */}
                <li
                  className="flex items-center gap-3"
                  aria-label={`Tránsito (foster): ${funnel.foster.toLocaleString("es-AR")} (${fPct.fosterPct}%)`}
                >
                  <span className="w-48 shrink-0 text-[13px] text-ln-op-ink">
                    Asignados a tránsito
                  </span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded bg-ln-op-azul"
                      style={{ width: `${fPct.fosterPct}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {funnel.foster.toLocaleString("es-AR")} ({fPct.fosterPct}%)
                  </span>
                </li>

                {/* Stage 3: Adoption */}
                <li
                  className="flex items-center gap-3"
                  aria-label={`Adoptados: ${funnel.adoption.toLocaleString("es-AR")} (${fPct.adoptionPct}%)`}
                >
                  <span className="w-48 shrink-0 text-[13px] text-ln-op-ink">
                    Adopciones finalizadas
                  </span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded bg-ln-op-verde"
                      style={{ width: `${fPct.adoptionPct}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {funnel.adoption.toLocaleString("es-AR")} ({fPct.adoptionPct}%)
                  </span>
                </li>

                {/* Stage 4: Reversed (devolución) */}
                <li
                  className="flex items-center gap-3"
                  aria-label={`Devoluciones: ${funnel.reversed.toLocaleString("es-AR")} (${fPct.reversedPct}%)`}
                >
                  <span className="w-48 shrink-0 text-[13px] text-ln-op-ink">Devoluciones</span>
                  <div
                    className="flex-1 h-4 rounded bg-ln-op-stripe overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded ${fPct.reversedPct > 10 ? "bg-ln-op-rojo" : fPct.reversedPct > 5 ? "bg-ln-op-amarillo" : "bg-ln-op-azul"}`}
                      style={{ width: `${fPct.reversedPct}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums text-ln-op-ink">
                    {funnel.reversed.toLocaleString("es-AR")} ({fPct.reversedPct}%)
                  </span>
                </li>
              </ul>
              <p className="mt-2 text-[10px] text-ln-op-mute">
                Porcentajes relativos al total de ingresos al refugio en el período. Las etapas son
                conteos de eventos independientes (no cohorte).
              </p>
            </figure>
          )}
        </OpCardBody>
      </OpCard>

      {/* Time-in-state panel */}
      <OpCard aria-labelledby={panelTimeId}>
        <OpCardHead title={<span id={panelTimeId}>Tiempo en estado</span>} />
        <OpCardBody>
          {timeInState.length === 0 ? (
            <LnEmptyState
              icon="clock"
              title="Sin datos de custodia"
              description="No hay ownerships de custodia o tránsito en el período seleccionado."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ln-op-ink border-collapse">
                <caption className="sr-only">
                  Tiempo promedio y percentil 75 en estado de custodia o tránsito, en días.
                </caption>
                <thead>
                  <tr className="border-b border-ln-op-line">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold text-ln-op-mute">
                      Rol
                    </th>
                    <th scope="col" className="text-right py-2 px-4 font-semibold text-ln-op-mute">
                      Mediana (días)
                    </th>
                    <th scope="col" className="text-right py-2 px-4 font-semibold text-ln-op-mute">
                      P75 (días)
                    </th>
                    <th scope="col" className="text-right py-2 pl-4 font-semibold text-ln-op-mute">
                      Registros
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "shelter_custody", label: "Custodia en refugio" },
                    { key: "foster", label: "Tránsito (foster)" },
                  ].map(({ key, label }) => {
                    const row = timeInState.find((r) => r.role === key);
                    if (!row) return null;
                    return (
                      <tr
                        key={key}
                        className="border-b border-ln-op-line last:border-0 hover:bg-ln-op-stripe/50 transition-colors"
                      >
                        <td className="py-2 pr-4">{label}</td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          {row.medianDays != null ? `${Math.round(row.medianDays * 10) / 10}` : "—"}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          {row.p75Days != null ? `${Math.round(row.p75Days * 10) / 10}` : "—"}
                        </td>
                        <td className="py-2 pl-4 text-right tabular-nums text-ln-op-mute">
                          {row.n.toLocaleString("es-AR")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-ln-op-mute">
                Duración calculada como COALESCE(ended_at, now()) − started_at para ownerships que
                se superponen con el período.
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* Shelter occupancy national */}
      <OpCard aria-labelledby={panelOccupancyId}>
        <OpCardHead title={<span id={panelOccupancyId}>Ocupación de refugios (nacional)</span>} />
        <OpCardBody>
          {shelterOccupancy.occupied === 0 && shelterOccupancy.capacity == null ? (
            <LnEmptyState
              icon="home"
              title="Sin datos de ocupación"
              description="No hay registros de custodia activa ni capacidad declarada para refugios."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-[22px] font-semibold text-ln-op-ink tabular-nums">
                  {shelterOccupancy.occupied.toLocaleString("es-AR")}
                </div>
                <div className="text-[13px] text-ln-op-mute">
                  {shelterOccupancy.capacity != null ? (
                    <>
                      de {shelterOccupancy.capacity.toLocaleString("es-AR")} cupos declarados
                      {shelterOccupancy.pct != null && (
                        <span
                          className={`ml-2 font-semibold ${shelterOccupancy.pct > 90 ? "text-ln-op-rojo" : shelterOccupancy.pct > 70 ? "text-ln-op-amarillo" : "text-ln-op-verde"}`}
                        >
                          ({shelterOccupancy.pct}%)
                        </span>
                      )}
                    </>
                  ) : (
                    "animales en custodia · cupo no declarado"
                  )}
                </div>
              </div>
              {shelterOccupancy.capacity != null && shelterOccupancy.pct != null && (
                <div
                  className="h-3 rounded bg-ln-op-stripe overflow-hidden"
                  aria-hidden="true"
                  role="presentation"
                >
                  <div
                    className={`h-full rounded transition-all ${shelterOccupancy.pct > 90 ? "bg-ln-op-rojo" : shelterOccupancy.pct > 70 ? "bg-ln-op-amarillo" : "bg-ln-op-verde"}`}
                    style={{ width: `${Math.min(100, shelterOccupancy.pct)}%` }}
                  />
                </div>
              )}
              <p className="text-[10px] text-ln-op-mute">
                Ocupados: SUM de ownerships shelter_custody activos · Cupo: SUM de
                organizations.capacity_total para orgs tipo shelter.
              </p>
            </div>
          )}
        </OpCardBody>
      </OpCard>

      {/* Foster pool utilization */}
      <OpCard aria-labelledby={panelFosterPoolId}>
        <OpCardHead title={<span id={panelFosterPoolId}>Pool de tránsitos</span>} />
        <OpCardBody>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-[20px] font-semibold text-ln-op-ink tabular-nums">
                {fosterPool.activeVolunteers.toLocaleString("es-AR")}
              </div>
              <div className="text-[11px] text-ln-op-mute mt-0.5">Voluntarios activos</div>
            </div>
            <div className="text-center">
              <div className="text-[20px] font-semibold text-ln-op-ink tabular-nums">
                {fosterPool.withCapacity.toLocaleString("es-AR")}
              </div>
              <div className="text-[11px] text-ln-op-mute mt-0.5">Con cupo disponible</div>
            </div>
            <div className="text-center">
              <div className="text-[20px] font-semibold text-ln-op-ink tabular-nums">
                {fosterPool.activeFosterPlacements.toLocaleString("es-AR")}
              </div>
              <div className="text-[11px] text-ln-op-mute mt-0.5">Colocaciones activas</div>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-ln-op-mute">
            Voluntarios: foster_volunteers WHERE status='active'. Con cupo: AND available_slots &gt;
            0. Colocaciones activas: ownerships WHERE role='foster' AND ended_at IS NULL.
          </p>
        </OpCardBody>
      </OpCard>

      {/* Adoption trend */}
      <OpCard aria-labelledby={panelTrendId}>
        <OpCardHead
          title={<span id={panelTrendId}>Tendencia de adopciones</span>}
          actions={
            adoptionTrend.suppressedCount > 0 ? (
              <span className="text-[12px] font-normal text-ln-op-mute">
                {adoptionTrend.suppressedCount}{" "}
                {adoptionTrend.suppressedCount === 1 ? "período oculto" : "períodos ocultos"}{" "}
                (privacidad)
              </span>
            ) : null
          }
        />
        <OpCardBody>
          {!hasTrend ? (
            <LnEmptyState
              icon="chart-line"
              title="Sin adopciones en el período"
              description="No hay eventos adoption_finalized en el rango seleccionado."
            />
          ) : (
            <TimeSeriesChartDynamic
              data={adoptionTrend.points}
              seriesLabel="Adopciones finalizadas"
              yLabel="Adopciones"
              variant="area"
              fallbackTableLabel={`Adopciones por ${adoptionTrend.granularity === "month" ? "mes" : "semana"}`}
            />
          )}
        </OpCardBody>
      </OpCard>

      <DashboardFreshnessFooter ctx={ctx} />
    </div>
  );
}
