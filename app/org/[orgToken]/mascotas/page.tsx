// Pets currently held by the active organization. Lists every active
// ownership row where owner_organization_id = active org. Multiple custody
// rows on the same pet (e.g. shelter_custody + foster) collapse to one card
// — the highest-stakes role wins for the badge.
//
// Sprint 8 PR1: server data-fetcher only. List rendering moved to the
// OrgMascotasBulkList client component so multi-select + bulk vaccination
// can be wired with useState/useTransition.

import { db, ownerships, petEvents, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Link from "next/link";

import { OrgMascotasBulkList } from "./OrgMascotasBulkList";

const ROLE_PRIORITY: Record<string, number> = {
  owner: 4,
  shelter_custody: 3,
  foster: 2,
  co_owner: 1,
  caretaker: 0,
};

export default async function OrgMascotasPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{
    nueva?: string;
    foster?: string;
    fostend?: string;
    adopcion?: string;
    transferido?: string;
  }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  const canIntake = granted.has("intake.create");
  const canAssignFoster = granted.has("foster.assign");
  const canEndFoster = granted.has("foster.end");
  const canFinalizeAdoption = granted.has("adoption.finalize");
  const canTransfer = granted.has("custody.transfer");
  const canReturnToOwner = granted.has("custody.transfer");
  const canManageAdoptionListing = granted.has("adoption.listing.manage");
  const canEventWrite = granted.has("event.write");
  const canRead = granted.has("pet.read_held") || membership.role === "admin";

  if (!canRead) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para ver el listado de animales necesitás el permiso{" "}
            <code className="text-xs">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  const orgRows = await db
    .select({ pet: pets, ownershipRole: ownerships.role, startedAt: ownerships.startedAt })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(and(eq(ownerships.ownerOrganizationId, organization.id), isNull(ownerships.endedAt)));

  // Collapse multi-custody rows: keep the highest-priority role per pet.
  const byPetId = new Map<string, (typeof orgRows)[number]>();
  for (const row of orgRows) {
    const existing = byPetId.get(row.pet.id);
    if (
      !existing ||
      (ROLE_PRIORITY[row.ownershipRole] ?? -1) > (ROLE_PRIORITY[existing.ownershipRole] ?? -1)
    ) {
      byPetId.set(row.pet.id, row);
    }
  }
  const cards = Array.from(byPetId.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  // Which of these pets already have an active foster row? Foster rows have
  // owner_user_id set (NOT owner_organization_id), so they don't show up in
  // the org-join above. Separate query, scoped to the same pet IDs.
  const petIds = cards.map((c) => c.pet.id);
  const fosteredPetIds = new Set<string>();
  if (petIds.length > 0) {
    const fosterRows = await db
      .select({ petId: ownerships.petId })
      .from(ownerships)
      .where(
        and(
          inArray(ownerships.petId, petIds),
          eq(ownerships.role, "foster"),
          isNull(ownerships.endedAt),
        ),
      );
    for (const row of fosterRows) fosteredPetIds.add(row.petId);
  }

  // Which lost pets with shelter_custody already have a pending return proposal?
  // A proposal is pending if there is no subsequent custody_transferred event.
  const pendingProposalPetIds = new Set<string>();
  if (petIds.length > 0) {
    const lostPetIds = cards
      .filter((c) => c.pet.status === "lost" && c.ownershipRole === "shelter_custody")
      .map((c) => c.pet.id);

    if (lostPetIds.length > 0) {
      for (const petId of lostPetIds) {
        const [latestProposal] = await db
          .select({ id: petEvents.id, occurredAt: petEvents.occurredAt })
          .from(petEvents)
          .where(
            and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")),
          )
          .orderBy(desc(petEvents.occurredAt))
          .limit(1);

        if (latestProposal) {
          const [subsequentTransfer] = await db
            .select({ id: petEvents.id })
            .from(petEvents)
            .where(
              and(
                eq(petEvents.petId, petId),
                eq(petEvents.eventType, "custody_transferred"),
                gt(petEvents.occurredAt, latestProposal.occurredAt),
              ),
            )
            .limit(1);
          if (!subsequentTransfer) pendingProposalPetIds.add(petId);
        }
      }
    }
  }

  const sp = await searchParams;
  const recentlyCreated = sp.nueva ?? null;
  const recentlyFostered = sp.foster ?? null;
  const recentlyFosterEnded = sp.fostend ?? null;
  const recentlyAdopted = sp.adopcion ?? null;
  const recentlyTransferred = sp.transferido ?? null;

  // Serialize Sets to arrays — client components cannot receive Set instances
  // as props (not serializable across the Server/Client boundary).
  const fosteredPetIdsArray = Array.from(fosteredPetIds);
  const pendingProposalPetIdsArray = Array.from(pendingProposalPetIds);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-gob-text-muted">
              {organization.displayName}
            </p>
            <h1 className="text-3xl font-semibold">Animales en custodia</h1>
            <p className="text-sm text-gob-text-gray ">
              {cards.length === 0
                ? "Todavía no hay animales registrados a nombre de la organización."
                : `${cards.length} animal${cards.length === 1 ? "" : "es"} bajo custodia activa.`}
            </p>
          </div>
          {canIntake && (
            <Link
              href={`/org/${orgToken}/intake`}
              className="px-4 py-2 rounded bg-gob-primary text-white   text-sm"
            >
              Registrar ingreso
            </Link>
          )}
        </header>

        {recentlyCreated && (
          <p className="text-sm rounded border border-gob-success bg-gob-success/10 px-3 py-2 text-gob-success   ">
            Ingreso registrado. Token público: <code>{recentlyCreated}</code>.
          </p>
        )}
        {recentlyFostered && (
          <p className="text-sm rounded border border-gob-info bg-gob-info/10 px-3 py-2 text-gob-azul-link   ">
            Tránsito asignado para <code>{recentlyFostered}</code>.
          </p>
        )}
        {recentlyFosterEnded && (
          <p className="text-sm rounded border border-gob-border-strong bg-gob-surface-alt px-3 py-2 text-gob-text   ">
            Tránsito cerrado para <code>{recentlyFosterEnded}</code>.
          </p>
        )}
        {recentlyTransferred && (
          <p className="text-sm rounded border border-gob-border-strong bg-gob-surface-alt px-3 py-2 text-gob-text   ">
            Custodia transferida para <code>{recentlyTransferred}</code>. El animal sale del listado
            y aparece en el destino.
          </p>
        )}
        {recentlyAdopted && (
          <p className="text-sm rounded border border-gob-success bg-gob-success/10 px-3 py-2 text-gob-success   ">
            Adopción finalizada para <code>{recentlyAdopted}</code>. El animal pasa a un nuevo dueño
            y sale del listado de custodia.
          </p>
        )}

        <OrgMascotasBulkList
          cards={cards.map((c) => ({
            petId: c.pet.id,
            publicToken: c.pet.publicToken,
            name: c.pet.name,
            species: c.pet.species,
            breed: c.pet.breed ?? null,
            color: c.pet.color ?? null,
            dateOfBirth: c.pet.dateOfBirth ?? null,
            birthDateIsEstimated: c.pet.birthDateIsEstimated,
            status: c.pet.status,
            adoptionEligible: c.pet.adoptionEligible ?? null,
            adoptionListedAt: c.pet.adoptionListedAt ? c.pet.adoptionListedAt.toISOString() : null,
            adoptionListingPausedAt: c.pet.adoptionListingPausedAt
              ? c.pet.adoptionListingPausedAt.toISOString()
              : null,
            ownershipRole: c.ownershipRole,
            startedAt: c.startedAt.toISOString(),
          }))}
          fosteredPetIds={fosteredPetIdsArray}
          pendingProposalPetIds={pendingProposalPetIdsArray}
          orgToken={orgToken}
          canIntake={canIntake}
          canAssignFoster={canAssignFoster}
          canEndFoster={canEndFoster}
          canFinalizeAdoption={canFinalizeAdoption}
          canTransfer={canTransfer}
          canReturnToOwner={canReturnToOwner}
          canManageAdoptionListing={canManageAdoptionListing}
          canEventWrite={canEventWrite}
        />

        <footer className="pt-4 border-t border-gob-border ">
          <Link href={`/org/${orgToken}`} className="text-sm text-gob-text-gray underline ">
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
