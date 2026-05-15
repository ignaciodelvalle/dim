import { createDeathRecordAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeathRecordForm } from "./DeathRecordForm";

export default async function NewDeathRecordPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet } = session;

  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }

  const boundAction = createDeathRecordAction.bind(null, pet.publicToken);

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
            Registrar fallecimiento
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá el fallecimiento de {pet.name}. Esta acción actualiza su estado a{" "}
            <strong>fallecida</strong> y queda en el historial permanentemente.
          </p>
        </div>
        <DeathRecordForm action={boundAction} />
      </div>
    </main>
  );
}
