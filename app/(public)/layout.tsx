import { AppFooter, AppHeader } from "@/components/layout";
import { PUBLIC_NAV } from "@/components/layout/nav-presets";
import { getProfileCached } from "@/lib/request-cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for public and institutional pages:
 * wraps children with AppHeader (argentina stripe + public nav) and AppFooter.
 *
 * Auth-aware: if a session is present, the header surfaces the user's name and
 * a link back to their app home so logged-in users are never dead-ended.
 *
 * Authenticated app areas (libreta, org portal, casos propios) live under the
 * `(app)` route group with their own shell and do not use this layout.
 *
 * Active nav state is resolved client-side via usePathname() — no middleware
 * or headers() calls required.
 */

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Resolve session best-effort. createClient reads auth cookies; if absent,
  // getUser() returns null without throwing. Never redirect from here — this
  // layout is public and must render for anonymous visitors too.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Build the user pill shown in the header for logged-in visitors.
  // displayName from profile; fall back to email prefix if not yet set.
  let headerUser: { name: string; href: string } | null = null;
  if (user) {
    const profile = await getProfileCached(user.id);
    const displayName = profile?.displayName?.trim() || user.email?.split("@")[0] || "";

    // Route each role to the right home so the "volver" link is always useful.
    const homeHref =
      profile?.role === "admin" ? "/admin" : profile?.role === "govt" ? "/gob" : "/inicio";

    headerUser = { name: displayName, href: homeHref };
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader nav={PUBLIC_NAV} user={headerUser} />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </div>
  );
}
