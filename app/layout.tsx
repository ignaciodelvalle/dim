import type { Metadata, Viewport } from "next";
import { Caveat, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";

import { Toaster } from "@/components/Toaster";

import "./globals.css";

// ---------- Libreta Nacional typefaces (IBM Plex family + Caveat) ----------
// Exposed as CSS vars and wired into Tailwind @theme as --font-ln-* tokens.
// The existing Encode Sans (gob portals) is self-hosted; it is NOT removed.

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
  title: "MiMAR — Mi Mascota Argentina",
  description:
    "La libreta sanitaria digital de tu mascota. Para encontrarse, para cuidarse, para ayudarnos a cuidar a todas.",
  applicationName: "MiMAR",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally omitted — disabling zoom violates WCAG 1.4.4 (Resize Text).
  // Ley 26.653 / Disp. ONTI 6/2019 mandates WCAG 2.1 AA for Argentine gov-adjacent systems.
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={lnFontVars}>
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
