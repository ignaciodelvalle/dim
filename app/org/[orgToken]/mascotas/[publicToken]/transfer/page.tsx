// Custody transfer page (org → org handoff). Gates on
// custody.transfer + verifies the pet is currently held by the active org
// under a transferable role (shelter_custody or owner). The form posts to
// transferCustodyAction.

import { db, organizations, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferCustodyForm } from "./TransferCustodyForm";

const TRANSFERABLE_ROLES = ["shelter_custody", "owner"] as const;

export default async function TransferCustodyPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const { organization: orgFromToken } = await requireOrgAccessByToken(orgToken);
  const auth = await requireCapability("custody.transfer", orgFromToken.id);
  if (auth.error !== null) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold">Sin acceso</h1>
          <p className="text-sm text-gob-text-gray ">{auth.error}</p>
          <Link href={`/org/${orgToken}/mascotas`} className="text-sm text-gob-text-gray underline">
            ← Volver a mascotas
          </Link>
        </div>
      </main>
    );
  }
  const { organization } = auth;

  // Verify the pet is currently held by the source org under a transferable
  // role. We don't gate the form on this in the UI — the action will reject
  // too — but pre-validating saves the user a round trip.
  const [petRow] = await db
    .select({ pet: pets, role: ownerships.role })
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
  if (!petRow) notFound();
  if (!(TRANSFERABLE_ROLES as readonly string[]).includes(petRow.role as string)) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold">No se puede transferir</h1>
          <p className="text-sm text-gob-text-gray ">
            {petRow.pet.name} no está en un rol transferible (custodia o dueño). Solo se pueden
            transferir esos dos roles.
          </p>
          <Link href={`/org/${orgToken}/mascotas`} className="text-sm text-gob-text-gray underline">
            ← Volver a mascotas
          </Link>
        </div>
      </main>
    );
  }

  // Destination options: every verified org except the source. Ordered by
  // displayName for predictable picking.
  const destinations = await db
    .select({ id: organizations.id, displayName: organizations.displayName })
    .from(organizations)
    .where(and(eq(organizations.verified, true), ne(organizations.id, organization.id)))
    .orderBy(asc(organizations.displayName));

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-8 space-y-8">
        <Link
          href={`/org/${orgToken}/mascotas`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver a mascotas
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Transferir {petRow.pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Pasá la custodia a otra organización verificada. La acción es atómica: cierra el
            registro actual y abre uno nuevo en el destino con el evento{" "}
            <code className="text-xs bg-gob-surface-alt  px-1 rounded">custody_transferred</code>.
          </p>
        </div>

        {destinations.length === 0 ? (
          <p className="text-sm rounded border border-gob-warning bg-gob-warning/10 px-3 py-2 text-gob-warning-text   ">
            No hay otras organizaciones verificadas en el sistema. Pediles que se verifiquen antes
            de transferir.
          </p>
        ) : (
          <TransferCustodyForm
            orgToken={orgToken}
            publicToken={petRow.pet.publicToken}
            destinations={destinations}
          />
        )}
      </div>
    </main>
  );
}
