import { AppFooter, AppHeader } from "@/components/layout";
import { PUBLIC_NAV } from "@/components/layout/nav-presets";

/**
 * Layout for public and institutional pages.
 * Wraps children with AppHeader (argentina stripe + public nav) and AppFooter.
 *
 * Authenticated app areas (libreta, org portal, own cases) live under the
 * (app) route group with their own shell and do not use this layout.
 *
 * Active nav state is resolved client-side via usePathname() — no middleware
 * or headers() calls required.
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader nav={PUBLIC_NAV} />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </div>
  );
}
