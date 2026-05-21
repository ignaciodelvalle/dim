import Link from "next/link";

import { requireOwnedPetByToken } from "@/lib/pets";

import { CaptureBox } from "./CaptureBox";

// Captura rápida — entry point. Server component, owner-gated. The
// keyword matching + deeplink building happens entirely client-side so
// there's no network round-trip for the user typing.

export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ text?: string; kind?: string }>;
}) {
  const { publicToken } = await params;
  const { text, kind } = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-8 space-y-6">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Anotar algo de {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Contanos qué pasó. Te llevamos al formulario correcto con los datos que pudimos
            identificar. Si preferís, abajo tenés atajos para los eventos más comunes.
          </p>
        </header>

        <CaptureBox
          petPublicToken={pet.publicToken}
          petName={pet.name}
          initialText={text}
          initialKind={kind}
        />
      </div>
    </main>
  );
}
