import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { attachments, db, ownerships, type Pet, pets, profiles } from "@/db";
import { speciesLabel } from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export default async function MisMascotasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout guards this

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Pets where this user is the *current* owner, with their primary photo.
  const ownedPets = await db
    .select({ pet: pets, photo: attachments })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(and(eq(ownerships.userId, user.id), isNull(ownerships.endedAt)));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Hola, {profile?.displayName ?? "amigo"}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {ownedPets.length === 0
                ? "Todavía no tenés mascotas registradas."
                : `${ownedPets.length} mascota${ownedPets.length === 1 ? "" : "s"} en tu libreta.`}
            </p>
          </div>
          <Link
            href="/mis-mascotas/nueva"
            className="shrink-0 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            + Agregar mascota
          </Link>
        </header>

        {ownedPets.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {ownedPets.map(({ pet, photo }) => (
              <PetCard key={pet.id} pet={pet} photoUrl={petPhotoUrl(photo?.storagePath)} />
            ))}
          </ul>
        )}

        <form action={logoutAction} className="pt-12">
          <button
            type="submit"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-10 text-center space-y-3">
      <p className="text-neutral-700 dark:text-neutral-300">Empezá registrando tu primera mascota.</p>
      <Link
        href="/mis-mascotas/nueva"
        className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
      >
        Agregar tu primera mascota
      </Link>
    </div>
  );
}

function PetCard({ pet, photoUrl }: { pet: Pet; photoUrl: string | null }) {
  const initial = pet.name.charAt(0).toUpperCase();

  return (
    <li>
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        {photoUrl ? (
          // biome-ignore lint/performance/noImgElement: switch to next/image later
          <img
            src={photoUrl}
            alt={pet.name}
            className="w-14 h-14 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-neutral-900 dark:text-neutral-50 truncate">{pet.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 truncate">
            {speciesLabel(pet.species)}
            {pet.color && ` · ${pet.color}`}
          </p>
        </div>
        <span className="text-neutral-400 dark:text-neutral-600 shrink-0" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
