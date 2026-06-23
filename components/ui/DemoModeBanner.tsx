// DemoModeBanner — subtle honest disclosure for demo environments.
//
// Activation: NEXT_PUBLIC_DEMO_MODE=true.
// Default: off — never appears in production.
// Mount once in app/admin/layout.tsx (reads the env flag server-side).
//
// Tone mirrors the existing "Datos de demostración" disclosure in
// components/panorama/PanoramaShell.tsx:79 — same design-token palette.

"use client";

// shouldShowDemoBanner is defined in the server-safe lib/demo-mode module so the
// server admin layout can import it too. Re-exported here for backward compat
// with existing consumers/tests that import it from this component.
export { shouldShowDemoBanner } from "@/lib/demo-mode";

interface DemoModeBannerProps {
  /** Pass process.env.NEXT_PUBLIC_DEMO_MODE === "true" from the layout. */
  enabled: boolean;
}

export function DemoModeBanner({ enabled }: DemoModeBannerProps) {
  if (!enabled) return null;

  return (
    <output
      aria-live="polite"
      className="block w-full border-b border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-1.5 text-center text-[11px] text-ln-op-ink-2"
    >
      <span className="font-semibold">Datos de demostración.</span> Entorno de muestra — los datos
      cargados son sintéticos y no representan casos reales.
    </output>
  );
}
