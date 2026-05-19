import { createNoteAction } from "@/app/actions/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import Link from "next/link";
import { NoteForm } from "./NoteForm";

export default async function NewNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ text?: string; occurredAt?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const defaults = {
    text: sp.text ?? null,
    occurredAt: sp.occurredAt ?? null,
  };

  const boundAction = createNoteAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Nota
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cualquier observación sobre {pet.name} que valga la pena recordar.
          </p>
        </div>
        <NoteForm action={boundAction} defaults={defaults} />
      </div>
    </main>
  );
}
