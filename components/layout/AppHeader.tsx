import Link from "next/link";

import { BRANDING } from "@/lib/branding";

import { GobStripe } from "./GobStripe";
import { HeaderNav, type NavItem } from "./HeaderNav";

/**
 * Header liviano de MiMAR con identidad oficial sutil.
 *
 * Estructura:
 *   ▔▔▔▔▔▔▔  cinta argentina celeste-blanco-celeste (4px)
 *   [logo MiMAR · tagline]   [nav: Inicio · Adoptar · Denuncias · Libreta]   [Mi cuenta]
 *
 * Server Component. La nav (active state + drawer mobile) vive en HeaderNav (client).
 */

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/adoptar", label: "Adoptar", matchPrefix: "/adoptar" },
  { href: "/denuncias", label: "Denuncias", matchPrefix: "/denuncias" },
  { href: "/libreta", label: "Mi libreta", matchPrefix: "/libreta" },
];

type Props = {
  /** Si el usuario está logueado, mostramos su nombre + acceso a cuenta. */
  user?: { name: string; href?: string } | null;
  /** Items del nav principal. Default: rutas públicas comunes. */
  nav?: NavItem[];
};

export function AppHeader({ user, nav = DEFAULT_NAV }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white">
      <GobStripe />

      <div className="border-b border-ln-line">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6">
          {/* Marca */}
          <Link
            href="/"
            className="group flex items-center gap-2 no-underline"
            aria-label={`${BRANDING.appName} — ${BRANDING.appNameLong}, ir al inicio`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRANDING.logoSrc} alt={BRANDING.appName} className="h-8 w-auto" />
            <span className="hidden text-xs text-ln-mute sm:inline">{BRANDING.appNameLong}</span>
          </Link>

          <HeaderNav nav={nav} user={user} />
        </div>
      </div>
    </header>
  );
}

export type { NavItem };
