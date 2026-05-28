// Pet claim wizard — chip/tatuaje cross-check + disputa (handoff P3-1).
//
// Three-step flow. See app/actions/pet-claim.ts for variants and the
// custody_dispute integration. The legacy DNI stub claim lives at
// /reclamar-dni (renamed in this PR).

import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { ClaimWizard } from "./ClaimWizard";

export default async function ClaimPage() {
  await requireUserOrRedirect();

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Reclamar una mascota
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Si tu mascota ya está registrada por su microchip o tatuaje, podés vincularla a tu
            cuenta — o iniciar una disputa si figura a nombre de otra persona.
          </p>
        </header>

        <ClaimWizard />

        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          <p className="font-medium text-neutral-800 dark:text-neutral-200">
            ¿Te adoptó un refugio?
          </p>
          <p className="mt-1">
            Si te registraron por DNI durante la adopción,{" "}
            <Link
              href="/mis-mascotas/reclamar-dni"
              className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              reclamá por DNI acá
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
