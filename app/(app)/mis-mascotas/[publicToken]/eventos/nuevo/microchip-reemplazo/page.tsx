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
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-md mx-auto pt-8 space-y-8">
          <Link
            href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
          >
            ← Otro tipo de evento
          </Link>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
              Reemplazar microchip
            </h1>
            <p className="text-sm text-gob-text-gray ">
              {pet.name} no tiene microchip registrado todavía. Para reemplazarlo primero tenés que
              registrar el chip original.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/microchip`}
              className="inline-block px-4 py-2 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  transition-colors"
            >
              Registrar microchip implantado
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
            Reemplazar microchip
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Registrá el cambio de chip de {pet.name}. El número anterior queda en el historial.
          </p>
        </div>
        <ReplaceMicrochipForm action={boundAction} currentChip={pet.microchipId} />
      </div>
    </main>
  );
}
