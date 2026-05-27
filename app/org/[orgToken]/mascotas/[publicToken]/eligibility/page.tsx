import Link from "next/link";
import { notFound } from "next/navigation";

import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, eq, isNull } from "drizzle-orm";

import { EligibilityForm } from "./EligibilityForm";

export default async function EligibilityPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("intake.create")) {
    return (
      <main className="min-h-screen p-6 bg-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray">
            Para marcar elegibilidad de adopción necesitás el permiso{" "}
            <code className="text-xs">intake.create</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white"
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
  if (!petRow) notFound();
  const pet = petRow.pet;

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto pt-10 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Elegibilidad para adopción · {pet.name}</h1>
          <p className="text-sm text-gob-text-gray">
            Marcá si este animal está listo para ser adoptado. Si no lo está, indicá el motivo y
            (opcionalmente) hasta cuándo querés que quede bloqueado.
          </p>
        </header>

        <EligibilityForm
          petPublicToken={pet.publicToken}
          orgToken={orgToken}
          current={{
            eligible: pet.adoptionEligible,
            reason: pet.adoptionIneligibleReason,
            notes: pet.adoptionIneligibleReasonNotes,
            until: pet.adoptionIneligibleUntil
              ? new Date(pet.adoptionIneligibleUntil).toISOString().slice(0, 10)
              : null,
          }}
        />

        <footer className="pt-4 border-t border-gob-border text-sm">
          <Link href={`/org/${orgToken}/mascotas`} className="text-gob-text-gray underline">
            ← Volver al listado
          </Link>
        </footer>
      </div>
    </main>
  );
}
