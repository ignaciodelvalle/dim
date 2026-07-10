"use client";

import type { NavItem } from "@/components/layout/HeaderNav";
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
  // Deferred entries are never "active" — their #defer-… sentinel must never be
  // highlighted (D4). Guard before any path comparison.
  if (item.deferred) return false;
  if (!pathname) return false;
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}

function NavLink({
  item,
  active,
  variant,
}: { item: NavItem; active: boolean; variant: "gob" | "org" }) {
  // Deferred (not-yet-built) destination: non-interactive, muted "Próximamente"
  // affordance — a <span> (no <Link>/<button>) so it cannot navigate and is out
  // of the tab order by default (no tabIndex). State announced via aria-disabled
  // + textual pill (not color alone — Ley 26.653). No badge on deferred (D2).
  if (item.deferred) {
    return (
      <span
        aria-disabled="true"
        className={[
          "flex min-h-11 items-center gap-2.5 rounded-[5px] px-[9px] py-2",
          "text-[12.5px] -ml-0.5 border-l-2 border-transparent",
          "text-ln-op-rail-mute cursor-not-allowed select-none",
        ].join(" ")}
      >
        <span className="flex-1 truncate">{item.label}</span>
        <span className="inline-flex items-center rounded-[3px] border border-[rgba(255,255,255,0.18)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-ln-op-rail-mute">
          Próximamente
        </span>
      </span>
    );
  }

  const activeClasses =
    variant === "org"
      ? "border-l-2 border-[var(--color-ln-tl-accent)] bg-[rgba(255,255,255,0.12)] text-white font-semibold"
      : "border-l-2 border-white bg-[rgba(255,255,255,0.12)] text-white font-semibold";

  return (
    <Link
      href={item.href}
      // RESILIENCE (2026-07-10, PO instrumented-review finding #1): the operator
      // rail carries ~30 links to HEAVY SSR dashboards (10s+ render, some 503
      // under load). Next's default link prefetch fired an RSC request for EVERY
      // one on mount — ~248 requests on a single panorama load — and the backend
      // saturated ITSELF, amplifying the panorama's own ~25s. Opt out of
      // prefetch on the rail: navigation still works (fetched on click), the
      // self-DoS is gone.
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={[
        "flex min-h-11 items-center gap-2.5 rounded-[5px] px-[9px] py-2",
        "text-[12.5px] no-underline transition-colors",
        "-ml-0.5",
        active
          ? activeClasses
          : "border-l-2 border-transparent text-[var(--color-ln-op-rail-text)] hover:bg-[rgba(255,255,255,0.05)]",
      ].join(" ")}
    >
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="font-ln-mono inline-flex items-center justify-center rounded-[3px] bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-xs font-bold leading-none text-white">
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
      className="op-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-[9px] py-[13px]"
      aria-label="Navegación principal"
    >
      {resolved.map((section) => (
        <div key={section.label} className="flex flex-col">
          {section.label && (
            <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ln-op-rail-mute)]">
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
