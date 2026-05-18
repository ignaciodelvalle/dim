import Link from "next/link";

import { db, fosterProposals, organizationMemberships, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { EndFosterButton } from "./EndFosterButton";

type FosterKind = "pool" | "member" | "vecino";

export default async function OrgTransitosPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  // Find active foster rows for pets that this org currently holds via
  // shelter_custody. We do it in two steps: first the org's pets, then
  // active fosters on those pets.
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

  if (orgPets.length === 0) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-3xl mx-auto pt-10">
          <header className="mb-4">
            <h1 className="text-2xl font-semibold">Tránsitos activos</h1>
          </header>
          <p className="text-sm text-neutral-500">No tenés mascotas en custodia.</p>
        </div>
      </main>
    );
  }

  const petIds = orgPets.map((p) => p.id);
  const fosters = await db
    .select({
      ownership: ownerships,
      foster: profiles,
    })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        inArray(ownerships.petId, petIds),
        eq(ownerships.role, "foster"),
        isNull(ownerships.endedAt),
      ),
    );

  // Classify each foster's source:
  //   - pool: a foster_proposals row with status='accepted' and
  //           resolved_ownership_id linking back to this ownership.id
  //   - member: foster user is also an active org member
  //   - vecino: neither
  const fosterOwnershipIds = fosters.map((f) => f.ownership.id);
  const pooled = fosterOwnershipIds.length
    ? await db
        .select({ resolvedOwnershipId: fosterProposals.resolvedOwnershipId })
        .from(fosterProposals)
        .where(
          and(
            inArray(fosterProposals.resolvedOwnershipId, fosterOwnershipIds),
            eq(fosterProposals.status, "accepted"),
          ),
        )
    : [];
  const pooledSet = new Set(pooled.map((p) => p.resolvedOwnershipId).filter(Boolean) as string[]);

  const fosterUserIds = fosters.map((f) => f.foster.id);
  const memberships = fosterUserIds.length
    ? await db
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            inArray(organizationMemberships.userId, fosterUserIds),
            eq(organizationMemberships.organizationId, organization.id),
            isNull(organizationMemberships.leftAt),
          ),
        )
    : [];
  const memberSet = new Set(memberships.map((m) => m.userId));

  const petMap = new Map(orgPets.map((p) => [p.id, p]));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Tránsitos activos
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Mascotas que tu organización tiene en custodia y que están bajo el cuidado de alguien
            (voluntario pool, miembro de la org o vecino).
          </p>
        </header>

        {fosters.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">
            Ninguna de tus mascotas tiene tránsito activo.{" "}
            <Link
              href={`/org/${orgToken}/voluntarios`}
              className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Buscar voluntarios
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {fosters.map(({ ownership, foster }) => {
              const pet = petMap.get(ownership.petId);
              if (!pet) return null;
              const kind: FosterKind = pooledSet.has(ownership.id)
                ? "pool"
                : memberSet.has(foster.id)
                  ? "member"
                  : "vecino";
              return (
                <li
                  key={ownership.id}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {pet.name}{" "}
                        <span className="text-neutral-500 font-normal">→ {foster.displayName}</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {pet.species} · tipo: <KindBadge kind={kind} /> · iniciado{" "}
                        {new Date(ownership.startedAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {ownership.allowCoFoster && (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {" "}
                            · acepta co-foster
                          </span>
                        )}
                      </p>
                    </div>
                    <EndFosterButton orgToken={orgToken} publicToken={pet.publicToken} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function KindBadge({ kind }: { kind: FosterKind }) {
  const labels: Record<FosterKind, string> = {
    pool: "voluntario pool",
    member: "miembro",
    vecino: "vecino-tránsito",
  };
  return <span className="font-medium">{labels[kind]}</span>;
}
