import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplaceMicrochipForm } from "./ReplaceMicrochipForm";
import { replaceMicrochipVetAction } from "./action";

export default async function ReplaceMicrochipVetPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;

  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("event.write")) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <div className="max-w-md mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold text-gob-text">Permiso requerido</h1>
          <p className="text-sm text-gob-text-gray">
            Para registrar eventos de identificación necesitás el permiso{" "}
            <code className="text-xs bg-gob-surface-alt px-1 rounded">event.write</code>.
          </p>
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
          >
            ← Volver a mascotas
          </Link>
        </div>
      </main>
    );
  }

  const [petRow] = await db
    .select({ pet: pets, role: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
        inArray(ownerships.role, ["shelter_custody", "foster"]),
      ),
    )
    .limit(1);

  if (!petRow) notFound();
  const { pet } = petRow;

  const boundAction = replaceMicrochipVetAction.bind(null, orgToken, pet.publicToken);

  if (!pet.microchipId) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <div className="max-w-md mx-auto pt-8 space-y-8">
          <Link
            href={`/org/${orgToken}/mascotas`}
            className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
          >
            ← Volver a mascotas
          </Link>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
              Reemplazar microchip — {pet.name}
            </h1>
            <p className="text-sm text-gob-text-gray">
              {pet.name} no tiene microchip registrado todavía.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/org/${orgToken}/mascotas`}
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
        >
          ← Volver a mascotas
        </Link>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            Reemplazar microchip — {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray">
            Registrá el cambio de chip. Si detectás un duplicado, se abre un caso de investigación
            automáticamente.
          </p>
        </div>
        <ReplaceMicrochipForm action={boundAction} currentChip={pet.microchipId} />
      </div>
    </main>
  );
}
