import Link from "next/link";

import { db, organizations, ownerships, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, eq, isNull } from "drizzle-orm";

import { CoFosterToggle } from "./CoFosterToggle";

export default async function TransitosActivosPage() {
  const { user } = await requireUserOrRedirect();

  // Pets where this user has an ACTIVE foster ownership row.
  const rows = await db
    .select({
      ownership: ownerships,
      pet: pets,
    })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "foster"),
        isNull(ownerships.endedAt),
      ),
    );

  // For each pet, also fetch the active shelter_custody org (the refugio
  // we're cuidando the pet for). The pet may not have one if it's a vecino-foster.
  const orgMap = new Map<string, { displayName: string; publicToken: string }>();
  if (rows.length > 0) {
    const petIds = rows.map((r) => r.pet.id);
    for (const pid of petIds) {
      const [orgRow] = await db
        .select({ org: organizations })
        .from(ownerships)
        .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
        .where(
          and(
            eq(ownerships.petId, pid),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (orgRow) {
        orgMap.set(pid, {
          displayName: orgRow.org.displayName,
          publicToken: orgRow.org.publicToken,
        });
      }
    }
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Tránsitos activos
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Mascotas que estás cuidando hoy. Tenés los mismos permisos sobre la libreta sanitaria y
            eventos que un dueño mientras dure el tránsito.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">
            No tenés tránsitos activos.{" "}
            <Link
              href="/cuenta/transitos/propuestas"
              className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Mirá tus propuestas
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ ownership, pet }) => {
              const org = orgMap.get(pet.id);
              return (
                <li
                  key={ownership.id}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="space-y-1">
                      <Link
                        href={`/mis-mascotas/${pet.publicToken}`}
                        className="font-medium text-neutral-900 dark:text-neutral-50 hover:underline"
                      >
                        {pet.name}
                      </Link>
                      <p className="text-xs text-neutral-500">
                        {pet.species}
                        {pet.breed && ` · ${pet.breed}`}
                        {org && (
                          <>
                            {" · "}
                            <span>refugio: {org.displayName}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <CoFosterToggle
                    fosterOwnershipId={ownership.id}
                    initial={ownership.allowCoFoster}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2 text-sm">
          <p className="text-neutral-600 dark:text-neutral-400">
            <Link
              href="/cuenta/transitos/propuestas"
              className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Propuestas
            </Link>
            {" · "}
            <Link
              href="/cuenta/transitos/historial"
              className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              Historial
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
