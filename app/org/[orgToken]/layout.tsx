// Org portal layout — validates active membership for the requested orgToken.
// Returns notFound() if the org does not exist or the user has no active
// membership, so callers cannot distinguish "org exists but you're not a
// member" from "no such org" (decision D4 — no information leakage).
//
// Every page under /org/[orgToken]/* can assume the membership is valid.
// The orgToken (organizations.publicToken) is the URL-stable identifier used
// throughout this portal instead of inferring an "active org" from session.

import { requireOrgAccessByToken } from "@/lib/auth-guards";
import type { ReactNode } from "react";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  // Validates membership. Returns notFound() on failure — never leaks org existence.
  await requireOrgAccessByToken(orgToken);
  return <>{children}</>;
}
