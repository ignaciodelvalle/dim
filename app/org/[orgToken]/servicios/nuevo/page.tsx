// Org portal — create new service offering. Capability-gated: requires
// service_offering.create. On submit the offering lands in pending_approval
// and notifications fan out to the governing authority (govt or admin fallback).

import Link from "next/link";

import { createServiceOfferingAction } from "@/app/actions/service-offerings";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { SERVICE_KINDS } from "@/lib/service-kinds";

import { ServiceOfferingForm } from "./ServiceOfferingForm";

export default async function NuevoServicioPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);

  if (!granted.has("service_offering.create")) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-neutral-700 dark:text-neutral-300">
            Para crear servicios necesitás el permiso{" "}
            <code className="text-xs">service_offering.create</code>. Pedíselo a un administrador
            desde el panel.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Nuevo servicio</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Completá los datos del servicio. Una vez enviado, la autoridad competente lo revisa y
            aprueba antes de que puedas armar la agenda.
          </p>
        </header>

        <ServiceOfferingForm
          serviceKinds={SERVICE_KINDS}
          createAction={createServiceOfferingAction}
          orgToken={orgToken}
        />

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}/servicios`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver a mis servicios
          </Link>
        </footer>
      </div>
    </main>
  );
}
