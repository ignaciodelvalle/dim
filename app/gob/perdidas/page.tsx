import { Suspense } from "react";

import { MapChoroplethDynamic } from "@/components/charts/MapChoroplethDynamic";
import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnInput } from "@/components/ui/Field";
import { type UrlTabItem, UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";
import { OpButton, OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { aggregateChoroplethData } from "@/lib/analytics/choropleth-data";
import { fetchReunificationRate } from "@/lib/analytics/compliance-metrics";
import {
  PROVINCE_ISO_MAP,
  type PetStatusFilter,
  fetchLostPets,
  fetchPerdidasMetrics,
} from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { fetchLostEpisodeCaseCodesForPets } from "@/lib/infra/case-queries";
import { TARGETS, buildProjectionContext, toneForTarget } from "@/lib/metrics";
import { formatPercent, pluralizeEs } from "@/lib/utils/format";
import { LostPetRow as LostPetRowComponent } from "./_components/LostPetRow";

const VALID_STATUSES: PetStatusFilter[] = ["all", "lost", "active", "deceased"];

function parseStatusFilter(raw: string | undefined): PetStatusFilter {
  if (!raw) return "lost";
  return (VALID_STATUSES as string[]).includes(raw) ? (raw as PetStatusFilter) : "lost";
}

const STATUS_TABS: UrlTabItem[] = [
  { value: "lost", label: "Perdidas" },
  { value: "active", label: "Recuperadas" },
  { value: "deceased", label: "Fallecidas" },
  { value: "all", label: "Todas" },
];

export default async function GobPerdidasPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    province?: string;
    locality?: string;
    species?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const sp = await searchParams;
  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // G0 (PO decision 2026-07): the LIST defaults to the full currently-lost STOCK
  // (no window) so its count matches the same-page "Perdidas activas" KPI — both
  // count status='lost'. The period is an OPTIONAL filter: only an explicit
  // ?period windows the list by the lost-event date. `since` above stays the
  // 30d-default window for the period-scoped reunification KPIs (unchanged).
  const listSince = sp.period ? since : undefined;
  const species = sp.species || undefined;
  const statusFilter = parseStatusFilter(sp.status);
  const q = sp.q?.trim() || undefined;

  // Switcher inputs (localities dropdown + allowed provinces). NOTE (D4): perdidas
  // does NOT narrow by filteredJurisdictions — the fetchers below scope internally
  // on the operator's full `jurisdictions`; the URL province/locality only drives
  // the switcher UI here. We therefore ignore the primitive's filteredJurisdictions.
  const { localities, allowedProvinces } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });

  // Fetch the display list with all active display filters applied. `listSince`
  // is undefined by default (full currently-lost stock) and only set when the
  // operator explicitly picks a period.
  const lostPets = await fetchLostPets(actor, jurisdictions, {
    since: listSince,
    species,
    status: statusFilter,
    q,
  });

  // avgDaysActive must be computed over the UNFILTERED in-scope lost pets
  // (the full set of currently-lost pets, not just the display slice). When
  // no display filters are active the fetched list already represents that
  // full set, so we can pass it to avoid a second DB round-trip. When any
  // filter is active (q, an explicit period window, species, or a non-"lost"
  // status tab) the pre-fetched rows are a filtered subset — passing them would
  // silently scope avgDaysActive to that subset instead of the whole
  // population. In that case, omit opts.lostPets so fetchPerdidasMetrics
  // fetches the unfiltered scope internally.
  //
  // "No display filters" = q absent, species absent, statusFilter the default
  // "lost", and NO period window (listSince undefined → the full stock). Only
  // then are the fetched rows the unfiltered set fetchPerdidasMetrics needs.
  const noDisplayFilters = !q && !species && statusFilter === "lost" && listSince === undefined;
  const metrics = await fetchPerdidasMetrics(
    actor,
    jurisdictions,
    noDisplayFilters ? { lostPets } : undefined,
  );

  // D4 reunification rate (Item 4) — lost episodes returned to active within the
  // selected period, plus median days-to-recovery. Period-aware: uses the same
  // `since` window the page's filters use, jurisdiction-scoped via ProjectionContext.
  const reunificationCtx = buildProjectionContext(actor, jurisdictions, {
    since,
    until: new Date(),
  });
  const reunification = await fetchReunificationRate(reunificationCtx);

  // Surface the CAS- case code for each lost pet. Keyed lookup over the already
  // jurisdiction-scoped lostPets (no new nationwide query) — each row links to
  // its lost_pet_episode case at /gob/casos/{code}.
  const caseCodesByPet = await fetchLostEpisodeCaseCodesForPets(lostPets.map((p) => p.petId));

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // task #31c dedup: shared aggregateChoroplethData (same fold as /gob/vigilancia)
  const choroplethData = aggregateChoroplethData(
    lostPets,
    (p) => (p.province ? PROVINCE_ISO_MAP[p.province] : undefined),
    () => 1,
    (value) => `${value} ${pluralizeEs(value, "mascota")} ${pluralizeEs(value, "perdida")}`,
  );

  const panelMapId = "panel-perdidas-mapa-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Perdidas</p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Mascotas perdidas</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Mascotas marcadas como perdidas dentro de tu cobertura."}
        </p>
      </header>

      {/* No-scope warning */}
      {noScope && (
        <div className="rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-3 text-[13px] text-ln-op-warn">
          Tu cuenta no tiene localidades asignadas. Un administrador debe asignarte al menos una
          para ver casos.{" "}
          <a
            href="mailto:hola@mimar.ar?subject=miMAR%20%E2%80%94%20Asignaci%C3%B3n%20de%20localidad"
            className="underline underline-offset-4"
          >
            Solicitar asignación
          </a>
          .
        </div>
      )}

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* KPI cards — pérdidas (activas/recuperados/antigüedad) + reunificación (D4) */}
      <section
        aria-label="Indicadores de perdidas"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <OpKpi
          label="Perdidas activas"
          value={metrics.activeCount > 0 ? String(metrics.activeCount) : "—"}
          tone={metrics.activeCount > 0 ? "warn" : "neutral"}
          drillHref="/gob/perdidas?status=lost"
          info={{
            definition: "Mascotas con estado 'lost' actualmente en la jurisdicción del operador.",
            formula: "COUNT(pets WHERE status='lost') scoped to jurisdiction",
          }}
        />
        <OpKpi
          label="Recuperados (30d)"
          value={String(metrics.recoveredMonth)}
          tone="ok"
          info={{
            definition: "Mascotas que pasaron de estado 'lost' a 'active' en los últimos 30 días.",
            formula: "COUNT(pet_events WHERE event_type='pet_found', últimos 30d) scoped",
          }}
        />
        <OpKpi
          label="Antigüedad media (días)"
          value={String(metrics.avgDaysActive)}
          info={{
            definition:
              "Promedio de días transcurridos desde la fecha de pérdida (evento pet_lost) hasta hoy, sobre el set actualmente perdido.",
            formula: "AVG(today − lost_at) WHERE status='lost'",
          }}
        />
        {/* D4 — reunification rate over the selected period (benchmark: TARGETS.REUNIFICATION_PCT). */}
        <OpKpi
          label="Tasa de reunificación"
          value={formatPercent(reunification.ratePct)}
          tone={toneForTarget(reunification.ratePct, TARGETS.REUNIFICATION_PCT)}
          bar={reunification.ratePct}
          sub={`meta ${TARGETS.REUNIFICATION_PCT}% · ${reunification.recovered} de ${reunification.lostEpisodes} episodios`}
          info={{
            definition: `Porcentaje de episodios de pérdida que terminaron en reunificación con el dueño/a. Benchmark internacional: ${TARGETS.REUNIFICATION_PCT}% (UK RSPCA).`,
            formula:
              "COUNT(episodios_lost → status='active') / COUNT(all lost episodes en período) × 100",
          }}
        />
        <OpKpi
          label="Mediana recuperación (días)"
          value={String(reunification.medianDaysToRecovery)}
          info={{
            definition:
              "Mediana de días entre la apertura del episodio de pérdida y su resolución (reunificación). Menor es mejor.",
            formula: "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_recovery)",
          }}
        />
      </section>

      {/* Map panel */}
      <OpCard aria-labelledby={panelMapId}>
        <OpCardHead title={<span id={panelMapId}>Episodios por jurisdicción</span>} />
        <OpCardBody>
          <MapChoroplethDynamic
            data={choroplethData}
            scaleLabel="Mascotas perdidas"
            fallbackTableLabel="Mascotas perdidas por provincia"
          />
        </OpCardBody>
      </OpCard>

      {/* Search form */}
      <form action="/gob/perdidas" method="get" className="flex items-center gap-2">
        {/* Preserve other active searchParams so the form doesn't reset period/species */}
        {sp.period && <input type="hidden" name="period" value={sp.period} />}
        {sp.species && <input type="hidden" name="species" value={sp.species} />}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <LnInput
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre de mascota o dueño/a"
          className="flex-1"
          aria-label="Buscar mascotas"
        />
        <OpButton type="submit" variant="primary" size="sm" className="whitespace-nowrap">
          Buscar
        </OpButton>
        {q && (
          <a
            href={`/gob/perdidas${sp.status ? `?status=${sp.status}` : ""}`}
            className="text-[13px] text-ln-op-mute hover:text-ln-op-ink underline underline-offset-2 whitespace-nowrap"
          >
            Limpiar
          </a>
        )}
      </form>

      {/* Status tabs + list panel */}
      <Suspense>
        <UrlTabs
          paramKey="status"
          defaultValue="lost"
          tabs={STATUS_TABS}
          aria-label="Filtrar por estado"
        >
          {STATUS_TABS.map((tab) => {
            const panelListId = `panel-perdidas-lista-${tab.value}`;
            return (
              <UrlTabsContent key={tab.value} value={tab.value}>
                <OpCard aria-labelledby={panelListId} className="mt-4">
                  <OpCardHead
                    title={
                      <span id={panelListId}>
                        {tab.value === "lost" && "Mascotas perdidas"}
                        {tab.value === "active" && "Mascotas recuperadas"}
                        {tab.value === "deceased" && "Mascotas fallecidas"}
                        {tab.value === "all" && "Todas las mascotas"} (
                        {/* When the list hits its 500 cap and the stock KPI is
                            larger, say "primeros 500 de N" so the header never
                            contradicts the "Perdidas activas" count above. */}
                        {tab.value === "lost" &&
                        !q &&
                        listSince === undefined &&
                        lostPets.length >= 500 &&
                        metrics.activeCount > lostPets.length
                          ? `primeros ${lostPets.length} de ${metrics.activeCount}`
                          : lostPets.length}
                        )
                        {q && (
                          <span className="ml-2 text-[11px] font-normal text-ln-op-mute">
                            {"—"} búsqueda: &ldquo;{q}&rdquo;
                          </span>
                        )}
                      </span>
                    }
                  />
                  <OpCardBody>
                    {lostPets.length === 0 ? (
                      <LnEmptyState
                        icon="search"
                        title="Sin resultados"
                        description={
                          q
                            ? `No se encontraron mascotas para "${q}" con el estado seleccionado.`
                            : "No hay mascotas con este estado en el periodo para tu cobertura."
                        }
                      />
                    ) : (
                      <ul className="space-y-2">
                        {lostPets.map((p) => (
                          <LostPetRowComponent
                            key={p.petId}
                            pet={p}
                            caseCode={caseCodesByPet.get(p.petId)}
                          />
                        ))}
                      </ul>
                    )}
                  </OpCardBody>
                </OpCard>
              </UrlTabsContent>
            );
          })}
        </UrlTabs>
      </Suspense>

      <DashboardFreshnessFooter ctx={reunificationCtx} />
    </div>
  );
}
