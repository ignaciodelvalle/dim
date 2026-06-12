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

import { redirect } from "next/navigation";

import { LnGuilloche } from "@/components/ui/DocElements";
import { LnOwnerNav } from "@/components/ui/LnOwnerNav";
import { LnOwnerSubBar } from "@/components/ui/LnOwnerSubBar";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getProfileCached, getUnreadCountCached } from "@/lib/request-cache";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUserOrRedirect();

  // Profile first: institutional roles redirect away, and the unread-count
  // query should not run at all on that path.
  const profile = await getProfileCached(user.id);
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "govt") redirect("/gob");

  const unreadCount = await getUnreadCountCached(user.id);

  // displayName is NOT NULL in the DB, but an empty string would render a
  // blank nav avatar — fall back to the email prefix like the pre-cache code.
  const displayName = profile?.displayName?.trim() || user.email?.split("@")[0] || "";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ln-paper)] font-[var(--font-ln-sans)] text-[var(--color-ln-ink)]">
      <LnGuilloche />
      {/* LnOwnerNav is a client component — reads usePathname for active state */}
      <LnOwnerNav displayName={displayName} unreadCount={unreadCount} />
      <LnOwnerSubBar />
      <main id="main-content" className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
