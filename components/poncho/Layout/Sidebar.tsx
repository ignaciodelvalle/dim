import Link from "next/link";
import { GobStripe } from "./GobStripe";
import type { NavItem } from "./HeaderNav";
import { type RoleAccent, SidebarNav } from "./SidebarNav";

type Props = {
  nav: NavItem[];
  user: { name: string; href?: string; email?: string } | null;
  roleAccent?: RoleAccent;
  /** Brand displayed at the top of the sidebar. */
  brand?: { title: string; subtitle?: string };
};

/** Returns up to 2 uppercase initials from a display name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Fixed left sidebar for authenticated portals (desktop).
 *
 * Server component — client interactivity (active state, mobile drawer) is
 * handled by SidebarNav and MobileDrawer child components.
 *
 * Hidden on mobile — use MobileDrawer for the hamburger-triggered drawer.
 */
export function Sidebar({ nav, user, roleAccent = "owner", brand }: Props) {
  const brandTitle = brand?.title ?? "MiMAR";
  const brandSubtitle = brand?.subtitle;
  const userInitials = user ? initials(user.name) : "";

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:border-gob-border md:bg-white"
      aria-label="Barra de navegación"
    >
      {/* Argentine stripe at the very top */}
      <GobStripe />

      {/* Brand */}
      <div className="border-b border-gob-border px-4 py-4">
        <Link
          href="/"
          className="group flex items-center gap-2 no-underline"
          aria-label={`${brandTitle} — ir al inicio`}
        >
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gob-primary text-sm font-bold text-white">
            {brandTitle.slice(0, 2)}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-gob-primary">{brandTitle}</span>
            {brandSubtitle && (
              <span className="text-[11px] leading-none text-gob-text-muted">{brandSubtitle}</span>
            )}
          </span>
        </Link>
      </div>

      {/* Vertical nav — client component for active state */}
      <SidebarNav nav={nav} roleAccent={roleAccent} />

      {/* Avatar pill at the bottom */}
      {user && (
        <div className="mt-auto border-t border-gob-border px-3 py-3">
          <Link
            href={user.href ?? "/cuenta"}
            className="flex items-center gap-3 rounded-lg px-2 py-2 no-underline hover:bg-gob-surface-alt"
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gob-surface-alt text-xs font-semibold text-gob-text-gray">
              {userInitials || "?"}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-gob-text-strong">{user.name}</span>
              {user.email && (
                <span className="truncate text-[11px] leading-none text-gob-text-muted">
                  {user.email}
                </span>
              )}
            </span>
          </Link>
        </div>
      )}
    </aside>
  );
}
