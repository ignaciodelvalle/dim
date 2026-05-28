import { updatePetAction } from "@/app/actions/pets";
import { PetForm } from "@/components/PetForm";
import { attachments, db } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { petPhotoUrl } from "@/lib/storage";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditPetPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  // Photo: tiny side query indexed on primaryPhotoId.
  const [photo] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];

  // Bind the publicToken into the action so the form doesn't have to send it.
  const boundAction = updatePetAction.bind(null, publicToken);

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver al perfil
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Editar {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Cualquier cambio se guarda como un evento `pet_profile_updated` en el historial.
          </p>
        </div>
        <PetForm
          action={boundAction}
          existingPet={pet}
          existingPhotoUrl={petPhotoUrl(photo?.storagePath)}
        />
      </div>
    </main>
  );
}
