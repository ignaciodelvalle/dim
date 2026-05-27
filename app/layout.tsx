import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/poncho/Toast";

import "./globals.css";

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
    <html lang="es-AR">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
