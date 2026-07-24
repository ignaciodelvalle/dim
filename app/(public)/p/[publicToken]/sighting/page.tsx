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
import { fetchLostEpisodeForPet, publicSightingMapCenter } from "@/lib/infra/lost-mode";
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
      id: pets.id,
      name: pets.name,
      sex: pets.sex,
      status: pets.status,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
      discloseLastLocationWhenLost: pets.discloseLastLocationWhenLost,
      inCustodyDispute: pets.inCustodyDispute,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) notFound();

  // D2 hardening (red-team 2026-07): the sighting flow notifies the contested
  // owner and its payload can carry the finder's contact — replaced by the
  // neutral authority notice while titularidad is under review. The action is
  // gated server-side too (report-pet-sighting.ts).
  if (pet.inCustodyDispute) {
    return (
      // Landing shell (AppShell variant=landing) owns #main-content + min-height.
      <div className="min-h-screen bg-[var(--color-ln-paper)] px-4 py-10">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-ln-ink)]">
            Titularidad en revisión
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)]">
            La titularidad de esta mascota está en revisión por la autoridad. Si tenés información,
            será dirigida a la autoridad competente, no a las partes.
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

  // Center the map on the pet's last-known lost location (tester fix #5).
  // PRIVACY: only when the owner disclosed the last location publicly —
  // publicSightingMapCenter returns null otherwise and the map keeps its
  // neutral default. The episode fetch is skipped entirely when undisclosed.
  const episode = pet.discloseLastLocationWhenLost ? await fetchLostEpisodeForPet(pet.id) : null;
  const defaultCenter = publicSightingMapCenter({
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    lastSeenLat: episode?.lastSeenLat ?? null,
    lastSeenLng: episode?.lastSeenLng ?? null,
  });

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
            petSex={pet.sex}
            biasProvince={pet.jurisdictionProvince}
            biasLocality={pet.jurisdictionLocality}
            defaultCenter={defaultCenter}
          />
        </section>
      </div>
    </div>
  );
}
