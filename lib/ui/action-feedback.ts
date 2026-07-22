"use client";

// action-feedback — the mutation-feedback convention companion to
// full-page-action-nav.ts / use-action-redirect.ts.
//
// WHY (audit-3-feedback §C1, 2026-07-21): sonner's <Toaster/> is mounted
// globally (components/Toaster.tsx) but before this file only had 2 real
// `toast.*` call sites in the whole app — the audit found ~85%+ of
// mutations give no explicit success feedback at all. This file is the
// convention fix, not a full sweep: it establishes ONE rule and adopts it
// on a handful of representative call sites so the pattern is provable and
// repeatable, rather than converting every mutation in one pass.
//
// THE RULE — exactly two sanctioned ways a mutation confirms success:
//
//   1. Full-page reload (`navigateAfterActionSuccess` / `useActionRedirect`,
//      lib/ui/full-page-action-nav.ts) — for actions that legitimately
//      navigate, or where the SSR page must re-render to stay truthful
//      (status pills, revoked/verified badges, business-rule CRUD lists).
//      The reload itself IS the confirmation. Do NOT also fire a toast on
//      top of a reload — the page changing and a toast both firing is a
//      double-signal for the same event, and the toast gets wiped by the
//      navigation anyway.
//   2. `notifySaved` / `notifyActionError` (this file) — for in-place
//      mutations that intentionally stay mounted after success (no reload,
//      no navigation). These need SOME explicit signal since nothing else
//      visibly changes; a lightweight toast is it. This can run ALONGSIDE
//      an existing persistent inline confirmation string (e.g. a result
//      panel that also states a substantive detail like "fue notificado")
//      — the toast is the immediate transient cue, the inline text is the
//      durable one; they're complementary, not redundant.
//
// Do not invent a third pattern (bespoke "Guardado" banners with no toast,
// silent success, etc.) without updating this doc comment — the whole
// point of §C1 was to stop the ad hoc per-component choice the audit found
// (full-reload vs inline-text-only vs toast, picked with no written rule).
//
// Usage:
//   import { notifySaved, notifyActionError } from "@/lib/ui/action-feedback";
//   notifySaved("Transferencia aceptada");
//   notifyActionError("No se pudo guardar. Probá de nuevo.");

import { toast } from "sonner";

/** Fires the standard success toast for an in-place (non-reloading) mutation. */
export function notifySaved(message = "Listo"): void {
  toast.success(message);
}

/** Fires the standard error toast for an in-place (non-reloading) mutation.
 * Most components already render an inline error string next to the
 * trigger (the form/field-level detail); reach for this only when there's
 * no better-placed inline error surface for the failure. */
export function notifyActionError(message: string): void {
  toast.error(message);
}
