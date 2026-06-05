import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOrgAccessByToken } from "@/lib/auth-guards";

import { EditOrgForm } from "./EditOrgForm";

export default async function OrgConfigPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  // Only admins can edit the org profile. Non-admins see a friendly notice
  // instead of a crash or a blank redirect — they land on this URL via the nav.
  if (membership.role !== "admin") {
    redirect(`/org/${orgToken}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <nav className="text-xs text-gob-text-muted">
          <Link href={`/org/${orgToken}`} className="hover:underline">
            Panel
          </Link>
          {" / "}
          <span>Configuración</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gob-text">Configuración de la organización</h1>
        <p className="text-sm text-gob-text-gray">
          Editá el perfil público de <strong>{organization.displayName}</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-gob-border bg-white p-6">
        <EditOrgForm organization={organization} />
      </div>

      <p className="text-xs text-gob-text-muted">
        El tipo de organización, la jurisdicción y el estado de verificación son gestionados por el
        equipo de MiMAR.
      </p>
    </div>
  );
}
