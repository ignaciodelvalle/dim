// Org portal layout — validates active membership for the requested orgToken.
// Returns notFound() if the org does not exist or the user has no active
// membership, so callers cannot distinguish "org exists but you're not a
// member" from "no such org" (decision D4 — no information leakage).
//
// Every page under /org/[orgToken]/* can assume the membership is valid.
// The orgToken (organizations.publicToken) is the URL-stable identifier used
// throughout this portal instead of inferring an "active org" from session.

import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { buildOrgNav } from "@/components/layout/nav-presets";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OrgBreadcrumbs } from "@/components/ui/dashboard/OrgBreadcrumbs";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { getProfileCached } from "@/lib/request-cache";
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

  // getProfileCached is warmed by requireOrgAccessByToken → requireUserOrRedirect;
  // this is a memoized hit within the same render pass, not a second DB round-trip.
  const profile = await getProfileCached(user.id);
  const displayName = profile?.displayName ?? "";
  // Capability-gated items (Ingresos, Check-ins, Permisos) only render for
  // members holding the matching capability. The pages re-check defensively;
  // the nav filter is UX, not the security boundary.
  const granted = await getGrantedCapabilities(membership);
  const orgNavSections = buildOrgNav(orgToken, { granted });

  // Right-side topbar actions: personal cross-portal links (owner portal + account).
  // ContextSwitcher is not added here: owner/vet with no additional org memberships
  // returns an empty switcher. The explicit "Salir" escape preserves 1:1 parity
  // with the previous layout until Phase C adds full org-membership enumeration.
  const topbarActions = (
    <div className="flex items-center gap-3">
      <Link href="/cuenta" className="text-xs text-ln-op-mute no-underline hover:text-ln-op-ink">
        Mi cuenta
      </Link>
      <Link
        href="/mis-mascotas"
        className="text-xs text-ln-op-mute no-underline hover:text-ln-op-ink"
      >
        ← Salir
      </Link>
    </div>
  );

  return (
    <AppShell
      variant="operator"
      rail={
        <OpRail
          sections={orgNavSections}
          variant="org"
          brandSubtitle="Organización"
          user={{ name: displayName, role: "ORG" }}
        />
      }
      topbar={
        <header className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-6 py-[11px]">
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={orgNavSections} variant="org" brandSubtitle="Organización" />
          {/* Left: org breadcrumbs (client component, uses usePathname) */}
          <OrgBreadcrumbs orgToken={orgToken} />
          {/* Scope chip */}
          <OpScopeChip code="ORG" label={organization.displayName} variant="org" />
          {/* Spacer */}
          <div className="flex-1" />
          {/* Right: actions */}
          <div className="flex items-center gap-2">{topbarActions}</div>
        </header>
      }
    >
      {children}
    </AppShell>
  );
}
