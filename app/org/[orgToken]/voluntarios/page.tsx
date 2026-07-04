import { JurisdictionFilter } from "@/components/JurisdictionFilter";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { speciesLabel } from "@/lib/utils/format";
import { searchFosterVolunteers } from "@/src/modules/foster/actions";
import { and, eq, isNull } from "drizzle-orm";

import { VolunteerRow } from "./VolunteerRow";

export default async function VoluntariosPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ species?: string; province?: string; locality?: string; pet?: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  const filters = await searchParams;
  const species =
    filters.species === "dog" || filters.species === "cat" || filters.species === "other"
      ? filters.species
      : undefined;

  // #815 audit finding #15: previously requested a bare limit: 50 with no
  // truncation signal. Fetch one extra row (51) and slice back to 50 so a
  // pool larger than the page size gets a visible notice instead of a
  // silent cutoff (same fetch-N+1 pattern as adopciones/page.tsx).
  const VOLUNTEER_PAGE_SIZE = 50;
  const result = await searchFosterVolunteers({
    orgToken,
    species,
    province: filters.province ?? null,
    locality: filters.locality ?? null,
    petPublicToken: filters.pet ?? null,
    limit: VOLUNTEER_PAGE_SIZE + 1,
  });

  // Pets currently in shelter_custody by this org — used for the "propose" pet picker.
  const orgPets = await db
    .select({ id: pets.id, publicToken: pets.publicToken, name: pets.name, species: pets.species })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    );

  if ("error" in result) {
    return (
      <div className="space-y-6">
        <p className="text-[13px] text-ln-op-danger">{result.error}</p>
      </div>
    );
  }

  const truncated = result.rows.length > VOLUNTEER_PAGE_SIZE;
  const visibleRows = truncated ? result.rows.slice(0, VOLUNTEER_PAGE_SIZE) : result.rows;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Voluntarios</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Pool de voluntarios</h1>
        <p className="mt-1 text-[13px] text-ln-op-mute">
          Voluntarios activos con al menos un slot disponible.
        </p>
      </header>

      {/* Tab bar — Pool is this page; Propuestas links to the subroute */}
      <nav className="flex gap-1 border-b border-ln-op-line">
        <span
          className="px-4 py-2 text-[13px] font-medium border-b-2 border-ln-op-azul text-ln-op-azul"
          aria-current="page"
        >
          Pool
        </span>
        <a
          href={`/org/${orgToken}/voluntarios/propuestas`}
          className="px-4 py-2 text-[13px] font-medium no-underline border-b-2 border-transparent text-ln-op-mute hover:text-ln-op-ink-2 transition-colors"
        >
          Propuestas
        </a>
      </nav>

      <form
        action={`/org/${orgToken}/voluntarios`}
        method="GET"
        className="flex flex-wrap gap-3 items-end"
      >
        <div>
          <label
            htmlFor="filter-species"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
          >
            Especie
          </label>
          <select
            id="filter-species"
            name="species"
            defaultValue={filters.species ?? ""}
            className="rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">Todas</option>
            <option value="dog">Perros</option>
            <option value="cat">Gatos</option>
            <option value="other">Otras</option>
          </select>
        </div>
        <JurisdictionFilter
          provinceParam="province"
          localityParam="locality"
          defaultProvince={filters.province ?? ""}
          defaultLocality={filters.locality ?? ""}
          labelClassName="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
          selectClassName="rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <div>
          <label
            htmlFor="filter-pet"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
          >
            Match para
          </label>
          <select
            id="filter-pet"
            name="pet"
            defaultValue={filters.pet ?? ""}
            className="rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          >
            <option value="">— sin mascota —</option>
            {orgPets.map((p) => (
              <option key={p.id} value={p.publicToken}>
                {p.name} ({speciesLabel(p.species)})
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-[4px] bg-ln-op-azul px-4 py-[7px] text-sm font-semibold text-white transition-colors hover:bg-ln-op-azul-700"
        >
          Filtrar
        </button>
      </form>

      {visibleRows.length === 0 && (
        <LnEmptyState icon="usuarios" title="No hay voluntarios que coincidan." />
      )}

      <ul className="space-y-2">
        {visibleRows.map((row) => (
          <VolunteerRow
            key={row.userId}
            row={row}
            orgToken={orgToken}
            orgPets={orgPets}
            preselectedPetToken={filters.pet ?? null}
          />
        ))}
      </ul>

      {truncated && (
        <p className="text-sm text-ln-op-mute">
          Mostrando los primeros {VOLUNTEER_PAGE_SIZE}. Hay más — usá los filtros de arriba para
          acotar la búsqueda.
        </p>
      )}
    </div>
  );
}
