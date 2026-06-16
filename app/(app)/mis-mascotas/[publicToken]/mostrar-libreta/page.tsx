// /mis-mascotas/[token]/mostrar-libreta — Libreta Nacional redesign.
// Presentation only; Tier2PublicView and server actions unchanged.

import Link from "next/link";
import { notFound } from "next/navigation";

import { enableTier2PublicAction, revokeTier2PublicAction } from "@/app/actions/tier2-public";
import { requirePetAccess } from "@/lib/pet-access";
import { Tier2PublicView } from "../_tier2-public/Tier2PublicView";

export default async function MostrarLibretaPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  const now = new Date();
  const activeUntil = pet.tier2PublicEnabledUntil ? new Date(pet.tier2PublicEnabledUntil) : null;
  const isPermanent = pet.tier2PublicPermanent;
  const isActive = isPermanent || (!!activeUntil && activeUntil > now);

  const enable = enableTier2PublicAction.bind(null, publicToken);
  const revoke = revokeTier2PublicAction.bind(null, publicToken);

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
          Mostrar libreta
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Activá el acceso temporal para que alguien pueda ver la libreta de {pet.name} sin iniciar
          sesión.
        </p>
      </div>

      <Tier2PublicView
        petPublicToken={pet.publicToken}
        petName={pet.name}
        isActive={isActive}
        isPermanent={isPermanent}
        activeUntil={isActive && !isPermanent ? activeUntil : null}
        enableAction={enable}
        revokeAction={revoke}
      />
    </div>
  );
}
