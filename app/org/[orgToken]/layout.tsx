// Org portal layout — validates active membership for the requested orgToken.
// Returns notFound() if the org does not exist or the user has no active
// membership, so callers cannot distinguish "org exists but you're not a
// member" from "no such org" (decision D4 — no information leakage).
//
// Every page under /org/[orgToken]/* can assume the membership is valid.
// The orgToken (organizations.publicToken) is the URL-stable identifier used
// throughout this portal instead of inferring an "active org" from session.

import { eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";

import { buildOrgNav } from "@/components/layout/nav-presets";
import { OpRail, OpShell, OpTopbar } from "@/components/ui/dashboard";
import { db, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  // Validates membership. Returns notFound() on failure — never leaks org existence.
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  // profiles.displayName is NOT NULL — always present; no fallback needed.
  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const displayName = profile?.displayName ?? "";
  // Capability-gated items (Ingresos, Check-ins, Permisos) only render for
  // members holding the matching capability. The pages re-check defensively;
  // the nav filter is UX, not the security boundary.
  const granted = await getGrantedCapabilities(membership);
  const orgNav = buildOrgNav(orgToken, { granted });

  // Right-side topbar actions: personal cross-portal links (owner portal + account).
  const actions = (
    <div className="flex items-center gap-4 text-xs text-ln-op-mute">
      <Link href="/cuenta" className="text-ln-op-mute no-underline hover:text-ln-op-ink">
        Mi cuenta
      </Link>
      <Link href="/mis-mascotas" className="text-ln-op-mute no-underline hover:text-ln-op-ink">
        ← Salir
      </Link>
    </div>
  );

  return (
    <OpShell
      variant="org"
      rail={
        <OpRail
          nav={orgNav}
          variant="org"
          brandSubtitle="Organización"
          user={{ name: displayName, role: "ORG" }}
        />
      }
      topbar={
        <OpTopbar
          crumbs={[{ label: "Panel" }]}
          scope={{
            code: "ORG",
            label: organization.displayName,
            variant: "org",
          }}
          actions={actions}
          mobileNav={orgNav}
          variant="org"
          brandSubtitle="Organización"
        />
      }
    >
      {children}
    </OpShell>
  );
}
