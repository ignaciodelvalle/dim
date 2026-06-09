import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createClinicalInfoAction } from "@/src/modules/events/actions";
import { ClinicalInfoForm } from "./ClinicalInfoForm";

export default async function NewClinicalInfoPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const boundAction = createClinicalInfoAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <ClinicalInfoForm action={boundAction} />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
