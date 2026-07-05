"use client";

// AppCitizenMasthead — the citizen-variant masthead for the unified AppShell
// (Item 7, spec D5/D7/D8). Ports the LnOwnerNav masthead layout into the
// AppShell system and is driven entirely by resolveShellNav's output:
//
//   - `nav`        → the role nav (OWNER_NAV) for a logged-in citizen, or
//                    PUBLIC_NAV for an anonymous visitor (D3). Chosen server-side.
//   - `showReturn` → a guaranteed ≤1-click return to the role home (D4): the
//                    fix for the "logged-in user stranded on a public surface".
//   - `switcher`   → entitlement-filtered context destinations (D6).
//
// D5 disambiguation: the brand/wordmark links to the public landing `/`, while
// the role nav's own "Inicio" item points at the role home (`/inicio`). The two
// are intentionally distinct so "Inicio" never means two things at once.
//
// Client component: reads usePathname() for active-state highlighting and to
// drive the mobile drawer — the same thin pattern LnOwnerNav used. No data
// fetching or side effects; everything is passed in by the RSC layout.
//
// Strangler (Phase C): this replaces LnOwnerNav + AppHeader as the citizen
// chrome. The legacy components are NOT deleted here — Phase D removes them.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { logoutAction } from "@/app/actions/auth";
import type { NavItem } from "@/components/layout/HeaderNav";
import { isNavItemActive } from "@/components/layout/nav-active";
import { BRANDING } from "@/lib/ui/branding";
import type { SwitcherTarget } from "@/lib/ui/shell-nav";

type CitizenUser = {
  /** First name (or email prefix) shown next to the avatar. */
  name: string;
  /** Two-letter avatar initials. */
  initials: string;
};

type Props = {
  /** Resolved nav (OWNER_NAV for owners, PUBLIC_NAV for anon) — D3. */
  nav: NavItem[];
  /** The logged-in user pill, or null for an anonymous visitor. */
  user: CitizenUser | null;
  /** Unread-notification count for the bell badge (0 when anon / none). */
  unreadCount?: number;
  /** Guaranteed role-return affordance (D4). */
  showReturn?: boolean;
  /** Where the return points when showReturn is true. */
  returnHref?: string;
  /** Entitlement-filtered context-switcher destinations (D6). */
  switcher?: SwitcherTarget[];
  /**
   * True when the layout also renders CitizenTabBar (native-mobile audit §1):
   * primary nav lives in the bottom tabs on mobile, so the drawer drops the
   * primary items and only opens for secondary content (switcher / return).
   * With no secondary content the hamburger disappears entirely and the
   * masthead shrinks to brand + bell + avatar. Desktop (md+) is unchanged.
   */
  primaryNavInTabBar?: boolean;
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

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AppCitizenMasthead({
  nav,
  user,
  unreadCount = 0,
  showReturn = false,
  returnHref,
  switcher = [],
  primaryNavInTabBar = false,
}: Props) {
  const pathname = usePathname();

  // With the tab bar owning primary nav on mobile, the drawer only carries
  // secondary content — and disappears when there is none.
  const drawerNav = primaryNavInTabBar ? [] : nav;
  const hasDrawerContent =
    drawerNav.length > 0 || switcher.length > 0 || (showReturn && Boolean(returnHref));

  return (
    // pt-safe: with viewport-fit=cover the installed PWA draws under the iOS
    // status bar — max(0.75rem, safe-area-inset-top) keeps the row clear of it
    // while staying at the design's 12px everywhere else.
    <header className="pt-safe flex flex-shrink-0 items-center gap-[18px] bg-[var(--color-ln-azul-900)] px-4 py-3 text-white md:px-8">
      {/* Mobile hamburger — hidden on md+ where the inline nav shows, and
          omitted entirely when the tab bar owns primary nav and there is no
          secondary content left for the drawer. */}
      {hasDrawerContent && (
        <CitizenMobileDrawer
          nav={drawerNav}
          switcher={switcher}
          showReturn={showReturn}
          returnHref={returnHref}
        />
      )}

      {/* Brand/wordmark → public landing `/` (D5: distinct from the role Inicio). */}
      <Link
        href="/"
        className="flex flex-shrink-0 items-center gap-3 no-underline transition-opacity hover:opacity-90"
        aria-label={`${BRANDING.appName} — ${BRANDING.appNameLong}, ir al inicio`}
      >
        <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full border-[2px] border-white/50 bg-white/[0.06] font-[var(--font-ln-serif)] text-[17px] font-semibold tracking-[-0.02em]">
          m
        </span>
        <span className="leading-[1.1]">
          <span className="block font-[var(--font-ln-serif)] text-[19px] font-semibold tracking-[-0.01em]">
            {BRANDING.appName}
          </span>
          {/* Hidden below md: the wide letter-spacing (tracking-[.22em]) makes this
              line ~150px wide, which forces the header row past 320px viewports
              and causes document-level horizontal scroll. Same hidden/md:block
              pattern already used below for the user name. */}
          {/* celeste-100 (not celeste): on the azul-900 band, base celeste
              is ~4.0:1 at this 9.5px size — below WCAG 1.4.3's 4.5:1 (a11y
              audit 2026-07-04 §4). celeste-100 clears ~10:1 on the same bg. */}
          <span className="hidden font-[var(--font-ln-mono)] text-[9.5px] uppercase tracking-[.22em] text-[var(--color-ln-celeste-100)] md:block">
            MI MASCOTA ARGENTINA
          </span>
        </span>
      </Link>

      {/* Desktop nav — the resolved role/public items (D3). */}
      {nav.length > 0 && (
        <nav aria-label="Navegación principal" className="ml-6 hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-[var(--radius-sm)] px-3.5 py-2 text-[13px] font-medium tracking-[.01em] no-underline transition-colors",
                  active
                    ? "bg-white/10 text-white shadow-[inset_0_-2px_0_var(--color-ln-celeste)]"
                    : "text-white/70 hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-3.5">
        {/* Guaranteed role-return (D4) — the stranded-user escape hatch. Shown
            on desktop next to the user pill; the mobile drawer carries its own. */}
        {showReturn && returnHref && (
          <Link
            href={returnHref}
            className="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-white/25 px-3 py-1.5 text-[12.5px] font-medium text-white/85 no-underline transition-colors hover:border-white/50 hover:text-white md:inline-flex"
          >
            ← Volver a mi app
          </Link>
        )}

        {/* Context switcher (D6) — only entitled destinations, never empty. */}
        {switcher.length > 0 && <CitizenSwitcher switcher={switcher} />}

        {/* Notification bell — only meaningful for a logged-in citizen. */}
        {user && (
          <Link
            href="/notificaciones"
            aria-label={
              unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"
            }
            // min 44px touch box around the 18px glyph (WCAG 2.5.5); the
            // badge anchors to the inner span so it hugs the icon, not the box.
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/80 transition-colors hover:text-white active:text-white"
          >
            <span className="relative">
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
                  className="absolute -right-[7px] -top-[5px] min-w-[15px] rounded-full bg-[var(--color-ln-celeste)] px-1 text-center font-[var(--font-ln-mono)] text-[9px] font-bold leading-[15px] text-[var(--color-ln-azul-900)]"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
          </Link>
        )}

        {/* User menu (logged-in) → avatar dropdown with "Mi cuenta" + reliable
            "Cerrar sesión"; or a sign-in CTA (anonymous). Logout living in the
            masthead means it never depends on /cuenta rendering (task #50). */}
        {user ? (
          <CitizenUserMenu user={user} />
        ) : (
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-[18px] text-[13px] font-semibold text-[var(--color-ln-azul-900)] no-underline transition-opacity hover:opacity-90 active:opacity-80"
          >
            Iniciar sesión
          </Link>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// User menu (citizen variant) — the avatar pill opens a small dropdown with
// "Mi cuenta" and a reliable "Cerrar sesión". Putting logout here (global
// chrome) means signing out never depends on the /cuenta page rendering — the
// escape hatch when that route is degraded (task #50). Renders on every
// viewport, so mobile keeps a logout affordance even when the nav drawer is
// absent (tab bar owns primary nav).
// ---------------------------------------------------------------------------

function CitizenUserMenu({ user }: { user: CitizenUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative border-l border-white/[0.18] pl-4">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de cuenta"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-[9px] rounded-full no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <span className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full bg-[var(--color-ln-celeste)] font-[var(--font-ln-mono)] text-sm font-semibold text-[var(--color-ln-azul-900)]">
          {user.initials}
        </span>
        <span className="hidden text-[12.5px] font-medium md:block">{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-[var(--radius-md)] border border-ln-line bg-white py-1 shadow-md"
        >
          <Link
            href="/cuenta"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-[7px] text-[12.5px] text-ln-ink no-underline transition-colors hover:bg-ln-stripe"
          >
            Mi cuenta
          </Link>
          <div className="my-1 border-t border-ln-line-2" aria-hidden="true" />
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-[7px] text-left text-[12.5px] font-medium text-[var(--color-ln-err)] transition-colors hover:bg-ln-stripe"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context switcher (citizen variant) — D6. A lightweight popover listing the
// entitlement-filtered destinations resolved server-side. Mirrors the operator
// ContextSwitcher behavior but styled for the navy citizen masthead.
// ---------------------------------------------------------------------------

function CitizenSwitcher({ switcher }: { switcher: SwitcherTarget[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-white/25 px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors hover:border-white/50 hover:text-white"
      >
        Portales
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="opacity-70"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-[var(--radius-md)] border border-ln-line bg-white py-1 shadow-md"
        >
          {switcher.map((t) => (
            <Link
              key={t.key + t.href}
              href={t.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-[7px] text-[12.5px] text-ln-ink no-underline transition-colors hover:bg-ln-stripe"
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer (citizen variant) — D8. Left-side drawer mirroring the desktop
// nav, the return affordance, and the switcher for sub-md viewports.
// ---------------------------------------------------------------------------

function CitizenMobileDrawer({
  nav,
  switcher,
  showReturn,
  returnHref,
}: {
  nav: NavItem[];
  switcher: SwitcherTarget[];
  showReturn: boolean;
  returnHref?: string;
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
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-white/80 hover:text-white active:bg-white/10 md:hidden"
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
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5">
            <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-full border border-white/30 bg-white/[0.06] font-[var(--font-ln-serif)] text-[15px] font-semibold">
              m
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-[var(--font-ln-serif)] text-[15px] font-semibold">
                {BRANDING.appName}
              </span>
              <span className="font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--color-ln-celeste-100)]">
                MI MASCOTA ARGENTINA
              </span>
            </span>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Cerrar menú"
                className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white active:bg-white/10"
              >
                <CloseIcon />
              </button>
            </Drawer.Close>
          </div>

          {/* Nav items — omitted (spacer keeps the foot pinned) when the
              bottom tab bar owns primary nav and the drawer only carries the
              switcher/return foot. */}
          {nav.length === 0 && <div className="flex-1" aria-hidden="true" />}
          {nav.length > 0 && (
            <nav
              aria-label="Navegación principal"
              className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
            >
              {nav.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex min-h-11 items-center gap-2.5 rounded-[5px] px-3 py-2",
                      "text-[13px] no-underline transition-colors",
                      active
                        ? "border-l-2 border-[var(--color-ln-celeste)] bg-white/10 font-semibold text-white"
                        : "border-l-2 border-transparent text-white/75 hover:bg-white/5 hover:text-white active:bg-white/10",
                    ].join(" ")}
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Switcher + return at the foot of the drawer. */}
          {(switcher.length > 0 || (showReturn && returnHref)) && (
            <div className="flex flex-col gap-0.5 border-t border-white/10 px-2 py-3">
              {showReturn && returnHref && (
                <Link
                  href={returnHref}
                  className="flex min-h-11 items-center rounded-[5px] px-3 py-2 text-[13px] font-medium text-white/85 no-underline hover:bg-white/5 hover:text-white active:bg-white/10"
                >
                  ← Volver a mi app
                </Link>
              )}
              {switcher.map((t) => (
                <Link
                  key={t.key + t.href}
                  href={t.href}
                  className="flex min-h-11 items-center rounded-[5px] px-3 py-2 text-[13px] text-white/75 no-underline hover:bg-white/5 hover:text-white active:bg-white/10"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
