import { createTattooAction } from "@/app/actions/tattoo";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { TattooForm } from "./TattooForm";

export default async function NewTattooPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const boundAction = createTattooAction.bind(null, pet.publicToken);

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
            Tatuaje registrado
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Registrá el tatuaje de {pet.name} como identificador secundario al microchip. La foto es
            obligatoria — es lo que permite a quien la encuentre confirmarlo visualmente.
          </p>
        </div>
        <TattooForm action={boundAction} />
      </div>
    </main>
  );
}
