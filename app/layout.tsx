import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Encode_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Serif,
} from "next/font/google";

import { Toaster } from "@/components/Toaster";
import { BRANDING } from "@/lib/ui/branding";

import "./globals.css";

// ---------- Encode Sans (gob.ar portals — the default --font-sans) ----------
// Loaded via next/font/google (self-hosted by Next at build time, served from
// /_next/static). Replaces the old @font-face that pointed at
// /fonts/encode-sans/*.ttf — files that were never committed, so every page 404'd
// on them and fell back to system fonts. Exposed as a CSS var wired to
// --font-sans in globals.css.
const encodeSans = Encode_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--encode-sans-font",
  display: "swap",
});

// ---------- Libreta Nacional typefaces (IBM Plex family + Caveat) ----------
// Exposed as CSS vars and wired into Tailwind @theme as --font-ln-* tokens.

// Weight lists are a CONTRACT with the utility classes the app actually uses.
// A weight that is requested but not loaded does not fail — the browser silently
// falls back to the nearest loaded face (CSS Fonts 4 §5.2 matching), so
// `font-bold` on a serif element rendered 600 and `font-medium` on a mono
// element rendered 400. Nothing errors, nothing lints; only a computed-style
// read catches it. Before adding a weight utility to a font-ln-* element, check
// that the weight is in the list below. Guarded by
// __tests__/font-weight-contract.test.ts, which re-derives the requested set
// from the source and fails on any weight that is asked for but not loaded.

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  // 700: `font-bold` on font-ln-serif (LostCaseBlock's lost-pet initial, the
  // design-tokens page h1) used to render 600.
  weight: ["500", "600", "700"],
  variable: "--a-serif-font",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--a-sans-font",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  // 500: `.lp-ch-num`, `.lp-lib-y`, `.ln-band-title` and SuccessScreen's mono
  // labels used to render 400 (CSS matching for 500 tries 400 before 600).
  // 700: the whole operator micro-type tier (OpStatusPill / OpPill /
  // OpScopeChip / OpCodeBadge / OpCrumbs, CaseQueue headers, `.ln-ledlbl`,
  // `.lp-hcard-badge`) used to render 600 — including comments that read
  // "9px bold" over text that was not bold.
  weight: ["400", "500", "600", "700"],
  variable: "--a-mono-font",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--a-caveat-font",
  display: "swap",
});

const lnFontVars = [
  ibmPlexSerif.variable,
  ibmPlexSans.variable,
  ibmPlexMono.variable,
  caveat.variable,
].join(" ");

// --------------------------------------------------------------------------

// Single source of truth for the app's public origin (task #43 share-first
// lost flow). Same env var app/sitemap.ts and /p's generateMetadata resolve
// against — see docs/ops/production-deploy-plan.md "Site URL consistency".
// metadataBase only resolves relative metadata URLs (og:url, canonical
// links); it never touches the DB, so — unlike sitemap.ts's per-request
// resolveSiteUrl() — it's safe to read at module scope for every route's
// static metadata. Falls back to localhost for local dev/CI only; production
// must set NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${BRANDING.appName} — ${BRANDING.appNameLong}`,
  description:
    "La libreta sanitaria digital de tu mascota. Para encontrarse, para cuidarse, para ayudarnos a cuidar a todas.",
  applicationName: BRANDING.appName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRANDING.appName,
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally omitted — disabling zoom violates WCAG 1.4.4 (Resize Text).
  // Ley 26.653 / Disp. ONTI 6/2019 mandates WCAG 2.1 AA for Argentine gov-adjacent systems.
  // cover: let the installed PWA draw into the notch / home-indicator areas;
  // the pt-safe/pb-safe utilities in globals.css pad content back out of them
  // (native-mobile audit 2026-07-04 §2).
  viewportFit: "cover",
  // Single value only (no dark variant): dark mode is explicitly disabled in this
  // redesign — the app is light-only (see "Dark mode desactivado" note in globals.css).
  // #0e5a99 matches app/manifest.ts theme_color and the navy masthead so the
  // status bar doesn't flash white over the chrome (audit §6).
  themeColor: "#0e5a99",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={`${encodeSans.variable} ${lnFontVars}`}>
      <body>
        {/* Skip-to-main — first focusable element; visible on keyboard focus (WCAG 2.4.1). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ln-azul focus:shadow-md focus:outline focus:outline-2 focus:outline-ln-azul"
        >
          Ir al contenido principal
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
