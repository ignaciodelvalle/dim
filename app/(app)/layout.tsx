// Authenticated owner-portal layout. Any page rendered under this route group
// (`app/(app)/...`) requires the user to be (a) logged in and (b) a
// personal-account role (owner or vet). Institutional accounts (admin, govt)
// don't own pets or have appointments, so the whole owner portal is a no-op
// for them — bounce them to the portal their role does belong in. A future
// spec will give them dedicated cross-pet surfaces (e.g. /admin/mascotas,
// /gob/mascotas) with filters.
//
// Visual chrome: Libreta Nacional design system (LnShell + LnOwnerNav).
// Auth + role gates are unchanged.

import { count } from "drizzle-orm";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LnGuilloche } from "@/components/ui/DocElements";
import { LnOwnerNav } from "@/components/ui/LnOwnerNav";
import { LnOwnerSubBar } from "@/components/ui/LnOwnerSubBar";
import { db, notifications, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile] = await db
    .select({ role: profiles.role, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "govt") redirect("/gob");

  const displayName =
    profile?.displayName && profile.displayName.trim().length > 0
      ? profile.displayName
      : (user.email?.split("@")[0] ?? "");

  const [{ unreadCount }] = await db
    .select({ unreadCount: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ln-paper)] font-[var(--font-ln-sans)] text-[var(--color-ln-ink)]">
      <LnGuilloche />
      {/* LnOwnerNav is a client component — reads usePathname for active state */}
      <LnOwnerNav displayName={displayName} unreadCount={unreadCount} />
      <LnOwnerSubBar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
