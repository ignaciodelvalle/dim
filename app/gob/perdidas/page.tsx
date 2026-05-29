import { Suspense } from "react";

import {
  EmptyState,
  Input,
  JurisdictionSwitcher,
  MapChoropleth,
  MetricCard,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
  type TabItem,
  Tabs,
  TabsContent,
} from "@/components/poncho";
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
 * Groups LostPetRow[] by province → ISO code via PROVINCE_ISO_MAP.
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
    <main className="px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">Pérdidas</h1>
          <p className="text-sm text-gob-text-gray">
            Mascotas marcadas como perdidas dentro de tu cobertura.
          </p>
        </header>

        {/* No-scope warning */}
        {noScope && (
          <div className="rounded-lg border border-gob-warning  bg-gob-warning/10  px-4 py-3 text-sm text-gob-warning-text ">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        {/* Filters row */}
        <div className="grid md:grid-cols-2 gap-3">
          <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={[]} />
          <PeriodPicker defaultPreset="30d" />
        </div>

        {/* 3 metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Activas"
            value={String(metrics.activeCount)}
            tone={metrics.activeCount > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            label="Recuperados (30d)"
            value={String(metrics.recoveredMonth)}
            tone="success"
          />
          <MetricCard
            label="Antigüedad media en días"
            value={String(metrics.avgDaysActive)}
            tone="neutral"
          />
        </div>

        {/* Map panel */}
        <Panel aria-labelledby={panelMapId}>
          <PanelHeader title={<span id={panelMapId}>Episodios por jurisdicción</span>} />
          <PanelBody>
            <MapChoropleth data={choroplethData} />
          </PanelBody>
        </Panel>

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
            placeholder="Buscar por nombre de mascota o dueño/a"
            className="flex-1"
            aria-label="Buscar mascotas"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-md bg-gob-primary text-white hover:opacity-90 whitespace-nowrap"
          >
            Buscar
          </button>
          {q && (
            <a
              href={`/gob/perdidas${sp.status ? `?status=${sp.status}` : ""}`}
              className="text-sm text-gob-text-gray hover:text-gob-text underline underline-offset-2 whitespace-nowrap"
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
                  <Panel aria-labelledby={panelListId} className="mt-4">
                    <PanelHeader
                      title={
                        <span id={panelListId}>
                          {tab.value === "lost" && "Mascotas perdidas"}
                          {tab.value === "active" && "Mascotas recuperadas"}
                          {tab.value === "deceased" && "Mascotas fallecidas"}
                          {tab.value === "all" && "Todas las mascotas"} ({lostPets.length})
                          {q && (
                            <span className="ml-2 text-xs font-normal text-gob-text-muted">
                              — búsqueda: &ldquo;{q}&rdquo;
                            </span>
                          )}
                        </span>
                      }
                    />
                    <PanelBody>
                      {lostPets.length === 0 ? (
                        <EmptyState
                          icon="search"
                          title="Sin resultados"
                          description={
                            q
                              ? `No se encontraron mascotas para "${q}" con el estado seleccionado.`
                              : "No hay mascotas con este estado en el período para tu cobertura."
                          }
                        />
                      ) : (
                        <ul className="space-y-2">
                          {lostPets.map((p) => (
                            <LostPetRowComponent key={p.petId} pet={p} />
                          ))}
                        </ul>
                      )}
                    </PanelBody>
                  </Panel>
                </TabsContent>
              );
            })}
          </Tabs>
        </Suspense>
      </div>
    </main>
  );
}
