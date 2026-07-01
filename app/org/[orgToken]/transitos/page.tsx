// Org transits hub — two tabs driven by ?tab= search param:
//   activos (default): active foster rows (endedAt IS NULL) for this org's pets.
//   historial:         ended foster rows (endedAt IS NOT NULL) ordered desc.

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { db, fosterProposals, organizationMemberships, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { formatDate } from "@/lib/utils/format";

import { EndFosterButton } from "./EndFosterButton";

type FosterKind = "pool" | "member" | "vecino";
type TabKey = "activos" | "historial";

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
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgToken } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab: TabKey = tabParam === "historial" ? "historial" : "activos";

  const { organization } = await requireOrgAccessByToken(orgToken);

  // Find all pets this org ever held via shelter_custody (active + ended),
  // so historial can reach past pets too.
  const orgPets = await db
    .select({ id: pets.id, publicToken: pets.publicToken, name: pets.name, species: pets.species })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(eq(ownerships.ownerOrganizationId, organization.id));

  const petIds = [...new Set(orgPets.map((p) => p.id))];
  const petMap = new Map(orgPets.map((p) => [p.id, p]));

  // Fosters: active vs ended depending on tab.
  const fosters =
    petIds.length === 0
      ? []
      : activeTab === "activos"
        ? await db
            .select({ ownership: ownerships, foster: profiles })
            .from(ownerships)
            .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
            .where(
              and(
                inArray(ownerships.petId, petIds),
                eq(ownerships.role, "foster"),
                isNull(ownerships.endedAt),
              ),
            )
        : await db
            .select({ ownership: ownerships, foster: profiles })
            .from(ownerships)
            .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
            .where(
              and(
                inArray(ownerships.petId, petIds),
                eq(ownerships.role, "foster"),
                isNotNull(ownerships.endedAt),
              ),
            )
            .orderBy(desc(ownerships.endedAt))
            .limit(200);

  // Classify source (pool / member / vecino) — only needed for activos display.
  const fosterOwnershipIds = fosters.map((f) => f.ownership.id);
  const pooled =
    activeTab === "activos" && fosterOwnershipIds.length
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
  const memberships =
    activeTab === "activos" && fosterUserIds.length
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Tránsitos</h1>
        <p className="text-[13px] text-ln-op-mute">
          Mascotas bajo cuidado de voluntarios, miembros o vecinos de la organización.
        </p>
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-ln-op-line">
        {(["activos", "historial"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "activos" ? "Activos" : "Historial";
          return (
            <Link
              key={tab}
              href={`/org/${orgToken}/transitos?tab=${tab}`}
              className={`px-4 py-2 text-[13px] font-medium no-underline border-b-2 transition-colors ${
                isActive
                  ? "border-ln-op-azul text-ln-op-azul"
                  : "border-transparent text-ln-op-mute hover:text-ln-op-ink-2"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "activos" && fosters.length === 0 && (
        <p className="text-[13px] text-ln-op-mute py-6 text-center">
          Ninguna mascota tiene tránsito activo.{" "}
          <Link
            href={`/org/${orgToken}/voluntarios`}
            className="text-ln-op-azul hover:underline no-underline"
          >
            Buscar voluntarios
          </Link>
        </p>
      )}

      {activeTab === "historial" && fosters.length === 0 && (
        <LnEmptyState icon="huella" title="Todavía no hay tránsitos finalizados." />
      )}

      {fosters.length > 0 && activeTab === "activos" && (
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
                        <p className="text-sm text-ln-op-mute">
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

      {fosters.length > 0 && activeTab === "historial" && (
        <OpCard>
          <OpCardHead
            title="Tránsitos finalizados"
            actions={`${fosters.length} registro${fosters.length !== 1 ? "s" : ""}`}
          />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line">
              {fosters.map(({ ownership, foster }) => {
                const pet = petMap.get(ownership.petId);
                if (!pet) return null;
                return (
                  <li key={ownership.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-[13px] font-medium text-ln-op-ink">
                          {pet.name}{" "}
                          <span className="text-ln-op-mute font-normal">
                            → {foster.displayName}
                          </span>
                        </p>
                        <p className="text-sm text-ln-op-mute">
                          {pet.species} · {formatDate(ownership.startedAt)}
                          {ownership.endedAt ? ` – ${formatDate(ownership.endedAt)}` : ""}
                        </p>
                      </div>
                      <Link
                        href={`/org/${orgToken}/mascotas/${pet.publicToken}`}
                        className="shrink-0 rounded-[6px] border border-ln-op-line px-3 py-1.5 text-sm text-ln-op-ink hover:bg-ln-op-stripe transition-colors no-underline"
                      >
                        Ver ficha
                      </Link>
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
