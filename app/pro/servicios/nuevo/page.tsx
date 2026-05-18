// /pro/servicios/nuevo — create a new service offering as independent vet (Fase 2.5).
// Gated by requireVetProviderOrRedirect.

import Link from "next/link";

import { createServiceOfferingForVetProviderAction } from "@/app/actions/service-offerings";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { SERVICE_KINDS } from "@/lib/service-kinds";

import { VetServiceOfferingForm } from "./VetServiceOfferingForm";

export default async function NuevoServicioVetPage() {
  await requireVetProviderOrRedirect();

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Portal profesional</p>
          <h1 className="text-3xl font-semibold">Nuevo servicio</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Completá los datos del servicio. Una vez enviado, la autoridad competente lo revisa y
            aprueba antes de que puedas armar la agenda.
          </p>
        </header>

        <VetServiceOfferingForm
          serviceKinds={SERVICE_KINDS}
          createAction={createServiceOfferingForVetProviderAction}
        />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/pro/servicios"
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver a mis servicios
          </Link>
        </footer>
      </div>
    </main>
  );
}
