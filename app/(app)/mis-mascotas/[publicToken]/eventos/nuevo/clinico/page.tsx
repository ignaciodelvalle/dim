import { createClinicalInfoAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Información clínica
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Análisis, imágenes, cirugías, alergias y más para {pet.name}.
          </p>
        </div>
        <ClinicalInfoForm action={boundAction} />
      </div>
    </main>
  );
}
