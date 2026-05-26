"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./HeaderNav";

// Role accent classes — left-border highlight on the active item.
const accentClasses = {
  owner: "border-l-gob-primary",
  org: "border-l-gob-info",
  gob: "border-l-gob-primary",
  admin: "border-l-gob-danger",
} as const;

export type RoleAccent = keyof typeof accentClasses;

type Props = {
  nav: NavItem[];
  roleAccent: RoleAccent;
};

function isActive(item: NavItem, currentPath: string | null): boolean {
  if (!currentPath) return false;
  if (item.matchPrefix) return currentPath.startsWith(item.matchPrefix);
  return currentPath === item.href;
}

export function SidebarNav({ nav, roleAccent }: Props) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3" aria-label="Navegación principal">
      {nav.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
              active
                ? `border-l-4 ${accentClasses[roleAccent]} bg-gob-surface-alt pl-2 text-gob-text-strong`
                : "text-gob-text-gray hover:bg-gob-surface-alt hover:text-gob-text-strong"
            }`}
          >
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
