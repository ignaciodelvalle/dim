"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { NavItem } from "./HeaderNav";

type Props = {
  nav: NavItem[];
  brandTitle?: string;
};

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

function isActive(item: NavItem, currentPath: string | null): boolean {
  if (!currentPath) return false;
  if (item.matchPrefix) return currentPath.startsWith(item.matchPrefix);
  return currentPath === item.href;
}

export function MobileDrawer({ nav, brandTitle = "MiMAR" }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="left">
      <Drawer.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menú"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gob-border text-gob-primary hover:border-gob-border-strong md:hidden"
        >
          <HamburgerIcon />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <Drawer.Content
          className="fixed bottom-0 left-0 top-0 z-50 flex w-72 flex-col bg-white shadow-xl outline-none md:hidden"
          aria-label="Menú principal"
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-gob-border px-4 py-3">
            <span className="text-base font-bold text-gob-primary">{brandTitle}</span>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Cerrar menú"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gob-text-gray hover:bg-gob-surface-alt"
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

          {/* Nav items */}
          <nav aria-label="Navegación principal" className="flex flex-col gap-0.5 overflow-y-auto px-2 py-3">
            {nav.map((item) => {
              const active = isActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-md px-4 py-3 text-sm font-medium no-underline transition-colors ${
                    active
                      ? "bg-gob-surface-alt text-gob-text-strong"
                      : "text-gob-text-gray hover:bg-gob-surface-alt hover:text-gob-text-strong"
                  }`}
                >
                  <span className="flex-1">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
