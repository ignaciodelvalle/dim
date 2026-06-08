import type { Metadata, Viewport } from "next";
import { Caveat, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";

import { Toaster } from "@/components/poncho/Toast";

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
  maximumScale: 1,
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
