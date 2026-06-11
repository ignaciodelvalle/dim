// Marcar como perdida — Libreta Nacional redesign.
// Presentation only; MarkLostWizard and server action unchanged.

import Link from "next/link";
import { redirect } from "next/navigation";

import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { requireOwnedPetByToken } from "@/lib/pets";
import { setPetLostAction } from "@/src/modules/events/actions";
import { MarkLostWizard } from "./MarkLostWizard";

export default async function MarkPetLostPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  if (pet.status === "lost") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }
  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const boundAction = setPetLostAction.bind(null, pet.publicToken);
  const canonicalIds = await fetchActiveIdentifications(pet.id);

  const disclosureDefaults = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Marcar como perdida
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Al marcar a {pet.name} como perdida, su credencial pública mostrará la información que
          elijas a continuación. Podés cambiarla en cualquier momento o revertir el estado cuando
          aparezca.
        </p>
      </div>

      <MarkLostWizard
        action={boundAction}
        disclosureDefaults={disclosureDefaults}
        petName={pet.name}
        petPublicToken={pet.publicToken}
        petHasMicrochip={canonicalIds.microchip !== null}
        petHasTattoo={canonicalIds.tattoo !== null}
        petColor={pet.color ?? null}
        petDistinguishingFeatures={pet.distinguishingFeatures ?? null}
        petJurisdictionProvince={pet.jurisdictionProvince ?? null}
        petJurisdictionLocality={pet.jurisdictionLocality ?? null}
      />
    </div>
  );
}
