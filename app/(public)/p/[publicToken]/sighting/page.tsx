// Anonymous "La vi cerca de acá" form — Tier 1 sighting report.
// Trilogy unification handoff §3 PR-025.
//
// Reached from the lost public credential as the lighter-weight sibling of
// "La encontré". The finder is NOT claiming custody; they're just dropping
// a pin where they saw the pet. The form is intentionally short (location
// pin + optional description + when) to maximize completion rate.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, pets } from "@/db";
import { sightingPhrase } from "@/lib/utils/format";

import { PetSightingForm } from "./PetSightingForm";

export const dynamic = "force-dynamic";

export default async function PetSightingPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const [pet] = await db
    .select({
      name: pets.name,
      sex: pets.sex,
      status: pets.status,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) notFound();

  if (pet.status !== "lost") {
    return (
      // Landing shell (AppShell variant=landing) owns #main-content + min-height.
      <div className="min-h-screen bg-[var(--color-ln-paper)] px-4 py-10">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-ln-ink)]">
            Esta mascota no está perdida
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            El reporte de avistaje sólo aplica mientras la mascota está marcada como perdida.
          </p>
          <Link
            href={`/p/${publicToken}`}
            className="inline-block px-4 py-2 rounded-lg bg-[var(--color-ln-azul)] text-white text-sm"
          >
            Ver el perfil público
          </Link>
        </div>
      </div>
    );
  }

  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="min-h-screen bg-[var(--color-ln-warn-050)] px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-1">
          <Link
            href={`/p/${publicToken}`}
            className="text-sm text-[var(--color-ln-ink)] underline underline-offset-4"
          >
            ← Volver al perfil
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--color-ln-ink)]">
            {sightingPhrase(pet.sex)}
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            Marcá dónde y cuándo viste a {pet.name}. El dueño/a recibe el aviso al instante.
          </p>
        </header>

        <section className="rounded-2xl bg-[var(--color-ln-card)] p-4">
          <PetSightingForm
            publicToken={publicToken}
            petName={pet.name}
            biasProvince={pet.jurisdictionProvince}
            biasLocality={pet.jurisdictionLocality}
          />
        </section>
      </div>
    </div>
  );
}
