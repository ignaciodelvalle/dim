import { and, eq, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { ADMIN_NAV_SECTIONS } from "@/components/layout/nav-presets";
import type { NavSection } from "@/components/ui/dashboard";
import { OpRail, OpShell, OpTopbar } from "@/components/ui/dashboard";
import { db, eventNotificationOutbox } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { getProfileCached } from "@/lib/request-cache";

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

  // Right-side actions: role + scope + cross-portal links.
  const actions = (
    <div className="flex items-center gap-4 text-xs text-ln-op-mute">
      <span>
        <span className="font-semibold text-ln-op-ink-2">{profile.role}</span>
        <span className="mx-1">·</span>
        Universal
      </span>
      <div className="flex items-center gap-3">
        <Link href="/gob" className="text-ln-op-mute no-underline hover:text-ln-op-ink">
          Ir a Gobierno →
        </Link>
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
        <OpTopbar
          crumbs={[{ label: "Panel" }]}
          scope={{
            code: "SUPERADMIN",
            label: "Universal",
            variant: "superadmin",
          }}
          actions={actions}
          mobileSections={sections}
          variant="gob"
          brandSubtitle="Admin"
        />
      }
    >
      {children}
    </OpShell>
  );
}
