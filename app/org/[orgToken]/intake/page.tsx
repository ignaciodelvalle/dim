// Intake page — capability-gated entry point for the org portal's
// "registrar ingreso" flow. The action that backs the form (createIntakeAction)
// re-checks `intake.create` defensively so this page is best-effort UX, not
// the security boundary.

import Link from "next/link";

import { OpBreach, OpCrumbs } from "@/components/ui/dashboard";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

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
      <div className="flex items-center justify-center py-16">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Permiso requerido</h1>
          <p className="text-[13px] text-ln-op-mute">
            Para registrar ingresos necesitás el permiso{" "}
            <code className="text-[12px] font-mono">intake.create</code>. Pedíselo a un
            administrador desde el panel.
          </p>
          <Link
            href={`/org/${orgToken}`}
            className="inline-block rounded-[6px] bg-ln-op-azul px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity no-underline"
          >
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <OpCrumbs
        items={[{ label: "Panel", href: `/org/${orgToken}` }, { label: "Registrar ingreso" }]}
      />

      <header className="space-y-1">
        <p className="text-[12px] uppercase tracking-wider text-ln-op-mute">
          {organization.displayName}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Registrar ingreso</h1>
        <p className="text-[13px] text-ln-op-mute">
          Cargá los datos básicos del animal y el motivo de ingreso. La organización queda como
          custodia temporal hasta que se asigne tránsito o se concrete una adopción.
        </p>
      </header>

      <IntakeForm orgToken={orgToken} />

      <footer className="pt-4 border-t border-ln-op-line">
        <Link
          href={`/org/${orgToken}`}
          className="text-[13px] text-ln-op-azul hover:underline no-underline"
        >
          ← Volver al panel
        </Link>
      </footer>
    </div>
  );
}
