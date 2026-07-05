// Role-based post-login landing page resolution.
//
// pathForRole — pure function, no DB access.
// resolveVetLanding — queries the vet's org memberships and returns the correct
// path. All three call-sites (loginAction, LoginPage, root page) use it so
// the routing logic never diverges.
//
// resolveUserLanding — org-aware landing resolver for OAuth/magic-link callbacks.
// Unlike pathForRole (which requires pre-fetched role + membership flags) this
// function fetches both the role and membership in one pass and returns the best
// default landing URL. Used by app/auth/callback/route.ts.

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, organizationMemberships, organizations, profiles } from "@/db";

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

// ---------------------------------------------------------------------------
// Deactivated institutional accounts — redirect-loop guard (task #39)
// ---------------------------------------------------------------------------
//
// Every institutional guard (requireAdminOrRedirect, requireAdminOrGovtOr-
// Redirect) bounces a deactivated institutional account to `/`. If any
// role-landing call site (root page, /login page, loginAction, auth callback)
// redirects that same account back into its portal by role, the two redirects
// chase each other forever: /admin → / → /admin → … and the browser dies with
// ERR_TOO_MANY_REDIRECTS — no app surface, no logout, no feedback (observed
// live 2026-07-04 with a deactivated admin@dim.test). Every auto-redirect by
// role MUST consult this predicate first and fall through to a real page
// (landing or login) when it returns true.

export type InstitutionalStatusFields = {
  accountType: string | null;
  deactivatedAt: Date | null;
};

/** True when the profile is an institutional account that has been deactivated. */
export function isDeactivatedInstitutional(
  profile: InstitutionalStatusFields | null | undefined,
): boolean {
  return !!profile && profile.accountType === "institutional" && profile.deactivatedAt !== null;
}

// ---------------------------------------------------------------------------
// Erased accounts — right-to-erasure lockout (Ley 25.326 art. 16, Wave D2)
// ---------------------------------------------------------------------------
//
// erase_subject_data() soft-deletes the profile (deleted_at = now()) and hashes
// every PII column, but the Supabase session is only dropped client-side via
// signOut(). A stale/replayed session cookie — or a user who simply logs back in
// before auth.users is cleaned up — would otherwise regain a full session on an
// account that no longer holds any identity. Every auth entry point MUST treat a
// non-null deleted_at as "no access", identically to how it treats a deactivated
// institutional account: bounce to /login, never into the app (which would loop
// against requireUserOrRedirect).

export type ErasureStatusFields = {
  deletedAt: Date | null;
};

/** True when the profile has been erased at the subject's request (soft-deleted). */
export function isErasedAccount(profile: ErasureStatusFields | null | undefined): boolean {
  return !!profile && profile.deletedAt !== null;
}

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

// Resolve the correct default landing path for any user by querying their role
// and active org memberships. Designed for OAuth / magic-link callbacks that have
// no explicit ?next= parameter and must pick the best starting surface.
//
// Priority order:
//  1. admin           → /admin
//  2. govt            → /gob
//  3. vet             → delegate to resolveVetLanding (existing logic)
//  4. owner / default:
//       - exactly 1 active org membership → /org/<publicToken>  (UX 0.5)
//       - 0 or >1 active memberships     → /inicio
//         (multi-org: the "Portales ▾" context-switcher handles selection;
//          a new picker page is explicitly out of scope for this fix)
export async function resolveUserLanding(userId: string): Promise<string> {
  const [profile] = await db
    .select({
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  // Erased (right-to-erasure) → never into a portal. /login renders the notice.
  if (isErasedAccount(profile)) return "/login";

  // Deactivated institutional → never into a portal (guards bounce it back
  // to `/` and the redirects loop). /login renders the deactivated notice.
  if (isDeactivatedInstitutional(profile)) return "/login";

  const role = profile?.role ?? "owner";

  // Institutional roles — fast path, no membership lookup needed.
  if (role === "admin") return "/admin";
  if (role === "govt") return "/gob";

  // Vet — delegate to existing resolveVetLanding.
  if (role === "vet") return resolveVetLanding(userId);

  // Owner (and any future personal role) — check active org memberships.
  // Fetch at most 2 rows: knowing "0", "exactly 1", or ">1" is sufficient.
  const memberships = await db
    .select({ publicToken: organizations.publicToken })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)))
    .limit(2);

  if (memberships.length === 1 && memberships[0].publicToken) {
    return `/org/${memberships[0].publicToken}`;
  }

  // Zero orgs (new owner) or more than one (multi-org owner) → personal home.
  return "/inicio";
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
