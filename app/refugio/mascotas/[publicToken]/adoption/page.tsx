// Adoption-finalize page. Capability-gated on `adoption.finalize`, validates
// the pet is in shelter_custody by the active org, and renders the composite-
// event form. Heavy lifting (DNI lookup, atomic custody transfer, stub-profile
// creation) lives in app/actions/adoption.ts.

import { db, ownerships, pets } from "@/db";
import { getActiveMemberships, getGrantedCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { FinalizeAdoptionForm } from "./FinalizeAdoptionForm";

export default async function AdoptionPage({
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

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return null;

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has("adoption.finalize")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para finalizar adopciones necesitás el permiso{" "}
            <code className="text-xs">adoption.finalize</code>.
          </p>
          <Link
            href="/refugio/mascotas"
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
        eq(ownerships.ownerOrganizationId, active.organization.id),
        eq(ownerships.role, "shelter_custody"),
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
            Este animal no figura bajo custodia activa de {active.organization.displayName}.
          </p>
          <Link
            href="/refugio/mascotas"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }
  const pet = petRow.pet;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {active.organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Finalizar adopción: {pet.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Esta acción cierra la custodia del refugio y, si hay un tránsito activo, también lo
            cierra. Queda registrado como evento inmutable en la historia de {pet.name}.
          </p>
        </header>

        <FinalizeAdoptionForm publicToken={publicToken} />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/refugio/mascotas"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
