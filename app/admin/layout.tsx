import { and, eq, lt, sql } from "drizzle-orm";

import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { ContextSwitcher } from "@/components/layout/ContextSwitcher";
import { ADMIN_NAV_SECTIONS } from "@/components/layout/nav-presets";
import type { NavSection } from "@/components/ui/dashboard";
import { OpOmnibox } from "@/components/ui/dashboard/OpOmnibox";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OperatorBreadcrumbs } from "@/components/ui/dashboard/OperatorBreadcrumbs";
import { db, eventNotificationOutbox } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { getProfileCached } from "@/lib/request-cache";
import type { ShellSession } from "@/lib/shell-nav";

// Gate the /admin/* segment. Admin-only — govt and everyone else gets sent
// to / (root). Uses the strict requireAdminOrRedirect guard which also rejects
// deactivated admins (Fase 5 invariant).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminOrRedirect();

  // Cheap breach count: pending rows past their SLA deadline.
  // Uses the outbox_sla_due_idx(sla_due_at, status) index — no seq scan.
  const [breachCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventNotificationOutbox)
    .where(
      and(
        eq(eventNotificationOutbox.status, "pending"),
        lt(eventNotificationOutbox.slaDueAt, new Date()),
      ),
    );
  const breachCount = breachCountRow?.count ?? 0;

  // getProfileCached is already warmed by requireAdminOrRedirect above —
  // this call is a memoized hit, not a second DB round-trip.
  const profileRow = await getProfileCached(profile.id);
  const displayName = profileRow?.displayName ?? "";

  // Inject the breach badge on the outbox nav item in the sections structure.
  const sections: NavSection[] =
    breachCount > 0
      ? ADMIN_NAV_SECTIONS.map((section) => ({
          ...section,
          items: section.items.map((item) =>
            item.href === "/admin/outbox" ? { ...item, badge: breachCount } : item,
          ),
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
        <span className="font-semibold text-ln-op-ink-2">{profile.role}</span>
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

  return (
    <AppShell
      variant="operator"
      rail={
        <OpRail
          sections={sections}
          variant="gob"
          brandSubtitle="Admin"
          user={{
            name: displayName,
            role: profile.role.toUpperCase(),
          }}
        />
      }
      topbar={
        <header className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-6 py-[11px]">
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={sections} variant="gob" brandSubtitle="Admin" />
          {/* Left: breadcrumbs — derived from route (UX 1.2) */}
          <OperatorBreadcrumbs portal="admin" />
          {/* Scope chip */}
          <OpScopeChip code="SUPERADMIN" label="Universal" variant="superadmin" />
          {/* Spacer */}
          <div className="flex-1" />
          {/* Global search omnibox (Item 10) — operator jump-to-record + PII log. */}
          <OpOmnibox />
          {/* Right: switcher + logout */}
          <div className="flex items-center gap-2">{topbarActions}</div>
        </header>
      }
    >
      {children}
    </AppShell>
  );
}
