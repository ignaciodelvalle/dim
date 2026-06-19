import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { GOB_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { OpOmnibox, OpRail, OpShell, OpTopbar } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { getProfileCached } from "@/lib/request-cache";

// Gate the /gob/* segment. Both admin and govt can access this surface.
// Admin has universal scope; govt is scoped to their assigned localities.
// Strictly requires non-deactivated institutional accounts — handled inside
// requireAdminOrGovtOrRedirect which already gates on deactivated_at for
// institutional roles (Fase 5 invariant).
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

  // Right-side actions: global search omnibox + role + scope + cross-portal links.
  const actions = (
    <div className="flex items-center gap-4 text-xs text-ln-op-mute">
      <OpOmnibox />
      <span>
        <span className="font-semibold text-ln-op-ink-2">{profile.role}</span>
        <span className="mx-1">·</span>
        {scopeCode}
      </span>
      <div className="flex items-center gap-3">
        {profile.role === "admin" && (
          <Link href="/admin" className="text-ln-op-mute no-underline hover:text-ln-op-ink">
            Ir a Admin →
          </Link>
        )}
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
    </div>
  );

  return (
    <OpShell
      variant="gob"
      rail={
        <OpRail
          sections={GOB_NAV_SECTIONS}
          variant="gob"
          brandSubtitle="Gobierno"
          user={{
            name: displayName,
            role: profile.role.toUpperCase(),
          }}
        />
      }
      topbar={
        <OpTopbar
          crumbs={[{ label: "Panel" }]}
          scope={{
            code: profile.role === "admin" ? "SUPERADMIN" : "GOB",
            label: scopeCode,
            variant: profile.role === "admin" ? "superadmin" : "default",
          }}
          actions={actions}
          mobileSections={GOB_NAV_SECTIONS}
          variant="gob"
          brandSubtitle="Gobierno"
        />
      }
    >
      {children}
    </OpShell>
  );
}
