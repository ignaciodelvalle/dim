"use client";

// CitizenTabBar — fixed bottom tab bar for the citizen PWA on mobile
// (native-mobile audit 2026-07-04 §1, TOP-5 #2).
//
// The single strongest "website vs app" signal: primary navigation moves from
// the hamburger drawer (2 taps) to persistent bottom tabs (1 tap), matching
// the native iOS/Android pattern. OWNER_NAV's 3 items map 1:1 onto tabs.
//
//   - Renders < md only; the masthead's inline nav owns md+ (desktop).
//   - Fixed to the viewport bottom with pb-safe so the tabs clear the iOS
//     home indicator (viewport-fit=cover).
//   - AppShell's citizen variant reserves matching bottom padding so content
//     and footer are never hidden behind the bar.
//   - aria-label matches the masthead nav ("Navegación principal") on purpose:
//     the two are never in the accessibility tree at the same time (this bar
//     is display:none on md+, the inline nav is display:none below md).
//
// Client component for the same reason as the masthead: usePathname() drives
// the active-tab highlight. No data fetching, no side effects.

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/components/layout/HeaderNav";
import { isNavItemActive } from "@/components/layout/nav-active";

// The pet-profile route is `/mis-mascotas/{DIM-token}` (and its sub-routes:
// /asistencia, /libreta, …). Pet public tokens always start with `DIM-`, so a
// prefix test cleanly separates a real profile from the reserved index children
// (/mis-mascotas/nueva, /postulaciones, /reclamar, /reclamar-dni). Returns the
// current pet's token when on any of its routes, else null.
function petTokenFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "mis-mascotas") return null;
  const token = segments[1];
  return token && /^DIM-/i.test(token) ? token : null;
}

// Stroke icons in the masthead bell's style (24 viewBox, strokeWidth 2).
// Mapped by href prefix; items without a mapping fall back to a neutral dot
// so a future nav item never renders a broken tab.
function TabIcon({ href }: { href: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
  };
  if (href.startsWith("/inicio")) {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 9.5 12 3l9 6.5" />
        <path d="M5 8.5V21h14V8.5" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  }
  if (href.startsWith("/mis-mascotas")) {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="5.5" cy="10.5" r="1.6" />
        <circle cx="9.4" cy="6.5" r="1.6" />
        <circle cx="14.6" cy="6.5" r="1.6" />
        <circle cx="18.5" cy="10.5" r="1.6" />
        <path d="M12 12c-2.9 0-5.5 2.4-5.5 5.1 0 1.7 1.3 2.9 3 2.9 1 0 1.7-.4 2.5-.4s1.5.4 2.5.4c1.7 0 3-1.2 3-2.9 0-2.7-2.6-5.1-5.5-5.1z" />
      </svg>
    );
  }
  if (href.startsWith("/denuncias")) {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <path d="M4 22v-7" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CitizenTabBar({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  if (nav.length === 0) return null;

  const navItems = nav.map((item) => {
    const active = isNavItemActive(item, pathname);
    return (
      <li key={item.href} className="min-w-0 flex-1">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={[
            "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 no-underline",
            "transition-colors active:opacity-70",
            active
              ? "text-[var(--color-ln-azul)]"
              : "text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink)]",
          ].join(" ")}
        >
          <TabIcon href={item.href} />
          <span
            className={[
              "w-full truncate text-center text-xs",
              active ? "font-semibold" : "font-medium",
            ].join(" ")}
          >
            {item.label}
          </span>
        </Link>
      </li>
    );
  });

  // "Asentar un hecho" lives in this EXISTING tab-bar slot — the mobile capture
  // affordance, not a second stacked fixed bar (PO 2026-07-12 #4). Inserted at
  // the visual centre so it reads as the emphasised primary action.
  //
  // owner-ia-redesign P4: on a pet-profile route the pet is already known, so
  // "Asentar" retargets to THAT pet's capture sheet (?sheet=anotar) — no picker,
  // no cross-route hop to /inicio. Everywhere else it keeps deep-linking to the
  // home capture card (#asentar), the pre-P4 behavior.
  const currentPetToken = petTokenFromPathname(pathname);
  const asentarHref = currentPetToken
    ? `/mis-mascotas/${currentPetToken}?sheet=anotar`
    : "/inicio#asentar";
  const asentar = (
    <li key="__asentar" className="min-w-0 flex-1">
      <Link
        href={asentarHref}
        className="flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 text-[var(--color-ln-azul)] no-underline transition-colors active:opacity-70"
      >
        <span
          aria-hidden="true"
          className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-ln-azul)] text-[var(--color-ln-card)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="w-full truncate text-center text-xs font-semibold">Asentar</span>
      </Link>
    </li>
  );
  navItems.splice(Math.ceil(navItems.length / 2), 0, asentar);

  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-ln-line)] bg-[var(--color-ln-card)] md:hidden"
    >
      <ul className="flex">{navItems}</ul>
    </nav>
  );
}
