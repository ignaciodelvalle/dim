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
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para cerrar tránsitos necesitás el permiso <code className="text-xs">foster.end</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
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
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Animal no disponible</h1>
          <p className="text-gob-text-gray ">
            Este animal no figura bajo custodia activa de {organization.displayName}.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
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
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Sin tránsito activo</h1>
          <p className="text-gob-text-gray ">{pet.name} no tiene un tránsito activo para cerrar.</p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Cerrar tránsito: {pet.name}</h1>
        </header>

        <EndFosterForm
          orgToken={orgToken}
          publicToken={publicToken}
          fosterName={fosterRow.fosterDisplayName}
        />

        <footer className="pt-4 border-t border-gob-border ">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="text-sm text-gob-text-gray underline "
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
