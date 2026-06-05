// Invite member page — server guard + role computation, then delegates to InviteForm.
//
// Grantable roles: roles with rank ≤ inviter's rank, excluding foster
// (comes via foster-proposal flow per spec org-invitations v1).
// This mirrors the exact bounding the server action applies so the form
// only ever presents roles the action will accept.

import { redirect } from "next/navigation";

import { type InvitableRole, ROLE_RANK } from "@/app/actions/org-invitations.constants";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";

import { InviteForm } from "./InviteForm";

const ROLE_LABELS: Record<InvitableRole, string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  member: "Miembro",
  volunteer: "Voluntario",
  vet_individual: "Veterinario",
};

export default async function InvitarMiembroPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("member.invite")) {
    // Redirect back to the members list if the user lost the capability.
    redirect(`/org/${orgToken}/miembros`);
  }

  const inviterRank = ROLE_RANK[membership.role];

  // All invitable roles (foster excluded) that are ≤ the inviter's rank.
  const INVITABLE: InvitableRole[] = [
    "admin",
    "coordinator",
    "member",
    "volunteer",
    "vet_individual",
  ];
  const grantableRoles = INVITABLE.filter((role) => ROLE_RANK[role] <= inviterRank);

  const grantableRoleOptions = grantableRoles.map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
  }));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gob-text">Invitar miembro</h1>
        <p className="mt-1 text-sm text-gob-text-gray">
          La persona recibirá un link para unirse a {organization.displayName}. El link vence en 14
          días.
        </p>
      </div>
      <InviteForm
        organizationId={organization.id}
        orgToken={orgToken}
        grantableRoles={grantableRoleOptions}
      />
    </div>
  );
}
