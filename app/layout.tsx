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

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["500", "600"],
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
  weight: ["400", "600"],
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

export const metadata: Metadata = {
  // metadataBase: set by landing task
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
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally omitted — disabling zoom violates WCAG 1.4.4 (Resize Text).
  // Ley 26.653 / Disp. ONTI 6/2019 mandates WCAG 2.1 AA for Argentine gov-adjacent systems.
  // Single value only (no dark variant): dark mode is explicitly disabled in this
  // redesign — the app is light-only (see "Dark mode desactivado" note in globals.css).
  themeColor: "#ffffff",
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
