import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";

import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { db, fosterProposals, organizationMemberships, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

import { EndFosterButton } from "./EndFosterButton";

type FosterKind = "pool" | "member" | "vecino";

const KIND_PILL_TONE: Record<FosterKind, "ok" | "open" | "neutral"> = {
  pool: "ok",
  member: "open",
  vecino: "neutral",
};

const KIND_LABEL: Record<FosterKind, string> = {
  pool: "Voluntario pool",
  member: "Miembro",
  vecino: "Vecino-tránsito",
};

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
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Tránsitos activos</h1>
        </header>
        <p className="text-[13px] text-ln-op-mute">No tenés mascotas en custodia.</p>
      </div>
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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Tránsitos activos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Mascotas que tu organización tiene en custodia y que están bajo el cuidado de alguien
          (voluntario pool, miembro de la org o vecino).
        </p>
      </header>

      {fosters.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute py-6 text-center">
          Ninguna de tus mascotas tiene tránsito activo.{" "}
          <Link
            href={`/org/${orgToken}/voluntarios`}
            className="text-ln-op-azul hover:underline no-underline"
          >
            Buscar voluntarios
          </Link>
        </p>
      ) : (
        <OpCard>
          <OpCardHead
            title="Tránsitos en curso"
            actions={`${fosters.length} activo${fosters.length !== 1 ? "s" : ""}`}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {fosters.map(({ ownership, foster }) => {
                const pet = petMap.get(ownership.petId);
                if (!pet) return null;
                const kind: FosterKind = pooledSet.has(ownership.id)
                  ? "pool"
                  : memberSet.has(foster.id)
                    ? "member"
                    : "vecino";
                return (
                  <li key={ownership.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-[13px] font-medium text-ln-op-ink">
                          {pet.name}{" "}
                          <span className="text-ln-op-mute font-normal">
                            → {foster.displayName}
                          </span>
                        </p>
                        <p className="text-[12px] text-ln-op-mute">
                          {pet.species} · iniciado{" "}
                          {new Date(ownership.startedAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {ownership.allowCoFoster && (
                            <span className="text-ln-op-ok"> · acepta co-foster</span>
                          )}
                        </p>
                        <OpPill tone={KIND_PILL_TONE[kind]}>{KIND_LABEL[kind]}</OpPill>
                      </div>
                      <EndFosterButton orgToken={orgToken} publicToken={pet.publicToken} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
