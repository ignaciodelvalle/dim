import { createSymptomObservedAction } from "@/app/actions/events";
import { requireAlivePetAccess } from "@/lib/pet-access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SymptomForm } from "./SymptomForm";

export default async function NewSymptomPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  const boundAction = createSymptomObservedAction.bind(null, pet.publicToken);

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
            Registrar síntoma
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Anotá lo que estás viendo en {pet.name} en la libreta sanitaria. Sé natural — no te
            preocupes por terminología.
          </p>
        </div>
        <SymptomForm action={boundAction} petName={pet.name} />
      </div>
    </main>
  );
}
