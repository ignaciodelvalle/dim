import Link from "next/link";
import { notFound } from "next/navigation";

import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, isNull } from "drizzle-orm";

import { AdoptionListingForm } from "./AdoptionListingForm";

export default async function AdoptarOrgPage({
  params,
}: {
  params: Promise<{ orgToken: string; publicToken: string }>;
}) {
  const { orgToken, publicToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("adoption.listing.manage")) {
    return (
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para publicar adopciones necesitás el permiso{" "}
            <code className="text-xs">adoption.listing.manage</code>.
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
  if (!petRow) notFound();
  const pet = petRow.pet;

  // Pre-compute the four cross-spec guards so the form can show the right
  // reason next to a disabled "Publicar" button instead of failing on submit.
  const guards = {
    notLost: pet.status !== "lost",
    notDeceased: pet.status !== "deceased",
    eligible: pet.adoptionEligible === true,
    noDispute: pet.inCustodyDispute !== true,
    notInRabies: pet.rabiesObservationStatus !== "in_progress",
  };
  const blockingReasons: string[] = [];
  if (!guards.notLost) blockingReasons.push("La mascota figura como perdida.");
  if (!guards.notDeceased) blockingReasons.push("La mascota está registrada como fallecida.");
  if (!guards.eligible)
    blockingReasons.push(
      "La mascota no está marcada como apta para adopción todavía. Marcala apta primero en la pestaña de Elegibilidad.",
    );
  if (!guards.noDispute)
    blockingReasons.push("Hay una disputa de custodia abierta sobre esta mascota.");
  if (!guards.notInRabies)
    blockingReasons.push(
      "La mascota está en período de observación sanitaria (10 días antirrábica).",
    );
  const canPublish = blockingReasons.length === 0;

  const isPublished = pet.adoptionListedAt !== null && pet.adoptionListingPausedAt === null;
  const isPaused = pet.adoptionListedAt !== null && pet.adoptionListingPausedAt !== null;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}/mascotas`}
          className="text-sm text-gob-text-muted hover:text-gob-text "
        >
          ← Volver al listado
        </Link>

        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold text-gob-text ">
            Publicar en adopción · {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Esto controla la aparición de {pet.name} en <code className="text-xs">/adoptar</code> +
            ficha pública.
          </p>
        </header>

        <section className="rounded-lg border border-gob-border-strong  p-4 space-y-2">
          <p className="text-sm font-medium text-gob-text ">Estado actual</p>
          <p className="text-sm text-gob-text-gray ">
            {isPublished
              ? "Publicada y visible en /adoptar."
              : isPaused
                ? "Pausada — contenido conservado, no aparece en /adoptar."
                : "No publicada — sin presencia en /adoptar."}
          </p>
        </section>

        {!canPublish && (
          <section className="rounded-lg border border-gob-warning bg-gob-warning/10   p-4 space-y-2">
            <p className="text-sm font-medium text-gob-warning-text ">Bloqueos para publicar</p>
            <ul className="text-xs text-gob-warning-text  space-y-1 list-disc pl-5">
              {blockingReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="text-xs text-gob-warning-text  pt-1">
              Podés igual editar la historia y los requisitos para tenerlos listos cuando la mascota
              califique.
            </p>
          </section>
        )}

        <AdoptionListingForm
          petPublicToken={publicToken}
          initial={{
            isPublished,
            isPaused,
            story: pet.adoptionStory,
            requirements: pet.adoptionRequirements,
            ageBucket: pet.adoptionAgeBucket,
            sizeEstimate: pet.adoptionSizeEstimate,
            energyLevel: pet.adoptionEnergyLevel,
            goodWithKids: pet.adoptionGoodWithKids,
            goodWithDogs: pet.adoptionGoodWithDogs,
            goodWithCats: pet.adoptionGoodWithCats,
            needsYard: pet.adoptionNeedsYard,
            feeArs: pet.adoptionFeeArs,
          }}
          canPublish={canPublish}
          petSex={pet.sex}
        />
      </div>
    </main>
  );
}
