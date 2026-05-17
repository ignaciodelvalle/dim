// Server-component auth guards that fail by redirecting, never by rendering
// a blank page. Replaces the `if (!user) return null` defensive pattern that
// produced silent blank screens when a session expired between layout and
// page render — see audit reported 2026-05-17.
//
// Use these helpers in any server component / page / layout that needs an
// authenticated user. The return type is non-nullable: if you got here, the
// guard passed.

import { redirect } from "next/navigation";

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
