// Org index page — entry point for the org portal. If the user has exactly
// one active org membership they are auto-redirected to that org's dashboard.
// If they have multiple memberships they see a picker. If they have none they
// see an empty state with guidance.
//
// This replaces the old "active org inferred from session" model. The orgToken
// from the URL segment is now the only source of truth — see AGENTS.md and
// docs/superpowers/plans/2026-05-17-code-rename-refugio-to-org.md for context.

import { db, organizationMemberships, organizations } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Organización",
};

export default async function OrgIndexPage() {
  const { user } = await requireUserOrRedirect();

  const myOrgs = await db
    .select({
      org: organizations,
      membership: organizationMemberships,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(eq(organizationMemberships.userId, user.id), isNull(organizationMemberships.leftAt)),
    );

  if (myOrgs.length === 0) {
    return (
      <main className="min-h-screen bg-ln-op-page flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Sin organizaciones</h1>
          <p className="text-[13px] text-ln-op-mute">
            No sos miembro activo de ninguna organización. Si tu organización te invitó, revisá tu
            email para aceptar la invitación. Si querés registrar una nueva, andá a{" "}
            <Link href="/cuenta/upgrade" className="underline text-ln-op-azul">
              /cuenta/upgrade
            </Link>
            .
          </p>
          <Link
            href="/mis-mascotas"
            className="inline-block px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium"
          >
            Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  if (myOrgs.length === 1) {
    // Single membership — auto-redirect to that org's dashboard.
    redirect(`/org/${myOrgs[0].org.publicToken}`);
  }

  // Multiple memberships — render a picker so the user can choose.
  return (
    <main className="min-h-screen bg-ln-op-page p-6">
      <div className="max-w-2xl mx-auto pt-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Seleccionar organización</h1>
          <p className="text-[13px] text-ln-op-mute">
            Pertenecés a {myOrgs.length} organizaciones. Elegí con cuál querés trabajar.
          </p>
        </header>
        <ul className="space-y-3">
          {myOrgs.map(({ org, membership }) => (
            <li key={org.id}>
              <Link
                href={`/org/${org.publicToken}`}
                className="block p-4 rounded-[6px] border border-ln-op-line bg-ln-op-card hover:bg-ln-op-stripe transition-colors no-underline"
              >
                <p className="text-[13px] font-semibold text-ln-op-ink">{org.displayName}</p>
                <p className="text-[12px] text-ln-op-mute mt-0.5">
                  {ORG_TYPE_LABELS[org.orgType] ?? org.orgType}
                  {org.jurisdictionLocality ? ` · ${org.jurisdictionLocality}` : ""}
                  {" · "}
                  {membership.role}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
