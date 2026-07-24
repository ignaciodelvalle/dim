import { logoutAction } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { ContextSwitcher } from "@/components/layout/ContextSwitcher";
import { GovtJurisdictionsChip } from "@/components/layout/GovtJurisdictionsChip";
import { ADMIN_NAV_SECTIONS, GOB_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { OpMaintenanceScreen } from "@/components/ui/dashboard/OpMaintenanceScreen";
import { OpOfflineBanner } from "@/components/ui/dashboard/OpOfflineBanner";
import { OpOmnibox } from "@/components/ui/dashboard/OpOmnibox";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OperatorBreadcrumbs } from "@/components/ui/dashboard/OperatorBreadcrumbs";
import { shouldShowDemoBanner } from "@/lib/domain/demo-mode";
import { isMaintenanceMode } from "@/lib/domain/maintenance-mode";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { getProfileCached } from "@/lib/infra/request-cache";
import { describeMandate } from "@/lib/ui/scope-chrome";
import type { ShellSession } from "@/lib/ui/shell-nav";
import { roleLabel } from "@/lib/utils/format";

// Gate the /gob/* segment. Both admin and govt can access this surface.
// Admin has universal scope; govt is scoped to their assigned localities.
// requireAdminOrGovtOrRedirect rejects deactivated accounts (deactivated_at IS
// NOT NULL) by redirecting to /, so a deactivated govt/admin cannot reach any
// /gob surface or invoke its server actions.
export default async function GobiernoLayout({ children }: { children: React.ReactNode }) {
  // Maintenance kill-switch short-circuits BEFORE any auth/data fetch — no
  // rail/topbar data exists yet, so the screen renders full-page, unwrapped.
  if (isMaintenanceMode(process.env.NEXT_PUBLIC_MAINTENANCE_MODE)) {
    return <OpMaintenanceScreen />;
  }

  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // C3 (ONE VIEWSCOPE, plan-maestro-integridad §C3): this layout is SHARED
  // across every /gob/* page and renders once per navigation — it has no
  // access to a page's own searchParams/filter, so it can only ever describe
  // the operator's MANDATE (their session assignments), never the page's
  // resolved VIEW. describeMandate() is the one allowlisted computation site
  // (lint:view-scope fences a raw `jurisdictions.length` read here) — it fixes
  // the verified S3 symptom (a shared badge claiming a raw enumerable count as
  // if it were the current, possibly-filtered view). A page whose OWN filter
  // narrows below this mandate discloses that separately (ViewScopeCaption).
  const scopeCode = profile.role === "admin" ? "Nacional" : describeMandate(jurisdictions);

  // red-team-admin-2 P2.1 (PO: chrome role-aware en la cola): an admin reaches
  // this shared segment via /admin/moderacion's redirect and used to see the
  // full "miMAR GOBIERNO" chrome (brand + gob rail) — reading as "I left my
  // portal / a permissions bug". Render ADMIN brand + rail for an admin viewer
  // so they stay oriented in their own portal while working the shared queue.
  // The scope chip, omnibox scope, and context switcher were already role-aware.
  const isAdmin = profile.role === "admin";
  const navSections = isAdmin ? ADMIN_NAV_SECTIONS : GOB_NAV_SECTIONS;
  const brandSubtitle = isAdmin ? "Administración" : "Gobierno";

  // getProfileCached is already warmed by requireAdminOrGovtOrRedirect above —
  // this call is a memoized hit, not a second DB round-trip.
  const profileRow = await getProfileCached(profile.id);
  const displayName = profileRow?.displayName ?? "";

  // Build the session shape for the context switcher.
  // admin visiting /gob always has govtAssignments (that is the prerequisite).
  const switcherSession: ShellSession = {
    role: profile.role,
    displayName,
    // An admin can always hop between /gob and /admin — govtAssignments=true.
    // A govt user gets only the "volver a ciudadano" escape.
    govtAssignments: profile.role === "admin",
  };

  const topbarActions = (
    <div className="flex items-center gap-3">
      {/* Account text label — hidden <md (mobile-polish 2026-07: it bled off
          the 390px viewport). The mandate stays disclosed via the scope chip
          (>=md) and each page's ViewScopeCaption. */}
      <span className="hidden text-xs text-ln-op-mute md:inline">
        <span className="font-semibold text-ln-op-ink-2">{roleLabel(profile.role)}</span>
        <span className="mx-1">·</span>
        {scopeCode}
      </span>
      {/* ContextSwitcher (D6): replaces the ad-hoc "Ir a Admin →" link. */}
      <ContextSwitcher session={switcherSession} />
      {/* Logout — institutional roles are bounced out of /mis-mascotas and
          /cuenta by the (app) layout, so the portal must own its sign-out.
          <md it collapses to an icon (same budget fix as the account label);
          the aria-label keeps the accessible name in both forms. */}
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Cerrar sesión"
          className="inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-xs text-ln-op-mute hover:text-ln-op-ink md:p-0"
        >
          <Icon name="logout" size={16} decorative className="md:hidden" />
          <span className="hidden md:inline">Cerrar sesión →</span>
        </button>
      </form>
    </div>
  );

  return (
    <AppShell
      variant="operator"
      banner={
        <>
          <DemoModeBanner enabled={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)} />
          <OpOfflineBanner />
        </>
      }
      rail={
        <OpRail
          sections={navSections}
          variant="gob"
          brandSubtitle={brandSubtitle}
          user={{
            name: displayName,
            role: roleLabel(profile.role).toUpperCase(),
          }}
        />
      }
      topbar={
        <header className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 flex-nowrap items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-4 py-[11px] md:px-6">
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={navSections} variant="gob" brandSubtitle={brandSubtitle} />
          {/* Left group: breadcrumbs + scope chip. Grows to fill and is the
              ONLY shrinkable region (same D1 discipline as the admin topbar),
              so the breadcrumb truncates instead of pushing chrome off-screen. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Breadcrumbs — derived from route (UX 1.2). Hidden <md
                (mobile-polish 2026-07): the drawer + page H1 orient the
                operator on a phone; the crumb trail is desktop chrome. */}
            <div className="hidden min-w-0 flex-shrink md:block">
              <OperatorBreadcrumbs portal="gob" />
            </div>
            {/* Scope chip. A multi-locality govt gets the expandable variant so
                the operator can see WHICH jurisdictions they cover (Cowork M5),
                not just the count. Admin (universal) and single-locality govt
                already read their full scope in the label (>=md; <md the chip
                collapses to its portal code — see OpScopeChip). */}
            {profile.role !== "admin" && jurisdictions.length > 1 ? (
              <GovtJurisdictionsChip label={scopeCode} jurisdictions={jurisdictions} />
            ) : (
              <OpScopeChip
                code={profile.role === "admin" ? "SUPERADMIN" : "GOB"}
                label={scopeCode}
                variant={profile.role === "admin" ? "superadmin" : "default"}
              />
            )}
          </div>
          {/* Global search omnibox (Item 10) — operator jump-to-record + PII log.
              An admin visiting /gob searches universally; a govt is scoped to its
              jurisdictions (Cowork B3). <md it rests as an icon trigger that
              expands to a full-width row over the topbar (see OpOmnibox). */}
          <OpOmnibox universalScope={profile.role === "admin"} />
          {/* Right: switcher + logout */}
          <div className="flex flex-shrink-0 items-center gap-2">{topbarActions}</div>
        </header>
      }
    >
      {children}
    </AppShell>
  );
}
