import { createSterilizationAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { SterilizationForm } from "./SterilizationForm";

export default async function NewSterilizationPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet } = session;

  const boundAction = createSterilizationAction.bind(null, pet.publicToken);

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
            Esterilización
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Registrá el procedimiento de esterilización de {pet.name}.
          </p>
        </div>
        <SterilizationForm action={boundAction} />
      </div>
    </main>
  );
}
