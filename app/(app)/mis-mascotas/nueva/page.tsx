// Nueva mascota — Libreta Nacional redesign.
// Minimal first step: name + species + sex only.
// Full profile can be completed from /mis-mascotas/[token]/editar after create.

import Link from "next/link";

import { createPetAction } from "@/src/modules/pets/actions";
import { MinimalNewPetForm } from "./MinimalNewPetForm";

export default function NewPetPage() {
  // Auth is enforced by the (app) layout above us.
  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Nueva mascota
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Empezamos con lo mínimo. Vas a poder completar el resto en su perfil.
        </p>
      </div>

      <MinimalNewPetForm action={createPetAction} />
    </div>
  );
}
