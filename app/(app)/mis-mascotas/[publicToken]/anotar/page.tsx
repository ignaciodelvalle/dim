// Captura rápida — Libreta Nacional redesign.
// Presentation only; CaptureBox client component unchanged.

import Link from "next/link";

import { requireOwnedPetByToken } from "@/lib/pets";
import { CaptureBox } from "./CaptureBox";

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
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${pet.publicToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Anotar algo de {pet.name}
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Contanos qué pasó. Te llevamos al formulario correcto con los datos que pudimos
          identificar. Si preferís, abajo tenés atajos para los eventos más comunes.
        </p>
      </div>

      <CaptureBox
        petPublicToken={pet.publicToken}
        petName={pet.name}
        initialText={text}
        initialKind={kind}
      />
    </div>
  );
}
