// Pet claim wizard — Libreta Nacional redesign.
// Presentation only; ClaimWizard client component unchanged.

import Link from "next/link";

import { LnCallout } from "@/components/ui/DocElements";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { ClaimWizard } from "./ClaimWizard";

export default async function ClaimPage() {
  await requireUserOrRedirect();

  return (
    <div className="mx-auto max-w-md px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Reclamar una mascota
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Si tu mascota ya está registrada por su microchip o tatuaje, podés vincularla a tu cuenta
          — o iniciar una disputa si figura a nombre de otra persona.
        </p>
      </div>

      <ClaimWizard />

      <div className="mt-6">
        <LnCallout tone="azul" title="¿Te adoptó un refugio?">
          Si te registraron por DNI durante la adopción,{" "}
          <Link
            href="/mis-mascotas/reclamar-dni"
            className="text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            reclamá por DNI acá →
          </Link>
        </LnCallout>
      </div>
    </div>
  );
}
