"use client";

// Toast — thin wrapper around sonner that sets the DIM defaults (position,
// auto-dismiss, theme) so consumers don't have to think about them.
// Sprint 6 PR-052.
//
// Usage:
//   import { Toaster, toast } from "@/components/poncho/Toast";
//   <Toaster />        ← mounted once in app/layout.tsx
//   toast.success("Vacuna registrada")
//   toast.error("Sesión expirada", { duration: 7000 })
//   toast.info("Listo")
//
// We re-export `toast` from sonner directly so existing patterns (e.g.
// `toast.promise`, `toast.dismiss`) keep working. The Toaster is our
// configured one.

import { Toaster as SonnerToaster, toast } from "sonner";

export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      // 4s for normal toasts, 7s for errors — sonner honors a per-toast
      // duration override, but this is the default.
      duration={4000}
      richColors
      closeButton
      // top-center on mobile, top-right on desktop. sonner doesn't have a
      // built-in switch so we leave it at top-center for both; works on
      // narrow viewports + doesn't hijack desktop scrollbars either.
    />
  );
}
