import { logoutAction } from "@/app/actions/auth";
import { type Pet, attachments, db, notifications, ownerships, pets, profiles } from "@/db";
import { speciesLabel } from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";

export default async function MisMascotasPage({
  searchParams,
}: {
  searchParams: Promise<{ reclamado?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout guards this

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const params = await searchParams;
  const claimedCount = params.reclamado ? Number.parseInt(params.reclamado, 10) : null;

  // Pets where this user is the *current* custodian (any role), with the
  // primary photo and the ownership role for the "En tránsito" badge.
  const ownedPets = await db
    .select({ pet: pets, photo: attachments, ownershipRole: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)));

  // Unread notification count — drives the bell badge.
  const [{ unreadCount }] = await db
    .select({ unreadCount: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );

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
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell unreadCount={unreadCount} />
            <Link
              href="/mis-mascotas/nueva"
              className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              + Agregar mascota
            </Link>
          </div>
        </header>

        {claimedCount !== null && (
          <p className="text-sm rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {claimedCount > 0
              ? `Reclamaste ${claimedCount} mascota${claimedCount === 1 ? "" : "s"} adoptada${claimedCount === 1 ? "" : "s"} a tu cuenta.`
              : "Vinculamos tu DNI a tu cuenta. Si esperabas una adopción, pedile al refugio que verifique el DNI cargado."}
          </p>
        )}

        {ownedPets.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {ownedPets.map(({ pet, photo, ownershipRole }) => (
              <PetCard
                key={pet.id}
                pet={pet}
                photoUrl={petPhotoUrl(photo?.storagePath)}
                ownershipRole={ownershipRole}
              />
            ))}
          </ul>
        )}

        <div className="flex gap-4 pt-2 text-sm flex-wrap">
          <Link
            href="/denuncias/nueva"
            className="text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            + Denunciar maltrato animal
          </Link>
          <Link
            href="/denuncias/mias"
            className="text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            Mis denuncias
          </Link>
          {!profile?.dniNumber && (
            <Link
              href="/mis-mascotas/reclamar"
              className="text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
            >
              Reclamar adopción de refugio
            </Link>
          )}
          <Link
            href="/cuenta/upgrade"
            className="text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            Convertirme en profesional / organización →
          </Link>
        </div>

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
      <p className="text-neutral-700 dark:text-neutral-300">
        Empezá registrando tu primera mascota.
      </p>
      <Link
        href="/mis-mascotas/nueva"
        className="inline-block px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
      >
        Agregar tu primera mascota
      </Link>
    </div>
  );
}

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notificaciones"
      aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-full border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <title>Notificaciones</title>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

function PetCard({
  pet,
  photoUrl,
  ownershipRole,
}: {
  pet: Pet;
  photoUrl: string | null;
  ownershipRole: string;
}) {
  const initial = pet.name.charAt(0).toUpperCase();
  const isTransit = ownershipRole === "shelter_custody";

  return (
    <li>
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        {photoUrl ? (
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
          <p className="font-medium text-neutral-900 dark:text-neutral-50 truncate">
            {pet.name}
            {isTransit && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 align-middle">
                En tránsito
              </span>
            )}
          </p>
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
