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

import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { buildOrgNav } from "@/components/layout/nav-presets";
import type { NavSection } from "@/components/ui/dashboard";
import { OpMaintenanceScreen, OpOfflineBanner, OpOmnibox } from "@/components/ui/dashboard";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OrgBreadcrumbs } from "@/components/ui/dashboard/OrgBreadcrumbs";
import type { OrganizationCapability } from "@/db";
import { applicableOrgQueues } from "@/lib/analytics/org-dashboard";
import { isMaintenanceMode } from "@/lib/domain/maintenance-mode";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import {
  getOrgQueueCountsCached,
  getProfileCached,
  orgQueueCacheKey,
} from "@/lib/infra/request-cache";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgToken: string }>;
}) {
  // Maintenance kill-switch short-circuits BEFORE any auth/data fetch — no
  // rail/topbar data exists yet, so the screen renders full-page, unwrapped.
  if (isMaintenanceMode(process.env.NEXT_PUBLIC_MAINTENANCE_MODE)) {
    return <OpMaintenanceScreen />;
  }

  const { orgToken } = await params;
  // Validates membership. Returns notFound() on failure — never leaks org existence.
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  // getProfileCached is warmed by requireOrgAccessByToken → requireUserOrRedirect;
  // this is a memoized hit within the same render pass, not a second DB round-trip.
  const profile = await getProfileCached(user.id);
  const displayName = profile?.displayName ?? "";
  // Capability-gated items (Ingresos, Check-ins, Permisos) only render for
  // members holding the matching capability. The pages re-check defensively;
  // the nav filter is UX, not the security boundary — so a query failure here
  // must never take down the whole org shell. Next.js does not wrap a
  // segment's own layout.tsx in its sibling error.tsx boundary, so an
  // unguarded throw would bypass app/org/[orgToken]/error.tsx and fall through
  // to the fullscreen root boundary (error-path audit 2026-07-04, finding E4).
  // Default to no granted capabilities: nav items simply stay hidden, and the
  // page-level defensive re-check still protects the actual security boundary.
  const granted = await getGrantedCapabilities(membership).catch((err) => {
    console.error("[OrgLayout] getGrantedCapabilities failed", err);
    return new Set<OrganizationCapability>();
  });
  const orgNavSections = buildOrgNav(orgToken, {
    granted,
    orgType: organization.orgType,
    // Role gates the two role-based nav items (Maltrato welfare inbox,
    // Configuración admin-only) so the sidebar matches each page's own guard.
    role: membership.role,
  });

  // Nav pending-count badges (task #18): reuse the org pending-queue engine —
  // the SAME applicability + counts as the panel "Pendientes" surface — and
  // overlay each actionable nav item with its live count. ONE batched fetch
  // covers every badge. Only badgeable queues (those that map to a nav item)
  // participate; informational queues (tránsitos activos) carry no badge.
  //
  // The full `applicableOrgQueues` list (not just the navPath subset) is
  // fetched here — same key set the page below asks for — so `getOrgQueueCountsCached`
  // (request-memoized by (orgId, sorted key list)) hits ONE shared batch for
  // the whole render pass instead of layout + page each issuing it (adversarial
  // review 2026-07-10, MED 11). Badges are filtered from the shared result.
  //
  // Resilient like the admin outbox/alertas badges: a badge-count failure must
  // never take down the org shell (badges are UX, not a security gate), and
  // Next does not wrap a segment's own layout.tsx in its sibling error.tsx —
  // an unguarded throw here would bypass app/org/[orgToken]/error.tsx and fall
  // through to the fullscreen root boundary. `fetchOrgQueueCounts` itself never
  // rejects on an individual counter failure (it degrades that key to `null`),
  // so ONE bad query silently drops ONE badge instead of blanking every badge
  // (MED 10) — the outer `.catch` below is only a last-resort backstop for a
  // truly unexpected throw.
  const orgQueues = applicableOrgQueues(organization.orgType, granted, membership.role);
  const badgeQueues = orgQueues.filter((q) => q.navPath !== undefined);
  const queueCounts =
    orgQueues.length > 0
      ? await getOrgQueueCountsCached(
          organization.id,
          orgQueueCacheKey(orgQueues.map((q) => q.key)),
        ).catch((err) => {
          console.error("[OrgLayout] getOrgQueueCountsCached failed", err);
          return null;
        })
      : null;

  const badgeByHref = new Map<string, number>();
  if (queueCounts) {
    for (const q of badgeQueues) {
      const n = queueCounts[q.key];
      if (q.navPath && n !== null && n > 0) {
        badgeByHref.set(`/org/${orgToken}/${q.navPath}`, n);
      }
    }
  }

  const navSections: NavSection[] =
    badgeByHref.size > 0
      ? orgNavSections.map((section) => ({
          ...section,
          items: section.items.map((item) => {
            const badge = badgeByHref.get(item.href);
            return badge ? { ...item, badge } : item;
          }),
        }))
      : orgNavSections;

  // Omnibox: show only for members with pet read access.
  const canSearchPets = granted.has("pet.read_held") || membership.role === "admin";

  // Right-side topbar actions: personal cross-portal links + a reliable sign-out.
  // ContextSwitcher is not added here: owner/vet with no additional org memberships
  // returns an empty switcher.
  //
  // Two distinct affordances (portal-logout consistency, PO QA §4): the old
  // "← Salir" pointed at /mis-mascotas — an ambiguous label whose back-arrow
  // read as "sign out" but actually only switched to the personal app, leaving
  // the org portal with NO real logout. Now:
  //   - "Ir a mi app" → the personal owner surface (/mis-mascotas), labelled for
  //     what it does (navigate, not sign out).
  //   - "Cerrar sesión" → logoutAction, matching /gob and /admin so every
  //     operator portal owns a reliable, consistently-placed sign-out.
  const topbarActions = (
    <div className="flex items-center gap-3">
      <Link href="/cuenta" className="text-xs text-ln-op-mute no-underline hover:text-ln-op-ink">
        Mi cuenta
      </Link>
      <Link
        href="/mis-mascotas"
        className="text-xs text-ln-op-mute no-underline hover:text-ln-op-ink"
      >
        Ir a mi app
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-ln-op-mute hover:text-ln-op-ink"
        >
          Cerrar sesión →
        </button>
      </form>
    </div>
  );

  return (
    <AppShell
      variant="operator"
      banner={<OpOfflineBanner />}
      rail={
        <OpRail
          sections={navSections}
          variant="org"
          brandSubtitle="Organización"
          user={{ name: displayName, role: "ORG" }}
        />
      }
      topbar={
        <header className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-6 py-[11px]">
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={navSections} variant="org" brandSubtitle="Organización" />
          {/* Left: org breadcrumbs (client component, uses usePathname) */}
          <OrgBreadcrumbs orgToken={orgToken} />
          {/* Scope chip */}
          <OpScopeChip code="ORG" label={organization.displayName} variant="org" />
          {/* Spacer */}
          <div className="flex-1" />
          {/* Right: omnibox (capability-gated) + actions */}
          <div className="flex items-center gap-2">
            {canSearchPets && <OpOmnibox orgToken={orgToken} />}
            {topbarActions}
          </div>
        </header>
      }
    >
      {children}
    </AppShell>
  );
}
