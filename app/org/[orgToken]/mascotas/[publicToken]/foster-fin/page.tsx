// End-foster page. Verifies the pet has an active foster row held by an org
// the current user belongs to, then lets them close the foster cleanly. The
// action does the same validation defensively.

import { db, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { EndFosterForm } from "./EndFosterForm";

export default async function EndFosterPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;

  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("foster.end")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para cerrar tránsitos necesitás el permiso <code className="text-xs">foster.end</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Animal no disponible</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Este animal no figura bajo custodia activa de {organization.displayName}.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }
  const pet = petRow.pet;

  // Find the active foster + their display name (for friendly copy).
  const [fosterRow] = await db
    .select({ fosterDisplayName: profiles.displayName })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!fosterRow) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Sin tránsito activo</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            {pet.name} no tiene un tránsito activo para cerrar.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Cerrar tránsito: {pet.name}</h1>
        </header>

        <EndFosterForm orgToken={orgToken} publicToken={publicToken} fosterName={fosterRow.fosterDisplayName} />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
