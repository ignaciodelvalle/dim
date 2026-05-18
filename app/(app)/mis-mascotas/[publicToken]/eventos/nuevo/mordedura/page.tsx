import Link from "next/link";

import { reportBiteAction } from "@/app/actions/bite";
import { requireOwnedPetByToken } from "@/lib/pets";

import { BiteForm } from "./BiteForm";

export default async function NewBitePage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { pet } = await requireOwnedPetByToken(publicToken);

  const isInObservation = pet.rabiesObservationStatus === "in_progress";
  const boundAction = reportBiteAction.bind(null, publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Reportar mordedura
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Si {pet.name} mordió a alguien (persona u otro animal), reportalo acá. Esto inicia la
            observación antirrábica de 10 días que la ley exige.
          </p>
        </div>

        {isInObservation ? (
          <section className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Ya hay una observación en curso
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {pet.name} está en observación antirrábica por otra mordedura. Esperá a que termine
              antes de reportar una nueva.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="inline-block text-xs underline underline-offset-2 text-amber-900 dark:text-amber-200 hover:opacity-80"
            >
              Volver al perfil →
            </Link>
          </section>
        ) : (
          <BiteForm action={boundAction} petName={pet.name} />
        )}
      </div>
    </main>
  );
}
