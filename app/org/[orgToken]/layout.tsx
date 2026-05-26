// Org portal layout — validates active membership for the requested orgToken.
// Returns notFound() if the org does not exist or the user has no active
// membership, so callers cannot distinguish "org exists but you're not a
// member" from "no such org" (decision D4 — no information leakage).
//
// Every page under /org/[orgToken]/* can assume the membership is valid.
// The orgToken (organizations.publicToken) is the URL-stable identifier used
// throughout this portal instead of inferring an "active org" from session.

import { eq } from "drizzle-orm";
import type { ReactNode } from "react";

import { Sidebar, Topbar } from "@/components/poncho";
import { buildOrgNav } from "@/components/poncho/Layout/nav-presets";
import { db, profiles } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  // Validates membership. Returns notFound() on failure — never leaks org existence.
  const { user, organization } = await requireOrgAccessByToken(orgToken);

  // profiles.displayName is NOT NULL — always present; no fallback needed.
  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const orgNav = buildOrgNav(orgToken);

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        nav={orgNav}
        user={{ name: profile?.displayName ?? "", href: "/cuenta" }}
        roleAccent="org"
        brand={{ title: organization.displayName }}
      />
      <div className="flex min-h-screen flex-col md:ml-60">
        <Topbar mobileDrawerNav={orgNav} brandTitle={organization.displayName} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
