// Server-component auth guards that fail by redirecting, never by rendering
// a blank page. Replaces the `if (!user) return null` defensive pattern that
// produced silent blank screens when a session expired between layout and
// page render — see audit reported 2026-05-17.
//
// Use these helpers in any server component / page / layout that needs an
// authenticated user. The return type is non-nullable: if you got here, the
// guard passed.

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, govtAssignments, profiles } from "@/db";
import type { ActorProfile } from "@/lib/institutional-scope";
import { type ActiveMembership, getActiveMemberships } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
};

// Require an authenticated session. Redirects to /login if absent.
export async function requireUserOrRedirect(): Promise<AuthenticatedSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export type ActiveOrgSession = AuthenticatedSession & {
  memberships: ActiveMembership[];
  // Most recently joined active membership. Matches the "first membership
  // wins" v1 UI default — the org-picker UI is deferred.
  active: ActiveMembership;
};

// Require a logged-in user with at least one active org membership.
//
// Redirects to /login if no user. Redirects to /refugio if the user is
// logged in but has no active memberships — the /refugio layout renders
// the "Acceso restringido" page in that case, so this funnels every
// unauthorized refugio-portal entry through that single error surface.
export async function requireActiveOrgOrRedirect(): Promise<ActiveOrgSession> {
  const { supabase, user } = await requireUserOrRedirect();
  const memberships = await getActiveMemberships(user.id);
  if (memberships.length === 0) redirect("/refugio");
  const active = memberships[memberships.length - 1];
  return { supabase, user, memberships, active };
}

export type AdminOrGovtJurisdiction = {
  province: string;
  locality: string;
};

export type AdminOrGovtSession = AuthenticatedSession & {
  profile: { id: string; role: "admin" | "govt" };
  // Empty for admin (universal scope). Populated for govt with every
  // active (non-revoked) govt_assignments tuple.
  jurisdictions: AdminOrGovtJurisdiction[];
};

// Gate the /admin/* segment. Redirects unauthenticated to /login and
// authenticated non-authorities to /mis-mascotas (no point sending them
// somewhere they can't act). The returned `jurisdictions` is the govt's
// active scope — empty for admin, who has universal scope.
export async function requireAdminOrGovtOrRedirect(): Promise<AdminOrGovtSession> {
  const session = await requireUserOrRedirect();
  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, session.user.id))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    redirect("/mis-mascotas");
  }

  let jurisdictions: AdminOrGovtJurisdiction[] = [];
  if (profile.role === "govt") {
    const rows = await db
      .select({
        province: govtAssignments.jurisdictionProvince,
        locality: govtAssignments.jurisdictionLocality,
      })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, profile.id), isNull(govtAssignments.revokedAt)));
    jurisdictions = rows;
  }

  return {
    ...session,
    profile: { id: profile.id, role: profile.role },
    jurisdictions,
  };
}

// ============================================================================
// Fase 5: Admin-only guard (institutional accounts)
// ============================================================================
//
// Stricter than requireAdminOrGovtOrRedirect — only active institutional admins
// pass. Rejects:
//   - unauthenticated users (→ /login via requireUserOrRedirect)
//   - personal accounts (owner / vet)
//   - govt role
//   - deactivated admins (deactivated_at IS NOT NULL)
//
// Used by every Fase 5 page and action that is admin-only.
// Redirect target: /  (govts navigating to /admin/govts etc. land on root)

export type AdminSession = AuthenticatedSession & {
  profile: ActorProfile;
};

export async function requireAdminOrRedirect(): Promise<AdminSession> {
  const session = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, session.user.id))
    .limit(1);

  if (!profile) redirect("/");
  if (profile.role !== "admin") redirect("/");
  if (profile.accountType !== "institutional") redirect("/");
  if (profile.deactivatedAt !== null) redirect("/");

  return {
    ...session,
    profile: {
      id: profile.id,
      role: profile.role as ActorProfile["role"],
      accountType: profile.accountType as ActorProfile["accountType"],
      deactivatedAt: profile.deactivatedAt,
    },
  };
}
