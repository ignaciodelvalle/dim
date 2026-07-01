import { Icon } from "@/components/Icon";
import { PetForm } from "@/components/PetForm";
import { LnSheetCard, LnSheetHeader, LnSheetWrap } from "@/components/ui/Sheet";
import { attachments, db } from "@/db";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { petPhotoUrl } from "@/lib/infra/storage";
import { updatePetAction } from "@/src/modules/pets/actions";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditPetPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  // Photo: tiny side query indexed on primaryPhotoId.
  const [photo] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];

  // ARCH-S: fetch canonical chip for pre-filling the form (pets.microchipId* dropped).
  const canonicalIds = await fetchActiveIdentifications(pet.id);

  const boundAction = updatePetAction.bind(null, publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard wide>
        <LnSheetHeader
          tone="azul"
          icon={<Icon name="editar" decorative />}
          title={`Editar ${pet.name}`}
          subtitle="Cualquier cambio queda registrado en la libreta"
        />
        <div className="flex flex-col gap-[14px] px-[18px] py-[18px]">
          <Link
            href={`/mis-mascotas/${pet.publicToken}`}
            className="font-[var(--font-ln-mono)] text-[11px] tracking-[.04em] text-[var(--color-ln-azul)] underline underline-offset-2"
          >
            ← Volver al perfil
          </Link>
          <PetForm
            action={boundAction}
            existingPet={pet}
            existingPhotoUrl={petPhotoUrl(photo?.storagePath)}
            existingCanonicalChip={
              canonicalIds.microchip
                ? {
                    code: canonicalIds.microchip.code,
                    isoCountryCode: canonicalIds.microchip.isoCountryCode,
                    recordedAt: canonicalIds.microchip.recordedAt,
                    recordedByLabel: canonicalIds.microchip.recordedByLabel,
                    implantationSite: canonicalIds.microchip.implantationSite,
                  }
                : null
            }
          />
        </div>
      </LnSheetCard>
    </LnSheetWrap>
  );
}
