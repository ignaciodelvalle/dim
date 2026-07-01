// Pets currently held by the active organization. Lists every active
// ownership row where owner_organization_id = active org. Multiple custody
// rows on the same pet (e.g. shelter_custody + foster) collapse to one card
// — the highest-stakes role wins for the badge.
//
// Sprint 8 PR1: server data-fetcher only. List rendering moved to the
// OrgMascotasBulkList client component so multi-select + bulk vaccination
// can be wired with useState/useTransition.

import { db, ownerships, petEvents, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { CopyButton } from "@/components/ui/CopyButton";
import { OpCallout, OpCrumbs } from "@/components/ui/dashboard";

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
      <main className="min-h-screen bg-ln-op-page p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Permiso requerido</h1>
          <p className="text-[13px] text-ln-op-ink-2">
            Para ver el listado de animales necesitás el permiso{" "}
            <code className="text-[11px]">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] hover:bg-ln-op-azul-700"
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
  // A proposal is pending if there is a custody_transfer_proposed event and no
  // subsequent custody_transferred event resolves it.
  //
  // Replaces the former N+1 loop (2 queries per pet) with one batch query:
  //   1. DISTINCT ON (pet_id) to get the latest proposal per pet.
  //   2. NOT EXISTS subquery to verify no subsequent transfer exists.
  const pendingProposalPetIds = new Set<string>();
  if (petIds.length > 0) {
    const lostPetIds = cards
      .filter((c) => c.pet.status === "lost" && c.ownershipRole === "shelter_custody")
      .map((c) => c.pet.id);

    if (lostPetIds.length > 0) {
      // Single query: latest proposal per pet that has no subsequent transfer.
      const rows = await db.execute<{ pet_id: string }>(sql`
        SELECT lp.pet_id::text AS pet_id
        FROM (
          SELECT DISTINCT ON (pe.pet_id)
            pe.pet_id,
            pe.occurred_at AS proposed_at
          FROM pet_events pe
          WHERE pe.pet_id = ANY(ARRAY[${sql.join(
            lostPetIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}])
            AND pe.event_type = 'custody_transfer_proposed'
          ORDER BY pe.pet_id, pe.occurred_at DESC
        ) lp
        WHERE NOT EXISTS (
          SELECT 1 FROM pet_events t
          WHERE t.pet_id = lp.pet_id
            AND t.event_type = 'custody_transferred'
            -- >= (not >) is intentional: a transfer event at the exact proposal
            -- timestamp resolves the proposal (avoids a phantom pending CTA).
            -- Matches lib/owner-dashboard's fetchOpenCasesSweep semantics for
            -- the same concept. The old JS loop used strict >, which would have
            -- left a same-millisecond transfer as falsely pending.
            AND t.occurred_at >= lp.proposed_at
        )
      `);
      for (const row of rows) pendingProposalPetIds.add(row.pet_id);
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
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <OpCrumbs
              items={[
                { label: "Panel", href: `/org/${orgToken}` },
                { label: "Animales en custodia" },
              ]}
            />
            <h1 className="text-[22px] font-semibold text-ln-op-ink">Animales en custodia</h1>
            <p className="text-[13px] text-ln-op-ink-2">
              {cards.length === 0
                ? "Todavía no hay animales registrados a nombre de la organización."
                : `${cards.length} animal${cards.length === 1 ? "" : "es"} bajo custodia activa.`}
            </p>
          </div>
          {canIntake && (
            <Link
              href={`/org/${orgToken}/intake`}
              className="px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700"
            >
              Registrar ingreso
            </Link>
          )}
        </header>

        {recentlyCreated && (
          <OpCallout
            title="Ingreso registrado"
            body={
              <>
                Token público: <code className="font-ln-mono">{recentlyCreated}</code>.
                <CopyButton text={recentlyCreated} />
              </>
            }
            icon={<Icon name="check-circle" decorative />}
          />
        )}
        {recentlyFostered && (
          <OpCallout
            title="Tránsito asignado"
            body={
              <>
                Tránsito asignado para <code className="font-ln-mono">{recentlyFostered}</code>.
                <CopyButton text={recentlyFostered} />
              </>
            }
            icon={<Icon name="casa" decorative />}
          />
        )}
        {recentlyFosterEnded && (
          <OpCallout
            title="Tránsito cerrado"
            body={
              <>
                Tránsito cerrado para <code className="font-ln-mono">{recentlyFosterEnded}</code>.
                <CopyButton text={recentlyFosterEnded} />
              </>
            }
            icon={<Icon name="check-circle" decorative />}
          />
        )}
        {recentlyTransferred && (
          <OpCallout
            title="Custodia transferida"
            body={
              <>
                Custodia transferida para{" "}
                <code className="font-ln-mono">{recentlyTransferred}</code>.
                <CopyButton text={recentlyTransferred} /> El animal sale del listado y aparece en el
                destino.
              </>
            }
            icon={<Icon name="transferencia" decorative />}
          />
        )}
        {recentlyAdopted && (
          <OpCallout
            title="Adopción finalizada"
            body={
              <>
                Adopción finalizada para <code className="font-ln-mono">{recentlyAdopted}</code>.
                <CopyButton text={recentlyAdopted} /> El animal pasa a un nuevo dueño y sale del
                listado de custodia.
              </>
            }
            icon={<Icon name="check-circle" decorative />}
          />
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

        <footer className="pt-4 border-t border-ln-op-line">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-ln-op-mute underline hover:text-ln-op-ink"
          >
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
