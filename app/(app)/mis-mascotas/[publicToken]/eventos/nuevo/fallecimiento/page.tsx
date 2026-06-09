import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createDeathRecordAction } from "@/src/modules/events/actions";
import { redirect } from "next/navigation";
import { DeathRecordForm } from "./DeathRecordForm";

export default async function NewDeathRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ occurredAt?: string; notes?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }

  const defaults = {
    occurredAt: sp.occurredAt ?? null,
    notes: sp.notes ?? null,
  };

  const boundAction = createDeathRecordAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <DeathRecordForm action={boundAction} species={pet.species} defaults={defaults} />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
