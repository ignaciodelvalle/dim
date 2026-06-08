// Foster-assignment page. Verifies the pet is in shelter_custody by the
// active org, then lets a user with `foster.assign` pick an active member
// of the org as the foster.

import { db, organizationMemberships, ownerships, pets, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { AssignFosterForm, type FosterCandidate } from "./AssignFosterForm";

export default async function AssignFosterPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;

  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("foster.assign")) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para asignar tránsitos necesitás el permiso{" "}
            <code className="text-xs">foster.assign</code>.
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
        eq(ownerships.role, "shelter_custody"),
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
        eq(organizationMemberships.organizationId, organization.id),
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Asignar tránsito: {pet.name}</h1>
          <p className="text-sm text-gob-text-gray ">
            La custodia del refugio sigue activa mientras el tránsito cuida físicamente al animal.
          </p>
        </header>

        <AssignFosterForm orgToken={orgToken} publicToken={publicToken} candidates={candidates} />

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
