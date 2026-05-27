// Intake page — capability-gated entry point for the org portal's
// "registrar ingreso" flow. The action that backs the form (createIntakeAction)
// re-checks `intake.create` defensively so this page is best-effort UX, not
// the security boundary.

import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import Link from "next/link";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("intake.create")) {
    return (
      <main className="min-h-screen p-6 bg-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Permiso requerido</h1>
          <p className="text-gob-text-gray">
            Para registrar ingresos necesitás el permiso{" "}
            <code className="text-xs">intake.create</code>. Pedíselo a un administrador desde el
            panel.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block px-4 py-2 rounded bg-gob-primary text-white"
          >
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName}
          </p>
          <h1 className="text-3xl font-semibold">Registrar ingreso</h1>
          <p className="text-sm text-gob-text-gray">
            Cargá los datos básicos del animal y el motivo de ingreso. La organización queda como
            custodia temporal hasta que se asigne tránsito o se concrete una adopción.
          </p>
        </header>

        <IntakeForm orgToken={orgToken} />

        <footer className="pt-4 border-t border-gob-border">
          <Link href={`/org/${orgToken}`} className="text-sm text-gob-text-gray underline">
            ← Volver al panel
          </Link>
        </footer>
      </div>
    </main>
  );
}
