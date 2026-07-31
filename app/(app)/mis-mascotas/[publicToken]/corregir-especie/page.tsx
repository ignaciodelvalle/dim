import { Icon } from "@/components/Icon";
import { LnSheetCard, LnSheetHeader, LnSheetWrap } from "@/components/ui/Sheet";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { correctPetSpeciesAction } from "@/src/modules/pets/actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectSpeciesForm } from "./CorrectSpeciesForm";

export default async function CorrectSpeciesPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { pet } = access;

  const boundAction = correctPetSpeciesAction.bind(null, publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <LnSheetHeader
          tone="azul"
          icon={<Icon name="editar" decorative />}
          title="Corregir especie"
          subtitle="La corrección queda registrada en la libreta"
        />
        <div className="flex flex-col gap-3.5 px-[18px] py-[18px]">
          <Link
            href={`/mis-mascotas/${pet.publicToken}/editar`}
            className="font-ln-mono text-[11px] tracking-[.04em] text-[var(--color-ln-azul)] underline underline-offset-2"
          >
            ← Volver a editar
          </Link>
          <CorrectSpeciesForm
            action={boundAction}
            currentSpecies={pet.species}
            petName={pet.name}
          />
        </div>
      </LnSheetCard>
    </LnSheetWrap>
  );
}
