import {
  EmptyState,
  JurisdictionSwitcher,
  MapChoropleth,
  MetricCard,
  Panel,
  PanelBody,
  PanelHeader,
  PeriodPicker,
} from "@/components/poncho";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import {
  type LostPetRow,
  PROVINCE_ISO_MAP,
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

export default async function GobPerdidasPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    species?: string;
    // TODO(E3-followup): status filter (active/recovered/all chips) and search
    // are not yet forwarded to fetchLostPets — the fetcher always returns
    // status='lost' pets. Extend fetchLostPets when the follow-up lands.
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };

  const sp = await searchParams;
  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const species = sp.species || undefined;

  const [metrics, lostPets] = await Promise.all([
    fetchPerdidasMetrics(actor, jurisdictions),
    fetchLostPets(actor, jurisdictions, { since, species }),
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
  const panelListId = "panel-perdidas-lista-titulo";

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
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
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

        {/* Map + list panels */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel aria-labelledby={panelMapId}>
            <PanelHeader title={<span id={panelMapId}>Episodios por jurisdicción</span>} />
            <PanelBody>
              <MapChoropleth data={choroplethData} />
            </PanelBody>
          </Panel>

          <Panel aria-labelledby={panelListId}>
            <PanelHeader
              title={<span id={panelListId}>Mascotas perdidas ({lostPets.length})</span>}
            />
            <PanelBody>
              {lostPets.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No hay episodios activos"
                  description="No hay mascotas perdidas en este período para tu cobertura."
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
        </div>
      </div>
    </main>
  );
}
