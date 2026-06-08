import { requireOwnedPetByToken } from "@/lib/pets";
import { createDangerousBreedAttestationAction } from "@/src/modules/events/actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DangerousBreedAttestationForm } from "./DangerousBreedAttestationForm";

export default async function NewDangerousBreedAttestationPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // Only relevant for pets flagged as potentially dangerous breed. Anyone else
  // bouncing to this URL gets sent back to the pet detail.
  if (!pet.potentiallyDangerousBreed) {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }
  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }

  const boundAction = createDangerousBreedAttestationAction.bind(null, pet.publicToken);

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
            Registrar atestación de raza peligrosa
          </h1>
          <p className="text-sm text-gob-text-gray ">
            La Ley CABA 4078 y la Ley Provincial 14.107 requieren que las razas potencialmente
            peligrosas estén inscriptas en el registro correspondiente. Anotá acá cuándo y dónde
            registraste a {pet.name}.
          </p>
        </div>
        <DangerousBreedAttestationForm action={boundAction} />
      </div>
    </main>
  );
}
