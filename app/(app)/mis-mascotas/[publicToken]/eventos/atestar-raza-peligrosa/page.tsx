import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { requireOwnedPetByToken } from "@/lib/infra/pets";
import { createDangerousBreedAttestationAction } from "@/src/modules/events/actions";
import { redirect } from "next/navigation";
import { DangerousBreedAttestationForm } from "./DangerousBreedAttestationForm";

export default async function NewDangerousBreedAttestationPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  // Only relevant for pets flagged as potentially dangerous breed. Anyone else
  // bouncing to this URL gets sent back to the pet detail.
  if (!pet.potentiallyDangerousBreed) {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }
  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }

  const boundAction = createDangerousBreedAttestationAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <DangerousBreedAttestationForm action={boundAction} />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
