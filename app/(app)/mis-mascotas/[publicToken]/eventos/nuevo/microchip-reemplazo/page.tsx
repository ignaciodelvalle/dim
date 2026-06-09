import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { ReplaceMicrochipForm } from "./ReplaceMicrochipForm";
import { replaceMicrochipOwnerAction } from "./action";

export default async function ReplaceMicrochipPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const boundAction = replaceMicrochipOwnerAction.bind(null, pet.publicToken);

  if (!pet.microchipId) {
    return (
      <LnSheetWrap>
        <LnSheetCard>
          <div className="px-[18px] py-[24px] space-y-[12px]">
            <p className="font-[var(--font-ln-serif)] text-[16px] font-semibold text-[var(--color-ln-ink)]">
              Sin microchip registrado
            </p>
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              {pet.name} no tiene microchip registrado todavía. Para reemplazarlo primero tenés que
              registrar el chip original.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/microchip`}
              className="inline-block rounded-[3px] border border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] px-[14px] py-[8px] font-[var(--font-ln-mono)] text-[11.5px] font-semibold text-white"
            >
              Registrar microchip implantado
            </Link>
          </div>
        </LnSheetCard>
      </LnSheetWrap>
    );
  }

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <ReplaceMicrochipForm action={boundAction} currentChip={pet.microchipId} />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
