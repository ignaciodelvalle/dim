import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
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

  const result = await searchFosterVolunteers({
    orgToken,
    species,
    province: filters.province ?? null,
    locality: filters.locality ?? null,
    petPublicToken: filters.pet ?? null,
    limit: 50,
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
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-4xl mx-auto pt-10">
          <p className="text-sm text-gob-danger">{result.error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-4xl mx-auto pt-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gob-text ">Pool de voluntarios</h1>
          <p className="mt-2 text-sm text-gob-text-gray ">
            Voluntarios activos con al menos un slot disponible.
          </p>
        </header>

        <form
          action={`/org/${orgToken}/voluntarios`}
          method="GET"
          className="flex flex-wrap gap-3 items-end"
        >
          <div>
            <label htmlFor="filter-species" className="block text-xs text-gob-text-muted mb-1">
              Especie
            </label>
            <select
              id="filter-species"
              name="species"
              defaultValue={filters.species ?? ""}
              className="px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
            >
              <option value="">Todas</option>
              <option value="dog">Perros</option>
              <option value="cat">Gatos</option>
              <option value="other">Otras</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-province" className="block text-xs text-gob-text-muted mb-1">
              Provincia
            </label>
            <input
              id="filter-province"
              type="text"
              name="province"
              defaultValue={filters.province ?? ""}
              className="px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-locality" className="block text-xs text-gob-text-muted mb-1">
              Localidad
            </label>
            <input
              id="filter-locality"
              type="text"
              name="locality"
              defaultValue={filters.locality ?? ""}
              className="px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-pet" className="block text-xs text-gob-text-muted mb-1">
              Match para
            </label>
            <select
              id="filter-pet"
              name="pet"
              defaultValue={filters.pet ?? ""}
              className="px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
            >
              <option value="">— sin mascota —</option>
              {orgPets.map((p) => (
                <option key={p.id} value={p.publicToken}>
                  {p.name} ({p.species})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-gob-primary  text-white  font-medium text-sm"
          >
            Filtrar
          </button>
        </form>

        {result.rows.length === 0 && (
          <p className="text-sm text-gob-text-muted py-8 text-center">
            No hay voluntarios que coincidan.
          </p>
        )}

        <ul className="space-y-2">
          {result.rows.map((row) => (
            <VolunteerRow
              key={row.userId}
              row={row}
              orgToken={orgToken}
              orgPets={orgPets}
              preselectedPetToken={filters.pet ?? null}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
