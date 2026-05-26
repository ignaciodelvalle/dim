// /mis-mascotas/[token]/mostrar-libreta — owner-facing toggle for the
// Tier 2 público temporal window. v1 ships only the 24h duration enabled;
// the 7d / 30d / "Siempre visible" cards render as disabled with a
// "Próximamente" tooltip so users see the roadmap (mockup behaviour).
//
// When the window is already open, the page shows a status card with the
// expiration timestamp and a Revocar button — same surface, just a
// different state.
//
// The actual UI is in Tier2PublicView — shared with the ?sheet=mostrar-tier2
// sheet in SheetMounter.

import { enableTier2PublicAction, revokeTier2PublicAction } from "@/app/actions/tier2-public";
import { requirePetAccess } from "@/lib/pet-access";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  const isActive = !!activeUntil && activeUntil > now;

  // Server actions bound with the publicToken so the inline <form action>
  // doesn't need a hidden input.
  const enable = enableTier2PublicAction.bind(null, publicToken);
  const revoke = revokeTier2PublicAction.bind(null, publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-6">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Mostrar Libreta
          </h1>
        </header>

        <Tier2PublicView
          petPublicToken={pet.publicToken}
          petName={pet.name}
          isActive={isActive}
          activeUntil={activeUntil}
          enableAction={enable}
          revokeAction={revoke}
        />
      </div>
    </main>
  );
}
