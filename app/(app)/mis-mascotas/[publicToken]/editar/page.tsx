import { updatePetAction } from "@/app/actions/pets";
import { PetForm } from "@/components/PetForm";
import { attachments, db, ownerships, pets } from "@/db";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditPetPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Same ownership check as the detail page — non-owners get 404.
  const [result] = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!result) notFound();
  const { pet, photo } = result;

  // Bind the publicToken into the action so the form doesn't have to send it.
  const boundAction = updatePetAction.bind(null, publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al perfil
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Editar {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
