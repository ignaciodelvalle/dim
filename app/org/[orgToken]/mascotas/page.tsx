// Pets currently held by the active organization. Lists every active
// ownership row where owner_organization_id = active org. Multiple custody
// rows on the same pet (e.g. shelter_custody + foster) collapse to one card
// — the highest-stakes role wins for the badge.

import { db, ownerships, petEvents, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Link from "next/link";

const ROLE_PRIORITY: Record<string, number> = {
  owner: 4,
  shelter_custody: 3,
  foster: 2,
  co_owner: 1,
  caretaker: 0,
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  owner: {
    label: "Dueño",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  shelter_custody: {
    label: "En custodia",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  foster: {
    label: "Tránsito",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  co_owner: {
    label: "Co-dueño",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  caretaker: {
    label: "Caretaker",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
};

const SPECIES_LABELS: Record<string, string> = {
  dog: "Perro",
  cat: "Gato",
  other: "Otro",
};

function speciesLabel(species: string): string {
  return SPECIES_LABELS[species] ?? species;
}

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
  const canRead = granted.has("pet.read_held") || membership.role === "admin";

  if (!canRead) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para ver el listado de animales necesitás el permiso{" "}
            <code className="text-xs">pet.read_held</code>.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
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

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              {organization.displayName}
            </p>
            <h1 className="text-3xl font-semibold">Animales en custodia</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {cards.length === 0
                ? "Todavía no hay animales registrados a nombre de la organización."
                : `${cards.length} animal${cards.length === 1 ? "" : "es"} bajo custodia activa.`}
            </p>
          </div>
          {canIntake && (
            <Link
              href={`/org/${orgToken}/intake`}
              className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm"
            >
              Registrar ingreso
            </Link>
          )}
        </header>

        {recentlyCreated && (
          <p className="text-sm rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            Ingreso registrado. Token público: <code>{recentlyCreated}</code>.
          </p>
        )}
        {recentlyFostered && (
          <p className="text-sm rounded border border-blue-300 bg-blue-50 px-3 py-2 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            Tránsito asignado para <code>{recentlyFostered}</code>.
          </p>
        )}
        {recentlyFosterEnded && (
          <p className="text-sm rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
            Tránsito cerrado para <code>{recentlyFosterEnded}</code>.
          </p>
        )}
        {recentlyTransferred && (
          <p className="text-sm rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
            Custodia transferida para <code>{recentlyTransferred}</code>. El animal sale del listado
            y aparece en el destino.
          </p>
        )}
        {recentlyAdopted && (
          <p className="text-sm rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            Adopción finalizada para <code>{recentlyAdopted}</code>. El animal pasa a un nuevo dueño
            y sale del listado de custodia.
          </p>
        )}

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map(({ pet, ownershipRole, startedAt }) => {
            const badge = ROLE_BADGE[ownershipRole] ?? ROLE_BADGE.shelter_custody;
            const ageInfo = pet.dateOfBirth
              ? `${pet.birthDateIsEstimated ? "~" : ""}${calcAge(pet.dateOfBirth)}`
              : "edad desconocida";
            const hasFoster = fosteredPetIds.has(pet.id);
            const showFosterCta =
              canAssignFoster && ownershipRole === "shelter_custody" && !hasFoster;
            return (
              <li
                key={pet.id}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}`}
                    className="flex-1 min-w-0 hover:underline"
                  >
                    <p className="text-base font-semibold">{pet.name}</p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {speciesLabel(pet.species)}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                      {pet.color ? ` · ${pet.color}` : ""}
                    </p>
                  </Link>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                    {hasFoster && ownershipRole === "shelter_custody" && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE.foster.className}`}
                      >
                        + tránsito
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  {ageInfo} · ingreso{" "}
                  {new Date(startedAt).toLocaleDateString("es-AR", {
                    dateStyle: "medium",
                  })}
                </p>
                <p className="text-xs text-neutral-500">
                  <code>{pet.publicToken}</code>
                </p>
                {(() => {
                  const showTransferCta =
                    canTransfer &&
                    (ownershipRole === "shelter_custody" || ownershipRole === "owner");
                  const hasPendingProposal = pendingProposalPetIds.has(pet.id);
                  const showReturnToOwnerCta =
                    canReturnToOwner &&
                    ownershipRole === "shelter_custody" &&
                    pet.status === "lost" &&
                    !hasPendingProposal;
                  const anyCta =
                    showFosterCta ||
                    (canEndFoster && hasFoster) ||
                    (canFinalizeAdoption && ownershipRole === "shelter_custody") ||
                    showTransferCta ||
                    showReturnToOwnerCta;
                  if (!anyCta) return null;
                  return (
                    <div className="pt-1 flex flex-wrap gap-2">
                      {showFosterCta && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/foster`}
                          className="inline-block text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        >
                          Asignar tránsito
                        </Link>
                      )}
                      {canEndFoster && hasFoster && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/foster-fin`}
                          className="inline-block text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        >
                          Cerrar tránsito
                        </Link>
                      )}
                      {canIntake && ownershipRole === "shelter_custody" && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/eligibility`}
                          className="inline-block text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        >
                          {pet.adoptionEligible === true
                            ? "Apta ✓"
                            : pet.adoptionEligible === false
                              ? "NO apta"
                              : "Elegibilidad"}
                        </Link>
                      )}
                      {canFinalizeAdoption && ownershipRole === "shelter_custody" && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/adoption`}
                          className="inline-block text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Finalizar adopción
                        </Link>
                      )}
                      {showReturnToOwnerCta && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/devolver-al-dueno`}
                          className="inline-block text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Devolver al dueno
                        </Link>
                      )}
                      {showTransferCta && (
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/transfer`}
                          className="inline-block text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        >
                          Transferir
                        </Link>
                      )}
                    </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}

function calcAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 12) return `${Math.max(0, months)} meses`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} año${years === 1 ? "" : "s"}`;
  return `${years} año${years === 1 ? "" : "s"} ${remMonths} m`;
}
