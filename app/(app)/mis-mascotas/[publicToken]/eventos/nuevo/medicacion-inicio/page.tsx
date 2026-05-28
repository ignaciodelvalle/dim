import { createMedicationStartAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { MedicationStartForm } from "./MedicationStartForm";

export default async function NewMedicationStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ notes?: string; occurredAt?: string }>;
}) {
  const { publicToken } = await params;
  const { notes, occurredAt } = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const boundAction = createMedicationStartAction.bind(null, pet.publicToken);

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
            Inicio de medicación
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Registrá un tratamiento nuevo para {pet.name}.
          </p>
        </div>
        <MedicationStartForm
          action={boundAction}
          species={pet.species}
          defaultNotes={notes}
          defaultOccurredAt={occurredAt}
        />
      </div>
    </main>
  );
}
