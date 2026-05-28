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
      <main className="min-h-screen p-6 bg-white  flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray ">
            Para crear servicios necesitás el permiso{" "}
            <code className="text-xs">service_offering.create</code>. Pedíselo a un administrador
            desde el panel.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white  "
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gob-text-muted">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Nuevo servicio</h1>
          <p className="text-sm text-gob-text-gray ">
            Completá los datos del servicio. Una vez enviado, la autoridad competente lo revisa y
            aprueba antes de que puedas armar la agenda.
          </p>
        </header>

        <ServiceOfferingForm
          serviceKinds={SERVICE_KINDS}
          createAction={createServiceOfferingAction}
          orgToken={orgToken}
        />

        <footer className="pt-4 border-t border-gob-border ">
          <Link
            href={`/org/${orgToken}/servicios`}
            className="text-sm text-gob-text-gray underline "
          >
            ← Volver a mis servicios
          </Link>
        </footer>
      </div>
    </main>
  );
}
