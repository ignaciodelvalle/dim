import { requireOwnedPetByToken } from "@/lib/pets";
import { createDeathRecordAction } from "@/src/modules/events/actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeathRecordForm } from "./DeathRecordForm";

export default async function NewDeathRecordPage({
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

  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }

  const defaults = {
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createDeathRecordAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Registrar fallecimiento
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Registrá el fallecimiento de {pet.name}. Esta acción actualiza su estado a{" "}
            <strong>fallecida</strong> y queda en el historial permanentemente.
          </p>
        </div>
        <DeathRecordForm action={boundAction} species={pet.species} defaults={defaults} />
      </div>
    </main>
  );
}
