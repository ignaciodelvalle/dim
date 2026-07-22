// /gob/outreach — Actionable outreach pipelines (Item 21).
//
// "Del dato a la acción": each pipeline converts a KPI into a target list
// that an operator can review and export for a contact campaign.
//
// Three pipelines (v1):
//   (a) Overdue antirrábica — pets with overdue rabies vaccine by jurisdiction
//   (b) Stray-scan density  — barrios with elevated stray-scan count
//   (c) Sterilization ranking — vets ranked by throughput (recognition)
//
// PII contract: every page render writes a pii_queried audit row per pipeline
// viewed. Lists are operational + scoped — NOT k-anonymized public aggregates.
//
// Capability gate: requireAdminOrGovtOrRedirect (same as all /gob pages).
// Export: /gob/outreach/export?pipeline=<id>&... for CSV download.

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  fetchOverdueRabiesVaccine,
  fetchSterilizationVetRanking,
  fetchStrayDensityAreas,
  logOutreachPiiQuery,
} from "@/lib/infra/outreach-pipelines";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { relativeDaysShort, speciesLabel } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function GobOutreachPage() {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Capability gate: same pattern as analytics/campañas.
  const hasOutreachAccess =
    profile.role === "admin" || (profile.role === "govt" && jurisdictions.length > 0);

  if (!hasOutreachAccess) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            miMAR Gobierno · Alcance comunitario
          </p>
          <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
            Pipelines de alcance comunitario
          </h1>
        </header>
        <LnEmptyState
          icon="lock"
          title="Sin acceso"
          description="Tu rol no tiene acceso a los pipelines de alcance comunitario. Pedile al admin que te asigne cobertura jurisdiccional."
        />
      </div>
    );
  }

  // Build context for the trailing 12-month window (overdue rabies) and
  // trailing 30-day window (stray scans, sterilization ranking).
  const period12m = windows.trailing12m();
  const period30d = windows.trailing30d();

  const ctx12m = buildProjectionContext({ role: profile.role }, jurisdictions, period12m);
  const ctx30d = buildProjectionContext({ role: profile.role }, jurisdictions, period30d);

  // Fetch all three pipelines concurrently.
  const [overdueResult, strayResult, sterilResult] = await Promise.all([
    fetchOverdueRabiesVaccine(ctx12m),
    fetchStrayDensityAreas(ctx30d),
    fetchSterilizationVetRanking(ctx30d),
  ]);

  // Mandatory PII audit log — one row per pipeline viewed, fire-and-forget.
  void logOutreachPiiQuery(user.id, "overdue_rabies", overdueResult.pets.length);
  void logOutreachPiiQuery(user.id, "stray_density", strayResult.areas.length);
  void logOutreachPiiQuery(user.id, "sterilization_ranking", sterilResult.vets.length);

  const panelRabiesId = "panel-outreach-rabies";
  const panelStrayId = "panel-outreach-stray";
  const panelSterilId = "panel-outreach-steril";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Alcance comunitario
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Pipelines de alcance comunitario
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          Del dato a la acción: cada pipeline convierte un indicador en una lista objetivo para
          campañas de contacto. Las consultas quedan registradas en el audit log.
        </p>
      </header>

      {/* Summary KPIs */}
      <section aria-label="Resumen de pipelines" className="grid grid-cols-3 gap-3">
        <OpKpi
          label="Antirrábica vencida"
          value={String(overdueResult.pets.length)}
          tone={overdueResult.pets.length > 0 ? "danger" : "ok"}
          sub="mascotas en cobertura (12m)"
          info={{
            definition:
              "Mascotas activas en tu jurisdicción cuya última vacuna antirrábica registrada supera los 365 días o que nunca vacunaron.",
            caveat: "Solo considera mascotas con eventos registrados en miMAR.",
          }}
          descriptorId="outreach_overdue_rabies_count"
        />
        <OpKpi
          label="Áreas con escaneos"
          value={String(strayResult.areas.length)}
          tone={strayResult.areas.length > 0 ? "warn" : "neutral"}
          sub="localidades con actividad (30d)"
          info={{
            definition:
              "Localidades con al menos un escaneo de credencial no propio (indicador de animal callejero) en los últimos 30 días.",
          }}
          descriptorId="outreach_stray_scan_areas"
        />
        <OpKpi
          label="Vets en ranking"
          value={String(sterilResult.vets.length)}
          tone="blue"
          sub="con esterilizaciones (30d)"
          info={{
            definition:
              "Veterinarios/as con al menos una esterilización registrada en tu jurisdicción en los últimos 30 días.",
          }}
          descriptorId="outreach_sterilization_vets_ranked"
        />
      </section>

      {/* Pipeline (a): Overdue antirrábica */}
      <OpCard aria-labelledby={panelRabiesId}>
        <OpCardHead
          title={
            <span id={panelRabiesId} className="flex items-center gap-2">
              Antirrábica vencida
              <span className="text-[11px] font-normal text-ln-op-mute">
                · pipeline (a) · datos operativos con PII · audit registrado
              </span>
            </span>
          }
          actions={
            overdueResult.pets.length > 0 ? (
              <a
                href="/gob/outreach/export?pipeline=overdue_rabies"
                className="text-[11px] text-ln-op-azul hover:underline"
              >
                Exportar CSV →
              </a>
            ) : undefined
          }
        />
        <OpCardBody>
          {overdueResult.empty ? (
            <LnEmptyState
              icon="check-circle"
              title="Sin mascotas que cumplan el criterio en tu jurisdicción"
              description="No hay mascotas activas con antirrábica vencida (> 365 días) en tu cobertura."
            />
          ) : (
            <ul className="space-y-1" aria-label="Lista de mascotas con antirrábica vencida">
              {overdueResult.pets.slice(0, 50).map((pet) => {
                // epoch sentinel (new Date(0)) = pet never had a rabies vaccine
                // on record. Show "sin registro" instead of a meaningless
                // "hace 20624d"; real overdue dates render as a capped "hace Nd".
                const overdueLabel =
                  pet.lastVaccineAt.getTime() === 0
                    ? "sin registro"
                    : relativeDaysShort(pet.lastVaccineAt);
                return (
                  <li
                    key={pet.petId}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-ln-op-ink">{pet.petName}</p>
                      <p className="text-ln-op-mute">
                        {speciesLabel(pet.species)} ·{" "}
                        {[pet.jurisdictionLocality, pet.jurisdictionProvince]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-ln-op-danger font-medium tabular-nums">
                      {overdueLabel}
                    </span>
                  </li>
                );
              })}
              {overdueResult.pets.length > 50 && (
                <li className="py-1 text-center text-[11px] text-ln-op-mute">
                  … y {overdueResult.pets.length - 50} más — exportá el CSV para la lista completa
                </li>
              )}
            </ul>
          )}
          {!overdueResult.empty && (
            <p className="mt-3 text-[11px] text-ln-op-mute">
              Estos datos son PII operativos, scoped a tu jurisdicción. Cada consulta queda
              registrada.{" "}
              <Link
                href="/gob/historial"
                className="underline underline-offset-2 hover:text-ln-op-ink"
              >
                Ver historial →
              </Link>
            </p>
          )}
        </OpCardBody>
      </OpCard>

      {/* Pipeline (b): Stray-scan density */}
      <OpCard aria-labelledby={panelStrayId}>
        <OpCardHead
          title={
            <span id={panelStrayId} className="flex items-center gap-2">
              Densidad de escaneos callejeros por barrio
              <span className="text-[11px] font-normal text-ln-op-mute">
                · pipeline (b) · últimos 30 días
              </span>
            </span>
          }
          actions={
            !strayResult.empty ? (
              <a
                href="/gob/outreach/export?pipeline=stray_density"
                className="text-[11px] text-ln-op-azul hover:underline"
              >
                Exportar CSV →
              </a>
            ) : undefined
          }
        />
        <OpCardBody>
          {strayResult.empty ? (
            <LnEmptyState
              icon="map"
              title="Sin escaneos callejeros en tu jurisdicción"
              description="No se registraron escaneos de credencial no propios en los últimos 30 días en tu cobertura."
            />
          ) : (
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">Áreas con escaneos de animales callejeros</caption>
              <thead>
                <tr className="border-b border-ln-op-line">
                  <th scope="col" className="py-1.5 text-left font-semibold text-ln-op-mute">
                    Localidad
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold text-ln-op-mute">
                    Escaneos
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold text-ln-op-mute">
                    Acción sugerida
                  </th>
                </tr>
              </thead>
              <tbody>
                {strayResult.areas.map((area) => (
                  <tr key={area.locality} className="border-b border-ln-op-line/50">
                    <td className="py-1.5 text-ln-op-ink">{area.locality}</td>
                    <td className="py-1.5 text-right tabular-nums text-ln-op-ink">
                      {area.scanCount}
                    </td>
                    <td className="py-1.5 text-right text-ln-op-mute">Pre-posicionar recursos</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpCardBody>
      </OpCard>

      {/* Pipeline (c): Sterilization vet ranking */}
      <OpCard aria-labelledby={panelSterilId}>
        <OpCardHead
          title={
            <span id={panelSterilId} className="flex items-center gap-2">
              Ranking de esterilización por veterinario/a
              <span className="text-[11px] font-normal text-ln-op-mute">
                · pipeline (c) · reconocimiento · últimos 30 días
              </span>
            </span>
          }
        />
        <OpCardBody>
          {sterilResult.empty ? (
            <LnEmptyState
              icon="award"
              title="Sin esterilizaciones registradas en tu jurisdicción"
              description="No hay esterilizaciones registradas en miMAR en los últimos 30 días para tu cobertura."
            />
          ) : (
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">Ranking de esterilizaciones por veterinario/a</caption>
              <thead>
                <tr className="border-b border-ln-op-line">
                  <th scope="col" className="py-1.5 text-left font-semibold text-ln-op-mute">
                    Veterinario/a
                  </th>
                  <th scope="col" className="py-1.5 text-left font-semibold text-ln-op-mute">
                    Clínica
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold text-ln-op-mute">
                    Esterilizaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {sterilResult.vets.map((vet, idx) => (
                  <tr
                    key={`${vet.vetLabel}-${vet.clinic ?? "none"}`}
                    className="border-b border-ln-op-line/50"
                  >
                    <td className="py-1.5 text-ln-op-ink">
                      {idx === 0 && (
                        <span
                          className="mr-1 inline-flex items-center text-ln-op-ok"
                          aria-hidden="true"
                        >
                          <Icon name="estrella" size={14} decorative />
                        </span>
                      )}
                      {vet.vetLabel}
                    </td>
                    <td className="py-1.5 text-ln-op-mute">{vet.clinic ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-ln-op-ink">
                      {vet.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpCardBody>
      </OpCard>

      <p className="text-sm text-ln-op-mute">
        <Link href="/gob" className="underline underline-offset-4 hover:text-ln-op-ink-2">
          ← Volver al dashboard
        </Link>
      </p>

      <DashboardFreshnessFooter ctx={ctx12m} />
    </div>
  );
}
