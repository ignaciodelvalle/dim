// Devolucion page — owner surface for accepting or rejecting a
// return-to-owner proposal from a refugio or vecino.
//
// Access: requireUserOrRedirect + must be the active owner of this pet.
// Shows: proposal card with actor info, notes, date, and accept/reject CTAs.

import { type Pet, db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReturnAcceptanceCard } from "./ReturnAcceptanceCard";

const ROLE_LABELS: Record<string, string> = {
  shelter_custody: "custodia temporal (tránsito)",
  foster: "tránsito formal",
  co_owner: "co-dueño",
  caretaker: "cuidador",
};

function FriendlyOwnerOnlyPage({ pet, role }: { pet: Pet; role: string }) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-4">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al perfil
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Devolución de {pet.name}
        </h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-2">
          <p className="font-medium">Aceptar una devolución es acción del dueño legal.</p>
          <p>
            Tu vínculo actual con <strong>{pet.name}</strong> es de <strong>{roleLabel}</strong>. Si
            el dueño original ya no es el correcto, primero hay que completar la transferencia
            formal de custodia antes de aceptar la devolución.
          </p>
        </div>
      </div>
    </main>
  );
}

export default async function DevolucionPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

  // Two-step access: resolve any active ownership first so non-owners
  // (foster, shelter_custody, caretaker) get a friendly explainer
  // instead of a bare 404. Real outsiders still 404.
  const [accessRow] = await db
    .select({ pet: pets, role: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!accessRow) notFound();
  if (accessRow.role !== "owner") {
    return <FriendlyOwnerOnlyPage pet={accessRow.pet} role={accessRow.role} />;
  }
  const pet = accessRow.pet;

  // Find the latest custody_transfer_proposed event.
  const [latestProposal] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  // Check if it has already been closed by a subsequent transfer.
  let isPending = false;
  if (latestProposal) {
    const [subsequentTransfer] = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, pet.id),
          eq(petEvents.eventType, "custody_transferred"),
          gt(petEvents.occurredAt, latestProposal.occurredAt),
        ),
      )
      .limit(1);
    if (!subsequentTransfer) isPending = true;
  }

  if (!isPending) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Sin propuestas pendientes</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            No hay propuestas de devolución activas para {pet.name}.
          </p>
          <Link
            href="/mis-mascotas"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  // latestProposal is defined here — isPending=true requires it to be set.
  if (!latestProposal) notFound();
  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;
  const proposalNotes = (proposalPayload.notes as string | null) ?? null;
  const proposedAt =
    (proposalPayload.proposed_at as string | null) ?? latestProposal.occurredAt.toISOString();

  // Resolve actor display name.
  let actorName = "Alguien";
  if (fromUserId) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, fromUserId))
      .limit(1);
    if (profile) actorName = profile.displayName.split(" ")[0];
  } else if (fromOrgId) {
    const { organizations } = await import("@/db");
    const [org] = await db
      .select({ displayName: organizations.displayName })
      .from(organizations)
      .where(eq(organizations.id, fromOrgId))
      .limit(1);
    if (org) actorName = org.displayName;
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Devolución de {pet.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Alguien tiene a {pet.name} y quiere devolvértela. Confirmá cuando la tengas físicamente.
          </p>
        </header>

        <ReturnAcceptanceCard
          petPublicToken={publicToken}
          petName={pet.name}
          actorName={actorName}
          proposalNotes={proposalNotes}
          proposedAt={proposedAt}
          backUrl="/mis-mascotas"
        />
      </div>
    </main>
  );
}
