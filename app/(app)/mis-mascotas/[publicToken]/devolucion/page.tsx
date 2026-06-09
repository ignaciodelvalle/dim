// Devolucion — Libreta Nacional redesign.
// Presentation only; ReturnAcceptanceCard and data fetching unchanged.

import { LnButton } from "@/components/ui/Button";
import { LnCallout } from "@/components/ui/DocElements";
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
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Volver al perfil
      </Link>
      <h1 className="m-0 mb-[16px] font-[var(--font-ln-serif)] text-[24px] font-semibold text-[var(--color-ln-ink)]">
        Devolución de {pet.name}
      </h1>
      <LnCallout tone="warn" title="Aceptar una devolución es acción del dueño legal.">
        Tu vínculo actual con <strong>{pet.name}</strong> es de <strong>{roleLabel}</strong>. Si el
        dueño original ya no es el correcto, primero hay que completar la transferencia formal de
        custodia antes de aceptar la devolución.
      </LnCallout>
    </div>
  );
}

export default async function DevolucionPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

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

  const [latestProposal] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

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
      <div className="mx-auto max-w-lg px-[32px] py-[28px] pb-[48px]">
        <div className="mb-[20px] text-center">
          <p className="font-[var(--font-ln-serif)] text-[20px] font-semibold text-[var(--color-ln-ink)]">
            Sin propuestas pendientes
          </p>
          <p className="mt-[6px] text-[13px] text-[var(--color-ln-mute)]">
            No hay propuestas de devolución activas para {pet.name}.
          </p>
        </div>
        <div className="flex justify-center">
          <Link href="/mis-mascotas">
            <LnButton variant="primary" size="md">
              Volver a mis mascotas
            </LnButton>
          </Link>
        </div>
      </div>
    );
  }

  if (!latestProposal) notFound();
  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;
  const proposalNotes = (proposalPayload.notes as string | null) ?? null;
  const proposedAt =
    (proposalPayload.proposed_at as string | null) ?? latestProposal.occurredAt.toISOString();

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
    <div className="mx-auto max-w-lg px-[32px] py-[28px] pb-[48px]">
      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Devolución de {pet.name}
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Alguien tiene a {pet.name} y quiere devolvértela. Confirmá cuando la tengas físicamente.
        </p>
      </div>

      <ReturnAcceptanceCard
        petPublicToken={publicToken}
        petName={pet.name}
        actorName={actorName}
        proposalNotes={proposalNotes}
        proposedAt={proposedAt}
        backUrl="/mis-mascotas"
      />

      <div className="mt-[24px] border-t border-[var(--color-ln-line-2)] pt-[16px]">
        <Link
          href="/mis-mascotas"
          className="font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Mis mascotas
        </Link>
      </div>
    </div>
  );
}
