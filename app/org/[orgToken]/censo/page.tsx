// Org census page — shelter census & occupancy view (Wave 3 Item 16).
//
// Shows a breakdown of animals currently in shelter_custody per species,
// with optional occupancy % when capacity has been declared.
//
// Gated by intake.create capability (shelter-type orgs only, per spec D2 edge).

import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpCrumbs, OpKpi } from "@/components/ui/dashboard";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { computeOccupancyBreakdown, fetchOrgCensus } from "@/lib/org-census";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

// Shelters and rescue networks are the only org types where occupancy is meaningful.
const SHELTER_TYPES = new Set(["shelter", "rescue_network"]);

export default async function OrgCensoPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  const canIntake = granted.has("intake.create") || membership.role === "admin";

  // Non-shelter orgs or users without intake.create capability see a not-applicable notice.
  const isShelterOrg = SHELTER_TYPES.has(organization.orgType);
  if (!isShelterOrg || !canIntake) {
    return (
      <div className="space-y-6">
        <OpCrumbs items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Censo" }]} />
        <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-6 text-[13px] text-ln-op-mute">
          El censo de ocupación solo está disponible para refugios y redes de rescate con acceso a
          ingresos.
        </div>
      </div>
    );
  }

  const capacity = {
    capacityDogs: organization.capacityDogs ?? null,
    capacityCats: organization.capacityCats ?? null,
    capacityOther: organization.capacityOther ?? null,
    capacityTotal: organization.capacityTotal ?? null,
  };

  const census = await fetchOrgCensus(organization.id);
  const breakdown = computeOccupancyBreakdown(census, capacity);

  // Tone based on occupancy state.
  function kpiTone(slot: { overCapacity: boolean; pct: number | null }) {
    if (slot.overCapacity) return "danger" as const;
    if (slot.pct !== null && slot.pct >= 90) return "warn" as const;
    return "neutral" as const;
  }

  function kpiValue(slot: { count: number; pct: number | null; capacity: number | null }) {
    if (slot.pct !== null) return `${slot.count} / ${slot.capacity} (${slot.pct}%)`;
    return String(slot.count);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <OpCrumbs items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Censo" }]} />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Censo de animales</h1>
        <p className="text-[13px] text-ln-op-mute">
          Animales actualmente en custodia de{" "}
          <strong className="text-ln-op-ink-2">{organization.displayName}</strong>.
        </p>
      </div>

      {/* Over-capacity warning */}
      {breakdown.anyOverCapacity && (
        <div
          role="alert"
          className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-4 py-3 text-[13px] text-ln-op-danger font-medium"
        >
          Sobre capacidad — la organización tiene más animales de los que declaró como capacidad
          máxima. Esto no bloquea nuevos ingresos, es solo informativo.
        </div>
      )}

      {/* Census KPI grid */}
      <section aria-label="Ocupación por especie" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <OpKpi
          label="Perros"
          value={kpiValue(breakdown.dogs)}
          tone={kpiTone(breakdown.dogs)}
          href={`/org/${orgToken}/mascotas?species=dog`}
        />
        <OpKpi
          label="Gatos"
          value={kpiValue(breakdown.cats)}
          tone={kpiTone(breakdown.cats)}
          href={`/org/${orgToken}/mascotas?species=cat`}
        />
        <OpKpi
          label="Otros"
          value={kpiValue(breakdown.other)}
          tone={kpiTone(breakdown.other)}
          href={`/org/${orgToken}/mascotas?species=other`}
        />
        <OpKpi
          label="Total"
          value={kpiValue(breakdown.total)}
          tone={kpiTone(breakdown.total)}
          href={`/org/${orgToken}/mascotas`}
        />
      </section>

      {/* No capacity declared — CTA */}
      {breakdown.noCapacityDeclared && (
        <OpCard>
          <OpCardBody>
            <p className="text-[13px] text-ln-op-mute">
              No declaraste capacidad para esta organización. Declarar la capacidad te permite ver
              el porcentaje de ocupación y recibir alertas cuando estés llegando al límite.
            </p>
            <Link
              href={`/org/${orgToken}/configuracion`}
              className="mt-3 inline-block text-[13px] font-medium text-ln-op-azul hover:underline no-underline"
            >
              Declarar capacidad →
            </Link>
          </OpCardBody>
        </OpCard>
      )}

      {/* Detail breakdown */}
      <OpCard>
        <OpCardHead title="Desglose por especie" />
        <OpCardBody className="p-0">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Desglose de animales en custodia por especie</caption>
            <thead>
              <tr className="border-b border-ln-op-line text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                <th scope="col" className="px-4 py-2 text-left">
                  Especie
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  En custodia
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  Capacidad
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  Ocupación
                </th>
                <th scope="col" className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ln-op-line">
              {(
                [
                  { label: "Perros", slot: breakdown.dogs, species: "dog" },
                  { label: "Gatos", slot: breakdown.cats, species: "cat" },
                  { label: "Otros", slot: breakdown.other, species: "other" },
                ] as const
              ).map(({ label, slot, species }) => (
                <tr key={species}>
                  <td className="px-4 py-3 font-medium text-ln-op-ink">{label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{slot.count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ln-op-mute">
                    {slot.capacity ?? "—"}
                  </td>
                  <td
                    className={[
                      "px-4 py-3 text-right tabular-nums font-medium",
                      slot.overCapacity
                        ? "text-ln-op-danger"
                        : slot.pct !== null && slot.pct >= 90
                          ? "text-ln-op-warn"
                          : "text-ln-op-ink",
                    ].join(" ")}
                  >
                    {slot.pct !== null ? `${slot.pct}%` : "—"}
                    {slot.overCapacity && (
                      <span className="ml-1 text-[10px] font-bold">SOBRE CAP.</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/org/${orgToken}/mascotas?species=${species}`}
                      className="text-[12px] text-ln-op-azul hover:underline no-underline"
                    >
                      Ver listado →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </OpCardBody>
      </OpCard>
    </div>
  );
}
