import { PetCard } from "@/components/PetCard";
import { attachments, db, ownerships, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { fetchActiveReminders } from "@/lib/owner-dashboard";
import { resolveVetLanding } from "@/lib/role-landing";
import { petPhotoUrl } from "@/lib/storage";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MisMascotasPage({
  searchParams,
}: {
  searchParams: Promise<{ reclamado?: string; as?: string }>;
}) {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const params = await searchParams;
  const claimedCount = params.reclamado ? Number.parseInt(params.reclamado, 10) : null;

  // Vets land at their org portal (or /cuenta if they have no org yet).
  // They can still access their pet list via direct sub-paths or `?as=owner`.
  if (profile?.role === "vet" && params.as !== "owner") {
    redirect(await resolveVetLanding(user.id));
  }

  // Pets where this user is the *current* custodian (any role), with the
  // primary photo and the ownership role for the "En tránsito" badge.
  // NotificationBell moved to /inicio (PR #208) so the unread query lives there now.
  const [ownedPets, activeReminders] = await Promise.all([
    db
      .select({ pet: pets, photo: attachments, ownershipRole: ownerships.role })
      .from(pets)
      .innerJoin(ownerships, eq(ownerships.petId, pets.id))
      .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
      .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt))),
    fetchActiveReminders(user.id),
  ]);

  // Build a map from petId → highest-priority reminder variant for the pet badge.
  // activeReminders is already sorted by priority (overdue_critical first), so
  // the first entry per pet is the highest-priority variant.
  const reminderStateByPet = new Map<string, { variant: ReminderVariant }>();
  for (const r of activeReminders) {
    if (!reminderStateByPet.has(r.petId)) {
      reminderStateByPet.set(r.petId, { variant: r.variant });
    }
  }

  return (
    <main className="p-6">
      <div className="max-w-2xl mx-auto pt-10 space-y-10">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
              Hola, {profile?.displayName ?? "amigo"}
            </h1>
            <p className="text-sm text-gob-text-gray ">
              {ownedPets.length === 0
                ? "Todavía no tenés mascotas registradas."
                : `${ownedPets.length} mascota${ownedPets.length === 1 ? "" : "s"} en tu libreta.`}
            </p>
          </div>
          <Link
            href="/mis-mascotas/nueva"
            className="shrink-0 rounded-lg bg-gob-primary px-4 py-2 text-sm font-medium text-white hover:bg-gob-primary-hover"
          >
            + Agregar mascota
          </Link>
        </header>

        {claimedCount !== null && (
          <p className="text-sm rounded border border-gob-success bg-gob-success/10 px-3 py-2 text-gob-success   ">
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
                vaccineReminderState={reminderStateByPet.get(pet.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-gob-border-strong  rounded-xl p-10 text-center space-y-3">
      <p className="text-gob-text-gray ">Empezá registrando tu primera mascota.</p>
      <Link
        href="/mis-mascotas/nueva"
        className="inline-block px-5 py-2.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
      >
        Agregar tu primera mascota
      </Link>
    </div>
  );
}

// PetCard moved to components/PetCard.tsx — shared across /mis-mascotas,
// /inicio, and future surfaces. Import re-exported below.
// NotificationBell moved to components/NotificationBell.tsx — surfaces on /inicio header.
