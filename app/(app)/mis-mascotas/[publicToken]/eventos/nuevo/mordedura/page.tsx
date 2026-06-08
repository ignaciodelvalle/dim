import Link from "next/link";

import { requireOwnedPetByToken } from "@/lib/pets";
import { reportBiteAction } from "@/src/modules/surveillance/actions";

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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver a {pet.name}
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Reportar mordedura
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Si {pet.name} mordió a alguien (persona u otro animal), reportalo acá. Esto inicia la
            observación antirrábica de 10 días que la ley exige.
          </p>
        </div>

        {isInObservation ? (
          <section className="rounded-xl border border-gob-warning  bg-gob-warning/10  p-4 space-y-2">
            <p className="font-medium text-gob-warning-text ">Ya hay una observación en curso</p>
            <p className="text-sm text-gob-warning-text ">
              {pet.name} está en observación antirrábica por otra mordedura. Esperá a que termine
              antes de reportar una nueva.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="inline-block text-xs underline underline-offset-2 text-gob-warning-text  hover:opacity-80"
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
