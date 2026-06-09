import { Suspense } from "react";

import {
  EmptyState,
  Input,
  JurisdictionSwitcher,
  MapChoropleth,
  PeriodPicker,
  type TabItem,
  Tabs,
  TabsContent,
} from "@/components/poncho";
import { OpCard, OpCardBody, OpCardHead, OpKpi } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type LostPetRow,
  PROVINCE_ISO_MAP,
  type PetStatusFilter,
  fetchLostPets,
  fetchPerdidasMetrics,
} from "@/lib/govt-dashboards";
import { LostPetRow as LostPetRowComponent } from "./_components/LostPetRow";

// All Argentine provinces for admin users. Govt users get a derived subset.
const ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
];

/**
 * Aggregate lost pets by province for the choropleth map.
 * Groups LostPetRow[] by province -> ISO code via PROVINCE_ISO_MAP.
 */
function aggregateLostByProvince(
  lost: LostPetRow[],
): Array<{ code: string; value: number; label: string }> {
  const codeToCount = new Map<string, number>();
  for (const p of lost) {
    if (!p.province) continue;
    const code = PROVINCE_ISO_MAP[p.province];
    if (!code) continue;
    codeToCount.set(code, (codeToCount.get(code) ?? 0) + 1);
  }
  return Array.from(codeToCount.entries()).map(([code, value]) => ({
    code,
    value,
    label: `${value} mascota${value !== 1 ? "s" : ""} perdida${value !== 1 ? "s" : ""}`,
  }));
}

const VALID_STATUSES: PetStatusFilter[] = ["all", "lost", "active", "deceased"];

function parseStatusFilter(raw: string | undefined): PetStatusFilter {
  if (!raw) return "lost";
  return (VALID_STATUSES as string[]).includes(raw) ? (raw as PetStatusFilter) : "lost";
}

const STATUS_TABS: TabItem[] = [
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
  const species = sp.species || undefined;
  const statusFilter = parseStatusFilter(sp.status);
  const q = sp.q?.trim() || undefined;

  const [metrics, lostPets] = await Promise.all([
    fetchPerdidasMetrics(actor, jurisdictions),
    fetchLostPets(actor, jurisdictions, { since, species, status: statusFilter, q }),
  ]);

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  // Build allowedProvinces for <JurisdictionSwitcher>.
  const allowedProvinces =
    profile.role === "admin"
      ? ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const choroplethData = aggregateLostByProvince(lostPets);

  const panelMapId = "panel-perdidas-mapa-titulo";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Perdidas
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Mascotas perdidas</h1>
        <p className="text-[13px] text-ln-op-mute">
          Mascotas marcadas como perdidas dentro de tu cobertura.
        </p>
      </header>

      {/* No-scope warning */}
      {noScope && (
        <div className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-3 text-[13px] text-ln-op-warn">
          Tu cuenta no tiene localidades asignadas. Pedile a un administrador que te asigne al menos
          una.
        </div>
      )}

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* 3 KPI cards */}
      <section
        aria-label="Indicadores de perdidas"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <OpKpi
          label="Activas"
          value={String(metrics.activeCount)}
          tone={metrics.activeCount > 0 ? "warn" : "ok"}
        />
        <OpKpi label="Recuperados (30d)" value={String(metrics.recoveredMonth)} tone="ok" />
        <OpKpi label="Antiguedad media (dias)" value={String(metrics.avgDaysActive)} />
      </section>

      {/* Map panel */}
      <OpCard aria-labelledby={panelMapId}>
        <OpCardHead title={<span id={panelMapId}>Episodios por jurisdiccion</span>} />
        <OpCardBody>
          <MapChoropleth data={choroplethData} />
        </OpCardBody>
      </OpCard>

      {/* Search form */}
      <form action="/gob/perdidas" method="get" className="flex items-center gap-2">
        {/* Preserve other active searchParams so the form doesn't reset period/species */}
        {sp.period && <input type="hidden" name="period" value={sp.period} />}
        {sp.species && <input type="hidden" name="species" value={sp.species} />}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre de mascota o dueno/a"
          className="flex-1"
          aria-label="Buscar mascotas"
        />
        <button
          type="submit"
          className="text-[13px] px-3 py-1.5 rounded-[6px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700 transition-colors whitespace-nowrap"
        >
          Buscar
        </button>
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
        <Tabs
          paramKey="status"
          defaultValue="lost"
          tabs={STATUS_TABS}
          aria-label="Filtrar por estado"
        >
          {STATUS_TABS.map((tab) => {
            const panelListId = `panel-perdidas-lista-${tab.value}`;
            return (
              <TabsContent key={tab.value} value={tab.value}>
                <OpCard aria-labelledby={panelListId} className="mt-4">
                  <OpCardHead
                    title={
                      <span id={panelListId}>
                        {tab.value === "lost" && "Mascotas perdidas"}
                        {tab.value === "active" && "Mascotas recuperadas"}
                        {tab.value === "deceased" && "Mascotas fallecidas"}
                        {tab.value === "all" && "Todas las mascotas"} ({lostPets.length})
                        {q && (
                          <span className="ml-2 text-[11px] font-normal text-ln-op-mute">
                            {"—"} busqueda: &ldquo;{q}&rdquo;
                          </span>
                        )}
                      </span>
                    }
                  />
                  <OpCardBody>
                    {lostPets.length === 0 ? (
                      <EmptyState
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
                          <LostPetRowComponent key={p.petId} pet={p} />
                        ))}
                      </ul>
                    )}
                  </OpCardBody>
                </OpCard>
              </TabsContent>
            );
          })}
        </Tabs>
      </Suspense>
    </div>
  );
}
