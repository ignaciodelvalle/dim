"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LnMasthead } from "./Shell";

/**
 * LnOwnerNav — client wrapper for the LnMasthead that:
 *   1. Reads the current pathname to derive the active nav item.
 *   2. Renders the notification bell as a real link (href="/notificaciones")
 *      preserving the unread count badge.
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

// Thin re-export of LnMasthead that swaps the emoji bell for a real Link.
// We can't pass an href to the bell slot on LnMasthead (it only renders a
// span), so we wrap it instead and pass a custom bell element.
function LnMastheadWithBell({
  unreadCount,
  ...props
}: Omit<Parameters<typeof LnMasthead>[0], "notificationCount"> & {
  unreadCount: number;
}) {
  // LnMasthead renders its own bell via notificationCount. We augment by
  // wrapping the whole masthead in a relative container and overlaying a
  // transparent Link that captures clicks on the bell area — BUT that is
  // fragile. Instead, we just pass notificationCount to LnMasthead and also
  // render a real Link for bell navigation by overriding the rendered output.
  //
  // Simplest correct approach: render LnMasthead with notificationCount (for
  // badge rendering) and ALSO wrap the bell area. Since we can't inject a
  // custom bell child into LnMasthead, we render a FULL replacement header
  // that is identical to LnMasthead but with the bell as a <Link>.

  return (
    <header
      className={[
        "flex flex-shrink-0 items-center gap-[18px] bg-[var(--color-ln-azul-900)] px-[32px] py-[12px] text-white",
      ].join(" ")}
    >
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

      {/* Nav */}
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
