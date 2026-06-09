"use client";

import type { NavItem } from "@/components/poncho/Layout/HeaderNav";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = {
  label: string;
  items: NavItem[];
};

type Props = {
  /** Flat list of nav items (single implicit section). */
  nav?: NavItem[];
  /** Multi-section nav — takes precedence over `nav`. */
  sections?: NavSection[];
  /** Visual variant: navy rail (gob/admin) or teal rail (org). */
  variant?: "gob" | "org";
};

function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}

function NavLink({
  item,
  active,
  variant,
}: { item: NavItem; active: boolean; variant: "gob" | "org" }) {
  const activeClasses =
    variant === "org"
      ? "border-l-2 border-[#5FD0B0] bg-[rgba(255,255,255,0.12)] text-white font-semibold"
      : "border-l-2 border-white bg-[rgba(255,255,255,0.12)] text-white font-semibold";

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex min-h-9 items-center gap-2.5 rounded-[5px] px-[9px] py-[8px]",
        "text-[12.5px] no-underline transition-colors",
        "-ml-0.5",
        active
          ? activeClasses
          : "border-l-2 border-transparent text-[#DCE6F1] hover:bg-[rgba(255,255,255,0.05)]",
      ].join(" ")}
    >
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="font-ln-mono inline-flex items-center justify-center rounded-[3px] bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function OpRailNav({ nav, sections, variant = "gob" }: Props) {
  const pathname = usePathname();

  // Normalize into sections
  const resolved: NavSection[] = sections ?? (nav ? [{ label: "", items: nav }] : []);

  return (
    <nav
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-[9px] py-[13px]"
      aria-label="Navegación principal"
    >
      {resolved.map((section) => (
        <div key={section.label} className="flex flex-col">
          {section.label && (
            <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7C93AC]">
              {section.label}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item, pathname)}
                variant={variant}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
