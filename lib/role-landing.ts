// Role-based post-login landing page resolution.
//
// pathForRole — pure function, no DB access.
// resolveVetLanding — queries the vet's org memberships and returns the correct
// path. All three call-sites (loginAction, LoginPage, root page) use it so
// the routing logic never diverges.

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, organizationMemberships, organizations } from "@/db";

// Rules (priority order):
//  1. admin  → /admin
//  2. govt   → /gob
//  3. vet with active admin/coordinator org membership → /org/[firstOrgToken]
//  4. vet with any other active membership → /cuenta/memberships
//  5. vet with no memberships → /cuenta
//  6. owner with active org-admin membership → /org  (index redirects to their org)
//  7. everyone else → /inicio  (owner dashboard; pet list still reachable at /mis-mascotas)

export type RoleOptions = {
  hasOrgAdminMembership?: boolean;
  vetFirstOrgToken?: string | null;
  vetHasAnyMembership?: boolean;
};

export function pathForRole(role: string, options: RoleOptions | boolean): string {
  const opts: RoleOptions =
    typeof options === "boolean" ? { hasOrgAdminMembership: options } : options;

  switch (role) {
    case "admin":
      return "/admin";
    case "govt":
      return "/gob";
    case "vet":
      if (opts.vetFirstOrgToken) return `/org/${opts.vetFirstOrgToken}`;
      if (opts.vetHasAnyMembership) return "/cuenta/memberships";
      return "/cuenta";
    case "owner":
      return opts.hasOrgAdminMembership ? "/org" : "/inicio";
    default:
      return "/inicio";
  }
}

// Resolve the correct landing path for a vet by querying their org memberships.
// Priority: admin/coordinator in an org → /org/[token]; any membership → /cuenta/memberships; else → /cuenta.
export async function resolveVetLanding(userId: string): Promise<string> {
  const [adminRow] = await db
    .select({ publicToken: organizations.publicToken })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (adminRow) return `/org/${adminRow.publicToken}`;

  const [anyRow] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)))
    .limit(1);

  return anyRow ? "/cuenta/memberships" : "/cuenta";
}

// Validate a post-auth returnTo URL. Only same-origin paths starting with a
// single "/" are allowed — rejects protocol-relative ("//evil.com"),
// backslash tricks, and absolute URLs. Returns null when the input is unsafe,
// so callers can fall back to their role-based default.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  })();
  if (!decoded) return null;
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (decoded.includes("\\")) return null;
  return decoded;
}
