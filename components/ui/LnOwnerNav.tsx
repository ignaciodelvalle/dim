"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { LnMasthead } from "./Shell";

/**
 * LnOwnerNav — client wrapper for the LnMasthead that:
 *   1. Reads the current pathname to derive the active nav item.
 *   2. Renders the notification bell as a real link (href="/notificaciones")
 *      preserving the unread count badge.
 *   3. Provides a mobile hamburger drawer for sub-md viewports (WCAG 2.1.1).
 *
 * Kept intentionally thin: no data fetching, no side effects.
 * The unreadCount and displayName come from the parent RSC layout.
 */

const NAV_ITEMS = [
  { key: "inicio", label: "Inicio", href: "/inicio", match: "/inicio" },
  { key: "mascotas", label: "Mis Mascotas", href: "/mis-mascotas", match: "/mis-mascotas" },
  { key: "turnos", label: "Turnos", href: "/mis-turnos", match: "/mis-turnos" },
  {
    key: "notificaciones",
    label: "Notificaciones",
    href: "/notificaciones",
    match: "/notificaciones",
  },
  { key: "adoptar", label: "Adopciones", href: "/adoptar", match: "/adoptar" },
  { key: "cuenta", label: "Tu cuenta", href: "/cuenta", match: "/cuenta" },
];

type Props = {
  displayName: string;
  unreadCount: number;
};

export function LnOwnerNav({ displayName, unreadCount }: Props) {
  const pathname = usePathname();

  const nav = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    active: pathname === item.match || pathname.startsWith(`${item.match}/`),
    badge: item.key === "notificaciones" && unreadCount > 0 ? unreadCount : undefined,
  }));

  // Avatar initials: first char of first word + first char of second word (if any)
  const parts = displayName.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

  return (
    <LnMastheadWithBell
      wordmark="miMAR"
      wordmarkSub="MI MASCOTA ARGENTINA"
      crest="m"
      nav={nav}
      avatarInitials={initials}
      userName={displayName.trim().split(/\s+/)[0]}
      unreadCount={unreadCount}
    />
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer — shown below md breakpoint in place of the hidden desktop nav.
// Mirrors the OpMobileDrawer pattern but uses LN owner design tokens.
// ---------------------------------------------------------------------------

type NavEntry = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  badge?: number;
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

function LnOwnerMobileDrawer({
  nav,
  unreadCount,
}: {
  nav: NavEntry[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white/80 hover:text-white md:hidden"
        >
          <HamburgerIcon />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <Drawer.Content
          className="fixed bottom-0 left-0 top-0 z-50 flex w-[232px] flex-col bg-[var(--color-ln-azul-900)] text-white shadow-xl outline-none md:hidden"
          aria-label="Menú principal"
        >
          {/* Brand header */}
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-[14px]">
            <div className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-full border border-white/30 bg-white/[0.06] font-[var(--font-ln-serif)] text-[15px] font-semibold">
              m
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-[var(--font-ln-serif)] text-[15px] font-semibold">miMAR</span>
              <span className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--color-ln-celeste)]">
                MI MASCOTA ARGENTINA
              </span>
            </div>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Cerrar menú"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
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

          {/* Nav items */}
          <nav
            aria-label="Navegación principal"
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
          >
            {nav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={[
                  "flex min-h-10 items-center gap-2.5 rounded-[5px] px-3 py-2",
                  "text-[13px] no-underline transition-colors",
                  item.active
                    ? "border-l-2 border-[var(--color-ln-celeste)] bg-white/10 font-semibold text-white"
                    : "border-l-2 border-transparent text-white/75 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-[var(--color-ln-celeste)] px-1.5 py-0.5 font-[var(--font-ln-mono)] text-[10px] font-bold leading-none text-[var(--color-ln-azul-900)]">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ---------------------------------------------------------------------------
// Thin re-export of LnMasthead that swaps the emoji bell for a real Link
// and adds the mobile drawer trigger inside the header.
// ---------------------------------------------------------------------------

function LnMastheadWithBell({
  unreadCount,
  ...props
}: Omit<Parameters<typeof LnMasthead>[0], "notificationCount"> & {
  unreadCount: number;
}) {
  const nav: NavEntry[] = (props.nav ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    active: item.active ?? false,
    badge: item.key === "notificaciones" && unreadCount > 0 ? unreadCount : undefined,
  }));

  return (
    <header
      className={[
        "flex flex-shrink-0 items-center gap-[18px] bg-[var(--color-ln-azul-900)] px-[32px] py-[12px] text-white",
      ].join(" ")}
    >
      {/* Mobile hamburger — hidden on md+ */}
      <LnOwnerMobileDrawer nav={nav} unreadCount={unreadCount} />

      {/* Crest */}
      <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full border-[2px] border-white/50 bg-white/[0.06] font-[var(--font-ln-serif)] text-[17px] font-semibold tracking-[-0.02em]">
        {props.crest ?? "R"}
      </div>

      {/* Wordmark */}
      <div className="flex-shrink-0 leading-[1.1]">
        <span className="block font-[var(--font-ln-serif)] text-[19px] font-semibold tracking-[-0.01em]">
          {props.wordmark ?? "Libreta Nacional"}
        </span>
        <span className="block font-[var(--font-ln-mono)] text-[9.5px] uppercase tracking-[.22em] text-[var(--color-ln-celeste)]">
          {props.wordmarkSub ?? "REGISTRO SANITARIO"}
        </span>
      </div>

      {/* Nav — desktop only */}
      {props.nav && props.nav.length > 0 && (
        <nav
          aria-label="Navegación principal"
          className="ml-[24px] hidden items-center gap-[4px] md:flex"
        >
          {props.nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={[
                "rounded-[4px] px-[14px] py-[8px] text-[13px] font-medium tracking-[.01em] no-underline transition-colors",
                item.active
                  ? "bg-white/10 text-white shadow-[inset_0_-2px_0_var(--color-ln-celeste)]"
                  : "text-white/70 hover:text-white",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-[16px]">
        {/* Bell — real link */}
        <Link
          href="/notificaciones"
          aria-label={
            unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"
          }
          className="relative text-white/80 transition-colors hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden="true"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-[7px] -top-[5px] min-w-[15px] rounded-full bg-[var(--color-ln-celeste)] px-[4px] text-center font-[var(--font-ln-mono)] text-[9px] font-bold leading-[15px] text-[var(--color-ln-azul-900)]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        {/* Avatar + username */}
        <div className="flex items-center gap-[9px] border-l border-white/[0.18] pl-[16px]">
          <Link
            href="/cuenta"
            className="flex items-center gap-[9px] no-underline transition-opacity hover:opacity-80"
          >
            <div className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full bg-[var(--color-ln-celeste)] font-[var(--font-ln-mono)] text-[12px] font-semibold text-[var(--color-ln-azul-900)]">
              {props.avatarInitials ?? "U"}
            </div>
            <span className="hidden text-[12.5px] font-medium md:block">
              {props.userName ?? ""}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
