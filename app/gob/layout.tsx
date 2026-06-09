import { eq } from "drizzle-orm";
import Link from "next/link";

import { GOB_NAV } from "@/components/layout/nav-presets";
import { OpRail, OpShell, OpTopbar } from "@/components/ui/dashboard";
import { db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

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

  // profiles.displayName is NOT NULL — always present.
  const [profileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, profile.id))
    .limit(1);

  const displayName = profileRow?.displayName ?? "";

  // Right-side actions: role + scope + cross-portal links.
  const actions = (
    <div className="flex items-center gap-4 text-xs text-ln-op-mute">
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
        <Link href="/mis-mascotas" className="text-ln-op-mute no-underline hover:text-ln-op-ink">
          ← Salir
        </Link>
      </div>
    </div>
  );

  return (
    <OpShell
      variant="gob"
      rail={
        <OpRail
          nav={GOB_NAV}
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
          mobileNav={GOB_NAV}
          variant="gob"
          brandSubtitle="Gobierno"
        />
      }
    >
      {children}
    </OpShell>
  );
}
