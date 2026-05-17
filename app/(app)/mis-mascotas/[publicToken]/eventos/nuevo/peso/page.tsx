import { createWeightAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { WeightForm } from "./WeightForm";

export default async function NewWeightPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const boundAction = createWeightAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Peso
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá el peso actual de {pet.name}. Actualizamos también el peso de su perfil.
          </p>
        </div>
        <WeightForm action={boundAction} />
      </div>
    </main>
  );
}
