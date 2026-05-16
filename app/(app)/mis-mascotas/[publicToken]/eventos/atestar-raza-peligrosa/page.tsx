import { createDangerousBreedAttestationAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
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
  if (!session) return null;
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Registrar atestación de raza peligrosa
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
