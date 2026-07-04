import type { MetadataRoute } from "next";

import { BRANDING } from "@/lib/ui/branding";

/**
 * PWA Fase A — installable manifest (native Next 15 route, zero deps).
 * Icons generated from public/logo-dim.png; see docs/design/handoffs/2026-07-04-pwa-gap-analysis.md.
 * theme_color / background_color mirror the app chrome tokens in app/globals.css
 * (--color-primary / --color-ln-azul and --color-background / --color-ln-paper).
 * Fase B (service worker / offline) is out of scope here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRANDING.appName,
    short_name: BRANDING.appName,
    description: "La libreta sanitaria digital de tu mascota, siempre a mano.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    lang: "es-AR",
    dir: "ltr",
    theme_color: "#0e5a99",
    background_color: "#fbfaf5",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
