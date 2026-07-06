import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { ContextSwitcher } from "@/components/layout/ContextSwitcher";
import { ADMIN_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import type { NavSection } from "@/components/ui/dashboard";
import { OpOmnibox } from "@/components/ui/dashboard/OpOmnibox";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OperatorBreadcrumbs } from "@/components/ui/dashboard/OperatorBreadcrumbs";
import { shouldShowDemoBanner } from "@/lib/domain/demo-mode";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { countOutboxBreaches } from "@/lib/infra/outbox-queries";
import { getProfileCached } from "@/lib/infra/request-cache";
import { countOpenAlertFirings } from "@/lib/metrics/alert-firing-inbox";
import type { ShellSession } from "@/lib/ui/shell-nav";
import { roleLabel } from "@/lib/utils/format";

// Gate the /admin/* segment. Admin-only — govt and everyone else gets sent
// to / (root). Uses the strict requireAdminOrRedirect guard which also rejects
// deactivated admins (Fase 5 invariant).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminOrRedirect();

  // Global breach count (pending rows past their SLA deadline). Shared with the
  // outbox banner via countOutboxBreaches() so the badge and the banner can
  // never disagree (C2). Uses the outbox_sla_due_idx(sla_due_at, status) index.
  // Open-alerts count (WS-K): firings not yet resuelta/descartada → /admin/alertas badge.
  //
  // These are OPTIONAL nav badges, not gate queries — error.tsx does not catch
  // a throw from this layout (Next.js does not wrap a segment's own layout.tsx
  // in its sibling error.tsx boundary), so a transient failure here would
  // bypass app/admin/error.tsx entirely and fall through to the fullscreen
  // root boundary (error-path audit 2026-07-04, finding E4). Default to 0 and
  // log instead of letting the whole admin shell go down over a badge count.
  const [breachCount, openAlertCount] = await Promise.all([
    countOutboxBreaches().catch((err) => {
      console.error("[AdminLayout] countOutboxBreaches failed", err);
      return 0;
    }),
    countOpenAlertFirings().catch((err) => {
      console.error("[AdminLayout] countOpenAlertFirings failed", err);
      return 0;
    }),
  ]);

  // getProfileCached is already warmed by requireAdminOrRedirect above —
  // this call is a memoized hit, not a second DB round-trip.
  const profileRow = await getProfileCached(profile.id);
  const displayName = profileRow?.displayName ?? "";

  // Inject runtime badges into the nav sections: the outbox breach count on
  // /admin/outbox and the open-alerts count on /admin/alertas (WS-K). A single
  // map pass covers both so we never clone the sections twice.
  const needsBadges = breachCount > 0 || openAlertCount > 0;
  const sections: NavSection[] = needsBadges
    ? ADMIN_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.href === "/admin/outbox" && breachCount > 0) {
            return { ...item, badge: breachCount };
          }
          if (item.href === "/admin/alertas" && openAlertCount > 0) {
            return { ...item, badge: openAlertCount };
          }
          return item;
        }),
      }))
    : ADMIN_NAV_SECTIONS;

  // Build the session shape for the context switcher.
  // Admin always holds govtAssignments (they can access /gob).
  const switcherSession: ShellSession = {
    role: profile.role,
    displayName,
    govtAssignments: true,
  };

  const topbarActions = (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ln-op-mute">
        <span className="font-semibold text-ln-op-ink-2">{roleLabel(profile.role)}</span>
        <span className="mx-1">·</span>
        Universal
      </span>
      {/* ContextSwitcher (D6): replaces the ad-hoc "Ir a Gobierno →" link. */}
      <ContextSwitcher session={switcherSession} />
      {/* Logout — institutional roles are bounced out of /mis-mascotas and
          /cuenta by the (app) layout, so the portal must own its sign-out. */}
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

  // Demo banner flag (A1): shouldShowDemoBanner now lives in the server-safe
  // lib/demo-mode module, so the server layout can call it directly without
  // pulling in the "use client" banner module (which crashed /admin before).
  const demoMode = shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE);

  return (
    <AppShell
      variant="operator"
      banner={<DemoModeBanner enabled={demoMode} />}
      rail={
        <OpRail
          sections={sections}
          variant="gob"
          brandSubtitle="Administración"
          user={{
            name: displayName,
            role: roleLabel(profile.role).toUpperCase(),
          }}
        />
      }
      topbar={
        <header
          data-testid="admin-topbar"
          className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 flex-nowrap items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-6 py-[11px]"
        >
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={sections} variant="gob" brandSubtitle="Administración" />
          {/* Left group: breadcrumbs + scope chip. Grows to fill (pushing the
                omnibox + actions right) and is the ONLY shrinkable region, so the
                breadcrumb truncates rather than wrapping the topbar (D1). */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Breadcrumbs — derived from route (UX 1.2); truncates when tight. */}
            <div className="min-w-0 flex-shrink">
              <OperatorBreadcrumbs portal="admin" />
            </div>
            {/* Scope chip — neutral/outline so it never out-weighs the page H1 (D1). */}
            <OpScopeChip code="SUPERADMIN" label="Universal" variant="neutral" />
          </div>
          {/* Global search omnibox (Item 10) — operator jump-to-record + PII log. */}
          <div className="flex-shrink-0">
            <OpOmnibox />
          </div>
          {/* Right: switcher + logout */}
          <div className="flex flex-shrink-0 items-center gap-2">{topbarActions}</div>
        </header>
      }
    >
      {children}
    </AppShell>
  );
}
