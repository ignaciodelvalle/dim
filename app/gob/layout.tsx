import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/layout/AppShell";
import { AppShellDrawer } from "@/components/layout/AppShellDrawer";
import { ContextSwitcher } from "@/components/layout/ContextSwitcher";
import { GOB_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { OpOmnibox } from "@/components/ui/dashboard/OpOmnibox";
import { OpRail } from "@/components/ui/dashboard/OpRail";
import { OpScopeChip } from "@/components/ui/dashboard/OpScopeChip";
import { OperatorBreadcrumbs } from "@/components/ui/dashboard/OperatorBreadcrumbs";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { getProfileCached } from "@/lib/infra/request-cache";
import type { ShellSession } from "@/lib/ui/shell-nav";
import { roleLabel } from "@/lib/utils/format";

// Gate the /gob/* segment. Both admin and govt can access this surface.
// Admin has universal scope; govt is scoped to their assigned localities.
// requireAdminOrGovtOrRedirect rejects deactivated accounts (deactivated_at IS
// NOT NULL) by redirecting to /, so a deactivated govt/admin cannot reach any
// /gob surface or invoke its server actions.
export default async function GobiernoLayout({ children }: { children: React.ReactNode }) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const scopeCode =
    profile.role === "admin"
      ? "UNIVERSAL"
      : jurisdictions.length === 0
        ? "SIN LOCALIDADES"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} LOCALIDADES`;

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
      <span className="text-xs text-ln-op-mute">
        <span className="font-semibold text-ln-op-ink-2">{roleLabel(profile.role)}</span>
        <span className="mx-1">·</span>
        {scopeCode}
      </span>
      {/* ContextSwitcher (D6): replaces the ad-hoc "Ir a Admin →" link. */}
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
          sections={GOB_NAV_SECTIONS}
          variant="gob"
          brandSubtitle="Gobierno"
          user={{
            name: displayName,
            role: roleLabel(profile.role).toUpperCase(),
          }}
        />
      }
      topbar={
        <header className="sticky top-0 z-[var(--z-header)] flex flex-shrink-0 items-center gap-3 border-b border-ln-op-line bg-ln-op-card px-6 py-[11px]">
          {/* Mobile hamburger — AppShellDrawer mirrors the desktop rail. */}
          <AppShellDrawer sections={GOB_NAV_SECTIONS} variant="gob" brandSubtitle="Gobierno" />
          {/* Left: breadcrumbs — derived from route (UX 1.2) */}
          <OperatorBreadcrumbs portal="gob" />
          {/* Scope chip */}
          <OpScopeChip
            code={profile.role === "admin" ? "SUPERADMIN" : "GOB"}
            label={scopeCode}
            variant={profile.role === "admin" ? "superadmin" : "default"}
          />
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
