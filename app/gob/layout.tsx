import { eq } from "drizzle-orm";
import Link from "next/link";

import { Sidebar, Topbar } from "@/components/poncho";
import { GOB_NAV } from "@/components/poncho/Layout/nav-presets";
import { db, profiles } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";

// Gate the /gob/* segment. Both admin and govt can access this surface.
// Admin has universal scope; govt is scoped to their assigned localities.
// Strictly requires non-deactivated institutional accounts — handled inside
// requireAdminOrGovtOrRedirect which already gates on deactivated_at for
// institutional roles (Fase 5 invariant).
export default async function GobiernoLayout({ children }: { children: React.ReactNode }) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const scopeLabel =
    profile.role === "admin"
      ? "Universal"
      : jurisdictions.length === 0
        ? "Sin localidades asignadas"
        : jurisdictions.length === 1
          ? `${jurisdictions[0].locality}, ${jurisdictions[0].province}`
          : `${jurisdictions.length} localidades`;

  // profiles.displayName is NOT NULL — always present.
  const [profileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, profile.id))
    .limit(1);

  // Meta-strip: role + scope + cross-portal links — rendered in the Topbar actions slot.
  const metaStrip = (
    <div className="flex items-center gap-4">
      <p className="text-xs text-gob-text-gray">
        <span className="font-medium">{profile.role}</span>
        <span className="text-gob-text-muted"> · </span>
        {scopeLabel}
      </p>
      <div className="flex items-center gap-3 text-xs">
        {profile.role === "admin" && (
          <Link
            href="/admin"
            className="text-gob-text-muted hover:text-gob-primary no-underline"
          >
            Ir a Admin →
          </Link>
        )}
        <Link
          href="/mis-mascotas"
          className="text-gob-text-muted hover:text-gob-primary no-underline"
        >
          ← Salir
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        nav={GOB_NAV}
        user={{ name: profileRow?.displayName ?? "", href: "/cuenta" }}
        roleAccent="gob"
        brand={{ title: "MiMAR", subtitle: "Gobierno" }}
      />
      <div className="flex min-h-screen flex-col md:ml-60">
        <Topbar
          mobileDrawerNav={GOB_NAV}
          brandTitle="MiMAR"
          actions={metaStrip}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
