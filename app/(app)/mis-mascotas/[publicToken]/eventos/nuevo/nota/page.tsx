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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Otro tipo de evento
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Nota</h1>
          <p className="text-sm text-gob-text-gray ">
            Cualquier observación sobre {pet.name} que valga la pena recordar.
          </p>
        </div>
        <NoteForm action={boundAction} defaults={defaults} />
      </div>
    </main>
  );
}
