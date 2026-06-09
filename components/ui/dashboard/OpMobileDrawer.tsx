"use client";

import type { NavItem } from "@/components/layout/HeaderNav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { NavSection } from "./OpRailNav";

type Props = {
  /** Flat nav list. */
  nav?: NavItem[];
  /** Multi-section nav. Takes precedence over `nav`. */
  sections?: NavSection[];
  /** Visual variant. */
  variant?: "gob" | "org";
  /** Brand subtitle. */
  brandSubtitle?: string;
};

function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}

function HamburgerIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OpMobileDrawer({
  nav,
  sections,
  variant = "gob",
  brandSubtitle = "Operador",
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const railBg = variant === "org" ? "bg-[#0B3B42]" : "bg-ln-op-navy";

  // Normalize sections
  const resolved: NavSection[] = sections ?? (nav ? [{ label: "", items: nav }] : []);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="left">
      <Drawer.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menú"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-ln-op-line text-ln-op-ink hover:border-ln-op-line-2 md:hidden"
        >
          <HamburgerIcon />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <Drawer.Content
          className={[
            "fixed bottom-0 left-0 top-0 z-50 flex w-[224px] flex-col shadow-xl outline-none md:hidden",
            railBg,
            "text-ln-op-rail-text",
          ].join(" ")}
          aria-label="Menú principal"
        >
          {/* Brand header */}
          <div className="flex items-center gap-2.5 border-b border-[rgba(255,255,255,0.10)] px-4 py-[16px] pb-[13px]">
            <div className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[5px] bg-white font-ln-mono text-[13px] font-bold text-ln-op-navy">
              m·
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-ln-serif text-[15px] font-semibold text-white">MiMAR</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ln-op-rail-mute">
                {brandSubtitle}
              </span>
            </div>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Cerrar menú"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-ln-op-rail-mute hover:bg-[rgba(255,255,255,0.08)]"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Drawer.Close>
          </div>

          {/* Nav sections */}
          <nav
            aria-label="Navegación principal"
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-[9px] py-[13px]"
          >
            {resolved.map((section) => (
              <div key={section.label} className="flex flex-col">
                {section.label && (
                  <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-ln-op-rail-mute">
                    {section.label}
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item, pathname);
                    const activeClasses =
                      variant === "org"
                        ? "border-l-2 border-[#5FD0B0] bg-[rgba(255,255,255,0.12)] text-white font-semibold"
                        : "border-l-2 border-white bg-[rgba(255,255,255,0.12)] text-white font-semibold";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex min-h-9 items-center gap-2.5 rounded-[5px] px-[9px] py-[8px]",
                          "text-[12.5px] no-underline transition-colors -ml-0.5",
                          active
                            ? activeClasses
                            : "border-l-2 border-transparent text-ln-op-rail-text hover:bg-[rgba(255,255,255,0.05)]",
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
                  })}
                </div>
              </div>
            ))}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
