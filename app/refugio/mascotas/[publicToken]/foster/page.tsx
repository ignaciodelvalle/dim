// Foster-assignment page. Verifies the pet is in shelter_custody by the
// active org, then lets a user with `foster.assign` pick an active member
// of the org as the foster.

import { db, organizationMemberships, ownerships, pets, profiles } from "@/db";
import { getActiveMemberships, getGrantedCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { AssignFosterForm, type FosterCandidate } from "./AssignFosterForm";

export default async function AssignFosterPage({
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
  if (!granted.has("foster.assign")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para asignar tránsitos necesitás el permiso{" "}
            <code className="text-xs">foster.assign</code>.
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

  // Candidate fosters: every active member of the org except the actor.
  // We don't filter by role — any active member can take a foster role per
  // AGENTS.md → "A foster requires an active organization_membership". The
  // <select> sorts foster-role first so coordinators see them at the top.
  const candidateRows = await db
    .select({
      userId: organizationMemberships.userId,
      role: organizationMemberships.role,
      displayName: profiles.displayName,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, active.organization.id),
        isNull(organizationMemberships.leftAt),
        ne(organizationMemberships.userId, user.id),
      ),
    )
    .orderBy(asc(organizationMemberships.role), asc(profiles.displayName));

  const candidates: FosterCandidate[] = candidateRows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
  }));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {active.organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Asignar tránsito: {pet.name}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            La custodia del refugio sigue activa mientras el tránsito cuida físicamente al animal.
          </p>
        </header>

        <AssignFosterForm publicToken={publicToken} candidates={candidates} />

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
