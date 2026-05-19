import { createMicrochipAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { MicrochipForm } from "./MicrochipForm";

export default async function NewMicrochipPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ chipNumber?: string; occurredAt?: string; notes?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const defaults = {
    chipNumber: sp.chipNumber ?? null,
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createMicrochipAction.bind(null, pet.publicToken);

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
            Microchip implantado
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá el microchip de {pet.name}. Si el perfil aún no tiene número de chip, lo
            completamos automáticamente.
          </p>
        </div>
        <MicrochipForm action={boundAction} defaults={defaults} />
      </div>
    </main>
  );
}
