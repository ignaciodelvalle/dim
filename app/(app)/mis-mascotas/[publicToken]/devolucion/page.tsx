// Devolucion page — owner surface for accepting or rejecting a
// return-to-owner proposal from a refugio or vecino.
//
// Access: requireUserOrRedirect + must be the active owner of this pet.
// Shows: proposal card with actor info, notes, date, and accept/reject CTAs.

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReturnAcceptanceCard } from "./ReturnAcceptanceCard";

export default async function DevolucionPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

  // Load pet and verify caller is the active owner.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!petRow) notFound();
  const pet = petRow.pet;

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

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/mis-mascotas"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver a mis mascotas
          </Link>
        </footer>
      </div>
    </main>
  );
}
