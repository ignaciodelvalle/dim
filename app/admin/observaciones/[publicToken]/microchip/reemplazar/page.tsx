import { db, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplaceMicrochipForm } from "./ReplaceMicrochipForm";
import { replaceMicrochipAdminAction } from "./action";

export default async function ReplaceMicrochipAdminPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  await requireAdminOrRedirect();

  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!pet) notFound();

  const boundAction = replaceMicrochipAdminAction.bind(null, pet.publicToken);

  if (!pet.microchipId) {
    return (
      <main className="px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Link
            href={`/admin/observaciones/${pet.publicToken}`}
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
          >
            ← Volver
          </Link>
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
              Reemplazar microchip — {pet.name}
            </h1>
            <p className="text-sm text-gob-text-gray ">
              {pet.name} no tiene microchip registrado todavía.
            </p>
          </header>
        </div>
      </main>
    );
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href={`/admin/observaciones/${pet.publicToken}`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Volver
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Reemplazar microchip — {pet.name}
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Acción administrativa. Todas las razones están disponibles, incluidas fraude y
            duplicado. Quedará registrado en el log de auditoría.
          </p>
        </header>

        <ReplaceMicrochipForm action={boundAction} currentChip={pet.microchipId} />
      </div>
    </main>
  );
}
