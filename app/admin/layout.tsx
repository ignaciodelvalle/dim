import { and, eq, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { ADMIN_NAV } from "@/components/poncho/Layout/nav-presets";
import { OpRail, OpShell, OpTopbar } from "@/components/ui/dashboard";
import { db, eventNotificationOutbox, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";

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

  // profiles.displayName is NOT NULL — always present.
  const [profileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, profile.id))
    .limit(1);

  const displayName = profileRow?.displayName ?? "";

  // Inject the breach badge on the outbox nav item.
  const nav =
    breachCount > 0
      ? ADMIN_NAV.map((item) =>
          item.href === "/admin/outbox" ? { ...item, badge: breachCount } : item,
        )
      : ADMIN_NAV;

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
          nav={nav}
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
          mobileNav={nav}
          variant="gob"
          brandSubtitle="Admin"
        />
      }
    >
      {children}
    </OpShell>
  );
}
