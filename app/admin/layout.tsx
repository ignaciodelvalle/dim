import { and, eq, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { db, eventNotificationOutbox, profiles } from "@/db";
import { AppFooter, AppHeader } from "@/components/poncho";
import { ADMIN_NAV } from "@/components/poncho/Layout/nav-presets";
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

  // Inject the breach badge on the outbox nav item.
  const nav =
    breachCount > 0
      ? ADMIN_NAV.map((item) =>
          item.href === "/admin/outbox" ? { ...item, badge: breachCount } : item,
        )
      : ADMIN_NAV;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        nav={nav}
        user={{ name: profileRow?.displayName ?? "", href: "/cuenta" }}
      />

      {/* Meta-strip: role + scope + cross-portal links */}
      <div className="border-b border-gob-border bg-gob-surface-alt">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 md:px-6">
          <p className="text-xs text-gob-text-gray">
            <span className="font-medium">{profile.role}</span>
            <span className="text-gob-text-muted"> · </span>
            Universal
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link
              href="/gob"
              className="text-gob-text-muted hover:text-gob-primary no-underline"
            >
              Ir a Gobierno →
            </Link>
            <Link
              href="/mis-mascotas"
              className="text-gob-text-muted hover:text-gob-primary no-underline"
            >
              ← Salir
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1">{children}</div>
      <AppFooter />
    </div>
  );
}
