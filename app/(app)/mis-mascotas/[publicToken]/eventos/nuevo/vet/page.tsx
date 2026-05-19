import { createVetVisitAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { VetVisitForm } from "./VetVisitForm";

export default async function NewVetVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ occurredAt?: string; notes?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const defaults = {
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createVetVisitAction.bind(null, pet.publicToken);

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
            Visita al veterinario
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá una consulta de {pet.name}. Si surgió un diagnóstico o tratamiento podés
            cargarlo después como evento separado.
          </p>
        </div>
        <VetVisitForm action={boundAction} defaults={defaults} />
      </div>
    </main>
  );
}
