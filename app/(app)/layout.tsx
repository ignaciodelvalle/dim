// Authenticated owner-portal layout. Any page rendered under this route group
// (`app/(app)/...`) requires the user to be (a) logged in and (b) a
// personal-account role (owner or vet). Institutional accounts (admin, govt)
// don't own pets or have appointments, so the whole owner portal is a no-op
// for them — bounce them to the portal their role does belong in.
//
// Visual chrome: the unified AppShell, variant=citizen (Item 7, Phase C). The
// nav is resolved by resolveShellNav from the session — for an owner that is
// always OWNER_NAV, with a guaranteed role-return on off-home surfaces (D4).
// Auth + role gates are unchanged.
//
// Strangler note: this drops LnOwnerNav + LnOwnerSubBar usage. Those files are
// NOT deleted here — Phase D removes them.

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppCitizenMasthead } from "@/components/layout/AppCitizenMasthead";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppShell } from "@/components/layout/AppShell";
import { CitizenTabBar } from "@/components/layout/CitizenTabBar";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { LnMaintenanceScreen } from "@/components/ui/MaintenanceScreen";
import { LnOfflineBanner } from "@/components/ui/OfflineBanner";
import { shouldShowDemoBanner } from "@/lib/domain/demo-mode";
import { isMaintenanceMode } from "@/lib/domain/maintenance-mode";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import {
  getOrgMembershipsCached,
  getProfileCached,
  getUnreadCountCached,
} from "@/lib/infra/request-cache";
import { type ShellRole, resolveShellNav } from "@/lib/ui/shell-nav";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Maintenance kill-switch short-circuits BEFORE any auth/data fetch — no
  // masthead/nav data exists yet, so the screen renders full-page, unwrapped.
  if (isMaintenanceMode(process.env.NEXT_PUBLIC_MAINTENANCE_MODE)) {
    return <LnMaintenanceScreen />;
  }

  const { user } = await requireUserOrRedirect();

  // Profile first: institutional roles redirect away, and the unread-count
  // query should not run at all on that path.
  const profile = await getProfileCached(user.id);
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "govt") redirect("/gob");

  const [unreadCount, orgMemberships] = await Promise.all([
    getUnreadCountCached(user.id),
    getOrgMembershipsCached(user.id),
  ]);

  // displayName is NOT NULL in the DB, but an empty string would render a
  // blank nav avatar — fall back to the email prefix like the pre-cache code.
  const displayName = profile?.displayName?.trim() || user.email?.split("@")[0] || "";

  // The request pathname (injected by middleware) drives the off-home return
  // affordance. Absent it (e.g. in a non-middleware render), default to the
  // role home so showReturn resolves to false rather than crashing.
  const pathname = (await headers()).get("x-pathname") ?? "/inicio";

  const shell = resolveShellNav({
    pathname,
    session: {
      role: (profile?.role ?? "owner") as ShellRole,
      displayName,
      orgMemberships,
    },
  });

  const parts = displayName.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

  return (
    <AppShell
      variant="citizen"
      banner={
        <>
          <DemoModeBanner enabled={shouldShowDemoBanner(process.env.NEXT_PUBLIC_DEMO_MODE)} />
          <LnOfflineBanner />
        </>
      }
      // PO quick win X1 (2026-07-24): the owner home is pet-first — the
      // legal/institutional footer cluster collapses under a closed <details>
      // here ONLY (public marketing surfaces via app/(public)/layout.tsx keep
      // the full footer — see AppFooter's `collapsed` prop doc).
      footer={<AppFooter collapsed />}
      masthead={
        <AppCitizenMasthead
          nav={shell.nav}
          user={{ name: parts[0] || displayName, initials }}
          unreadCount={unreadCount}
          showReturn={shell.showReturn}
          returnHref={shell.returnHref}
          switcher={shell.switcher}
          primaryNavInTabBar
        />
      }
      // Mobile bottom tabs own primary nav for the logged-in citizen
      // (native-mobile audit §1); the masthead drawer keeps only
      // secondary/overflow content.
      tabBar={<CitizenTabBar nav={shell.nav} />}
    >
      {/* Web Push v1: registers /sw.js for the owner portal only. No-op unless
          NEXT_PUBLIC_PUSH_ENABLED is set and the browser supports push. */}
      <ServiceWorkerRegistrar />
      {children}
    </AppShell>
  );
}
