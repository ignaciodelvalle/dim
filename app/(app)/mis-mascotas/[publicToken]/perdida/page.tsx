import { setPetLostAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarkLostForm } from "./MarkLostForm";

export default async function MarkPetLostPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet } = session;

  if (pet.status === "lost") {
    redirect(`/mis-mascotas/${pet.publicToken}`);
  }
  if (pet.status === "deceased") {
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const boundAction = setPetLostAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Marcar como perdida
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Al marcar a {pet.name} como perdida, su credencial pública mostrará tu nombre y un
            contacto directo para que quien la encuentre pueda avisarte. Podés revertirlo cuando
            aparezca.
          </p>
        </div>
        <MarkLostForm action={boundAction} />
      </div>
    </main>
  );
}
