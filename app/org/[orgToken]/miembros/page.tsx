// Org members page — active member list + pending invitations.
// Invitations and revoke controls are shown only to users holding member.invite.

import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";

import { Badge, EmptyState } from "@/components/poncho";
import { db, organizationInvitations, organizationMemberships, profiles } from "@/db";
import type { OrganizationMembership } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";

import { CopyLinkButton } from "./CopyLinkButton";
import { RevokeButton } from "./RevokeButton";

const ROLE_LABEL: Record<OrganizationMembership["role"], string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  member: "Miembro",
  volunteer: "Voluntario",
  vet_individual: "Veterinario",
  foster: "Tránsito",
};

const ROLE_BADGE_VARIANT: Record<
  OrganizationMembership["role"],
  "info" | "success" | "warning" | "neutral"
> = {
  admin: "info",
  coordinator: "success",
  member: "neutral",
  volunteer: "neutral",
  vet_individual: "warning",
  foster: "neutral",
};

export default async function MiembrosPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  const canInvite = granted.has("member.invite");

  // Active members joined with their profiles.
  const members = await db
    .select({
      membership: organizationMemberships,
      profile: profiles,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organization.id),
        isNull(organizationMemberships.leftAt),
      ),
    );

  // Pending invitations: not accepted, not revoked, not yet expired.
  // Only fetched when the viewer holds member.invite (avoids leaking invite
  // details to members who can't manage them).
  const now = new Date();
  const pendingInvitations = canInvite
    ? await db
        .select()
        .from(organizationInvitations)
        .where(
          and(
            eq(organizationInvitations.organizationId, organization.id),
            isNull(organizationInvitations.acceptedAt),
            isNull(organizationInvitations.revokedAt),
            gt(organizationInvitations.expiresAt, now),
          ),
        )
    : [];

  const appBase = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.gob.ar";

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gob-text">Equipo</h1>
          <p className="mt-1 text-sm text-gob-text-gray">
            Miembros activos e invitaciones pendientes de {organization.displayName}.
          </p>
        </div>
        {canInvite && (
          <Link
            href={`/org/${orgToken}/miembros/invitar`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gob-primary px-5 py-2 text-sm font-semibold text-white hover:bg-gob-primary-hover transition-colors"
          >
            Invitar miembro
          </Link>
        )}
      </header>

      {/* Active members */}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-base font-semibold text-gob-text">
          Miembros activos ({members.length})
        </h2>
        {members.length === 0 ? (
          <EmptyState
            icon="person"
            title="Sin miembros"
            description="Aún no hay miembros registrados en esta organización."
          />
        ) : (
          <ul className="divide-y divide-gob-border rounded-xl border border-gob-border bg-white">
            {members.map(({ membership: m, profile }) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gob-text">
                    {profile.displayName}
                  </p>
                  {m.title && <p className="truncate text-xs text-gob-text-muted">{m.title}</p>}
                </div>
                <Badge variant={ROLE_BADGE_VARIANT[m.role]}>{ROLE_LABEL[m.role]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending invitations — visible only to users with member.invite */}
      {canInvite && (
        <section aria-labelledby="invitations-heading">
          <h2 id="invitations-heading" className="mb-3 text-base font-semibold text-gob-text">
            Invitaciones pendientes ({pendingInvitations.length})
          </h2>
          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon="mail"
              title="Sin invitaciones activas"
              description="Invitá a alguien con el botón de arriba."
            />
          ) : (
            <ul className="divide-y divide-gob-border rounded-xl border border-gob-border bg-white">
              {pendingInvitations.map((inv) => {
                const inviteUrl = `${appBase}/r/invite/${inv.invitationToken}`;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gob-text">{inv.email}</p>
                      <p className="text-xs text-gob-text-muted">
                        Vence{" "}
                        {inv.expiresAt.toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge variant={ROLE_BADGE_VARIANT[inv.invitedRole]}>
                      {ROLE_LABEL[inv.invitedRole]}
                    </Badge>
                    <div className="flex shrink-0 gap-2">
                      <CopyLinkButton url={inviteUrl} />
                      <RevokeButton
                        organizationId={organization.id}
                        invitationToken={inv.invitationToken}
                        email={inv.email}
                        orgToken={orgToken}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
