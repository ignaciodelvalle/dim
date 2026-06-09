import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createMicrochipAction } from "@/src/modules/events/actions";
import { MicrochipForm } from "./MicrochipForm";

export default async function NewMicrochipPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ chipNumber?: string; occurredAt?: string; notes?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const defaults = {
    chipNumber: sp.chipNumber ?? null,
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createMicrochipAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <MicrochipForm action={boundAction} defaults={defaults} />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
